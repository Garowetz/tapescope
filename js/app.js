// UI wiring. Talks to the video only through the player adapter and to saved
// games only through the storage adapters. Clip timing rules are in clips.js.

import {
  BEFORE_OPTIONS, AFTER_OPTIONS, NUDGE_STEPS, CATEGORIES, END_PREVIEW,
  normalizeSettings, createClip, resetWindow, setStart, setEnd,
  formatTime, parseTime, categoryLabel,
} from './clips.js?v=14';
import { newGame } from './game.js?v=14';
import { parseRosterText, playerLabel, loadTeam, saveTeam } from './roster.js?v=14';
import { createRosterPage } from './team.js?v=14';
import { createYouTubePlayer, parseYouTubeUrl } from './players/youtube.js?v=14';
import { localStore } from './storage/local.js?v=14';
import { fileStore } from './storage/file.js?v=14';
import { linkStore, LONG_LINK } from './storage/link.js?v=14';
import { createPresenter } from './present.js?v=14';
import { teamStore } from './storage/team.js?v=14';
import { createTeamSync, mergeUnsaved } from './team-sync.js?v=14';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const set = (sel, text) => { const el = document.querySelector(sel); if (el) el.textContent = text; };

const SETTINGS_KEY = 'tapescope.settings';
const COACH_KEY = 'tapescope.coach';
const TEAM_KEY = 'tapescope.teamLogin';     // { id, name } of the team this browser uses
const TEAM_GAME_KEY = 'tapescope.teamGame'; // { team, game } the team game last open here
const RATES = [0.25, 0.5, 1, 1.5, 2];
const RATE_LABELS = { 0.25: '¼×', 0.5: '½×', 1: '1×', 1.5: '1½×', 2: '2×' };
const DOUBLE_TAP_MS = 1500;  // a second identical press this soon is ignored
const AWAY_SECONDS = 5;      // how far the video must have moved to offer "back to where I was"

const state = {
  game: newGame(),
  settings: loadSettings(),
  tab: 'clip',       // 'clip' (Review) or 'trim' (Clips)
  selectedId: null,
  undoStack: [],     // ids of clips made this sitting, newest last
  playing: null,     // { id, entered } while a clip is playing to its end
  lastAdd: null,     // { id, at, time, category } of the newest clip, for double-tap handling
  newSinceTrim: false,
  watchAt: null,     // where the coach was in the game when they left the Clip tab
  duration: 0,
  view: null,        // { id, from, to } the stretch of game the trim timeline shows
  drag: null,        // { edge } while a start or end handle is being dragged
  team: null,        // { id, name, store, sync, saving } while signed in to a team
};
const isEditTab = (tab = state.tab) => tab === 'trim';

const player = createYouTubePlayer($('#player'));

const presenter = createPresenter({
  player,
  getGame: () => state.game,
  getSelectedId: () => state.selectedId,
  select: (id, opts) => selectClip(id, opts),
  playClip: (clip, from) => playClip(clip, from),
  stopClip: () => { state.playing = null; },
  toast: (msg) => toast(msg),
  onExit: () => {
    // Come back to the clip you finished on.
    if (clips().length) state.tab = 'trim';
    renderAll();
  },
});

const rosterPage = createRosterPage({
  getRoster: () => state.game.roster,
  setRoster: (roster) => setRoster(roster),
  toast: (msg) => toast(msg),
  importFile: () => $('#file-roster').click(),
  onClose: () => renderAll(),
});

// One roster for the team: it goes into the current game (so a saved game file
// carries it) and is kept in this browser for the next game.
function setRoster(roster) {
  state.game.roster = roster;
  saveTeam(roster);
  saveTeamRoster(roster);
  changed();
  renderChrome();
  renderEditor();
}

// ---------- phone Back button ----------
// Opening a pop-up, the roster page or presentation mode adds one history entry,
// so the phone's Back button closes it instead of leaving the site.
let backArmed = false;
function armBack() {
  if (backArmed) return;
  history.pushState({ tapescope: 'open' }, '');
  backArmed = true;
}
const nativeShowModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function showModal() {
  armBack();
  return nativeShowModal.call(this);
};
window.addEventListener('popstate', () => {
  backArmed = false;
  const dialogs = $$('dialog[open]');
  if (dialogs.length) {
    dialogs[dialogs.length - 1].close();
    if (presenter.isActive() || rosterPage.isOpen()) armBack();
    return;
  }
  if (presenter.isActive()) { presenter.exit(); return; }
  if (rosterPage.isOpen()) { rosterPage.close(); return; }
  history.back(); // nothing open: Back means leave, as usual
});

// ---------- theme ----------

const THEME_KEY = 'tapescope.theme';
const THEMES = ['dark', 'light', 'system'];
const THEME_NAMES = { dark: 'Dark', light: 'Light', system: 'System' };
const lightQuery = matchMedia('(prefers-color-scheme: light)');
const getTheme = () => (THEMES.includes(document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : 'dark');

function syncThemeColor() {
  const t = getTheme();
  const light = t === 'light' || (t === 'system' && lightQuery.matches);
  $('meta[name="theme-color"]').content = light ? '#eef1f5' : '#15181e';
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  syncThemeColor();
}
lightQuery.addEventListener('change', syncThemeColor);
syncThemeColor();

// ---------- helpers ----------

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)));
  } catch {
    return normalizeSettings(null);
  }
}

function loadCoach() {
  try { return (localStorage.getItem(COACH_KEY) || '').trim(); } catch { return ''; }
}
let coach = loadCoach();
function saveCoach(name) {
  coach = name.trim().slice(0, 40);
  try { localStorage.setItem(COACH_KEY, coach); } catch { /* ignore */ }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* ignore */ }
}

let toastTimer = null;
function toast(message, { action, onAction, ms = 3500 } = {}) {
  const el = $('#toast');
  el.textContent = '';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  el.classList.toggle('has-action', !!action);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action;
    btn.addEventListener('click', () => { el.classList.remove('show'); onAction(); });
    el.append(btn);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// In a team, games live in the team's copy (cached on the device by the team
// store), so this browser's own autosave keeps the last local game untouched.
function saveLocal(game) {
  if (!state.team) localStore.save(game);
}

let saveTimer = null;
function changed() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveLocal(state.game), 250);
  if (state.team) state.team.sync.changed();
}

const clips = () => state.game.clips;
const selected = () => clips().find((c) => c.id === state.selectedId) || null;
const clipName = (clip, index) => clip.title || `Clip ${index + 1}`;
const windowText = () => `${state.settings.before}s before, ${state.settings.after}s after`;
const lastUndoable = () => {
  for (let i = state.undoStack.length - 1; i >= 0; i--) {
    const index = clips().findIndex((c) => c.id === state.undoStack[i]);
    if (index >= 0) return { clip: clips()[index], index };
  }
  return null;
};

// Asks before a game with clips is replaced, offering to save a copy first.
// Resolves true to go ahead, false to stay.
function okToReplace() {
  if (!clips().length) return Promise.resolve(true);
  // A team game is already saved for the team: nothing to lose.
  if (state.team && state.team.sync.gameId) {
    state.team.sync.flush();
    return Promise.resolve(true);
  }
  const n = clips().length;
  $('#replace-body').textContent =
    `${state.game.title || 'This game'} has ${n} clip${n === 1 ? '' : 's'}. Save a copy first so you can get it back.`;
  const dlg = $('#dlg-replace');
  return new Promise((resolve) => {
    let answer = '';
    const onClick = (e) => {
      const b = e.target.closest('[data-answer]');
      if (!b) return;
      answer = b.dataset.answer;
      dlg.close();
    };
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('close', () => {
      dlg.removeEventListener('click', onClick);
      if (answer === 'save') fileStore.save(state.game);
      resolve(answer !== '');
    }, { once: true });
    dlg.showModal();
  });
}

// ---------- playback ----------

function playClip(clip, from = clip.start) {
  if (!player.isReady()) return;
  state.playing = { id: clip.id, entered: false };
  player.seek(from);
  player.play();
}

// The clip end is enforced here, on the ~200 ms tick, for every player adapter.
// "entered" guards against the stale time a player can report just after a seek.
player.onTime((t) => {
  $('#time').textContent = formatTime(t);
  const duration = player.getDuration();
  if (duration !== state.duration) {
    state.duration = duration;
    $('#duration').textContent = duration > 0 ? formatTime(duration) : '';
    renderTape();
  }
  const playing = player.isPlaying();
  const playBtn = $('#btn-play');
  if (playBtn.classList.contains('is-playing') !== playing) {
    playBtn.classList.toggle('is-playing', playing);
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  renderScrub(t);
  syncMute(); // also catches muting from inside YouTube's own player
  presenter.tick(t, playing);
  const head = $('#tape-head');
  if (head && duration > 0) head.style.left = `${clamp01(t / duration) * 100}%`;
  if (!state.playing) return;
  const clip = clips().find((c) => c.id === state.playing.id);
  if (!clip) { state.playing = null; return; }
  if (t < clip.end) state.playing.entered = true;
  else if (state.playing.entered) {
    player.pause();
    state.playing = null;
    presenter.clipEnded(clip);
  }
});

player.onError((message) => toast(message, { ms: 8000 }));

function loadVideo(startAt = 0) {
  const src = state.game.source;
  if (src) player.load(src.id, startAt);
}

// ---------- clip it ----------

function flash(category) {
  const btn = document.querySelector(`[data-clip="${category}"]`);
  if (!btn) return;
  btn.classList.remove('flash');
  void btn.offsetWidth; // restart the animation
  btn.classList.add('flash');
}

function addClip(category) {
  if (!state.game.source || !player.isReady()) {
    toast('The video is still loading.');
    return;
  }
  const now = Date.now();
  const time = player.getTime();
  const last = state.lastAdd;
  const lastClip = last && clips().find((c) => c.id === last.id);
  if (lastClip) {
    // A double tap is one clip, not two.
    if (now - last.at < DOUBLE_TAP_MS && last.category === category) return;
  }
  const clip = createClip(time, state.settings, player.getDuration(), category);
  if (coach) clip.by = coach;
  clips().push(clip);
  state.undoStack.push(clip.id);
  state.lastAdd = { id: clip.id, at: now, time, category };
  state.selectedId = clip.id;
  state.newSinceTrim = true;
  state.watchAt = null;
  changed();
  renderAll();
  flash(category);
}

function undoLastClip() {
  const last = lastUndoable();
  if (!last) return;
  state.undoStack = state.undoStack.filter((id) => id !== last.clip.id);
  state.lastAdd = null;
  removeClip(last.clip.id);
}

function removeClip(id) {
  const i = clips().findIndex((c) => c.id === id);
  if (i < 0) return null;
  const [clip] = clips().splice(i, 1);
  if (state.playing && state.playing.id === id) state.playing = null;
  if (state.selectedId === id) {
    const next = clips()[Math.min(i, clips().length - 1)];
    state.selectedId = next ? next.id : null;
  }
  changed();
  renderAll();
  return { clip, index: i };
}

function deleteClip(id) {
  const removed = removeClip(id);
  if (!removed) return;
  toast('Clip deleted', {
    action: 'Undo',
    ms: 7000,
    onAction: () => {
      clips().splice(Math.min(removed.index, clips().length), 0, removed.clip);
      state.selectedId = removed.clip.id;
      changed();
      renderAll();
    },
  });
}

// ---------- tabs ----------

const phonePortrait = matchMedia('(max-width: 719px) and (orientation: portrait)');
function showEditorOnPhone() {
  if (phonePortrait.matches && isEditTab()) {
    window.scrollTo({ top: $('.bar').offsetHeight, behavior: 'smooth' });
  }
}

function setTab(tab, { cue = true } = {}) {
  if (tab === state.tab) return;
  if (state.tab === 'clip' && player.isReady() && player.getTime() > 1) state.watchAt = player.getTime();
  const wasEditing = isEditTab();
  state.tab = tab;
  if (isEditTab(tab) && !wasEditing) {
    if (clips().length && (state.newSinceTrim || !selected())) state.selectedId = clips()[0].id;
    state.newSinceTrim = false;
    const clip = selected();
    // Bring the video to the clip being trimmed, so "Set start here" means something.
    if (cue && clip && player.isReady()) {
      state.playing = null;
      player.pause();
      player.seek(clip.start);
    }
  }
  renderAll();
  showEditorOnPhone();
}

// ---------- rendering ----------

function renderAll() {
  renderChrome();
  renderTabs();
  renderList();
  renderTape();
  renderEditor();
}

function renderChrome() {
  const g = state.game;
  const hasVideo = !!g.source;
  document.body.classList.toggle('has-video', hasVideo);
  $('#welcome').hidden = hasVideo;
  $('#workspace').hidden = !hasVideo;
  $('#btn-share').hidden = !hasVideo;
  $('#btn-present').hidden = !hasVideo || !clips().length;
  $('#title-wrap').hidden = !hasVideo;
  $$('[data-needs-video]').forEach((el) => { el.hidden = !hasVideo; });
  if (document.activeElement !== $('#game-title')) $('#game-title').value = g.title;
  document.title = g.title ? `${g.title} · Tape Scope` : 'Tape Scope Review';

  $('#roster-status').textContent = g.roster.length
    ? `${g.roster.length} player${g.roster.length === 1 ? '' : 's'} · type names, import or export`
    : 'Type in your players, or import a file';
  $('#window-status').textContent = `${coach ? `${coach} · ` : ''}${THEME_NAMES[getTheme()]} theme · clips ${state.settings.before}s before, ${state.settings.after}s after`;
  $('#clip-window').textContent = `Saves ${windowText()}`;
  renderTeamChrome();

  $$('.clip-count').forEach((count) => {
    count.hidden = !clips().length;
    count.textContent = clips().length;
  });

  $('#btn-sort').hidden = clips().length < 2;
  const total = clips().reduce((sum, c) => sum + (c.end - c.start), 0);
  $('#clips-sum').textContent = clips().length
    ? `${clips().length} clip${clips().length === 1 ? '' : 's'} · ${formatTime(total)} of video`
    : '';

  const last = lastUndoable();
  $('#btn-undo').hidden = !last;
  const tag = last && last.clip.category ? ` · ${categoryLabel(last.clip.category)}` : '';
  $('#clip-status').innerHTML = last
    ? `${icon('check')}<span>Clip ${last.index + 1} saved at ${formatTime(last.clip.mark)}${esc(tag)}</span>`
    : '<span>Press right after the play. You can trim it later.</span>';

  const back = $('#btn-back');
  const away = state.tab === 'clip' && state.watchAt != null && player.isReady()
    && Math.abs(player.getTime() - state.watchAt) > AWAY_SECONDS;
  back.hidden = !away;
  if (away) back.textContent = `Back to where I was (${formatTime(state.watchAt)})`;
}

function renderTabs() {
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === state.tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  $('#tab-clip').hidden = state.tab !== 'clip';
  $('#tab-trim').hidden = !isEditTab();
}

function renderList() {
  const list = $('#clip-list');
  if (!clips().length) {
    list.innerHTML = '<li class="empty">Your clips will show up here.</li>';
    return;
  }
  list.innerHTML = clips().map((c, i) => {
    const meta = [`${formatTime(c.start)} – ${formatTime(c.end)}`];
    if (c.category) meta.push(categoryLabel(c.category));
    if (c.players.length) meta.push(c.players.map((n) => '#' + n).join(' '));
    if (c.by) meta.push(c.by);
    return `
    <li><button type="button" class="clip-item cat-${esc(c.category)}${c.id === state.selectedId ? ' selected' : ''}" data-id="${esc(c.id)}">
      <span class="ci-num">${i + 1}</span>
      <span class="ci-main">
        <span class="ci-title${c.title ? '' : ' untitled'}">${esc(clipName(c, i))}</span>
        <span class="ci-meta">${esc(meta.join(' · '))}</span>
      </span>
      <span class="ci-len">${c.end - c.start}s</span>
    </button></li>`;
  }).join('');
}

// The whole game as one strip, with each clip where it happened.
function renderTape() {
  const tape = $('#tape');
  const d = state.duration;
  tape.hidden = !(d > 0 && clips().length);
  if (tape.hidden) return;
  tape.innerHTML = clips().map((c, i) => `
    <button type="button" class="tape-seg cat-${esc(c.category)}${c.id === state.selectedId ? ' selected' : ''}" data-id="${esc(c.id)}"
      style="left:${clamp01(c.start / d) * 100}%;width:calc(${clamp01((c.end - c.start) / d) * 100}% + 6px)"
      aria-label="${esc(clipName(c, i))}, ${formatTime(c.start)}" title="${esc(clipName(c, i))} · ${formatTime(c.start)}"></button>`).join('')
    + `<span class="tape-head" id="tape-head" style="left:${clamp01(player.getTime() / d) * 100}%"></span>`;
}

function renderEditor() {
  const box = $('#tab-trim');
  const clip = selected();
  if (!clip) {
    box.innerHTML = '<p class="empty">No clips yet. Go to Review and press Clip it while you watch the game.</p>';
    return;
  }
  const index = clips().indexOf(clip);
  const first = index === 0;
  const last = index === clips().length - 1;
  const options = clips().map((c, i) => `<option value="${esc(c.id)}"${c === clip ? ' selected' : ''}>${esc(pickLabel(c, i))}</option>`).join('');

  box.innerHTML = `
    <div class="editor cat-${esc(clip.category)}">
      <div class="ed-timing">
        <div class="ed-head">
          <button type="button" class="icon-btn boxed" data-act="prev" aria-label="Previous clip (P)" ${first ? 'disabled' : ''}>${icon('chev-l')}</button>
          <div class="ed-title">
            <select id="ed-pick" data-pick aria-label="Clip ${index + 1} of ${clips().length}, pick another">${options}</select>
          </div>
          <button type="button" class="icon-btn boxed" data-act="next" aria-label="Next clip (N)" ${last ? 'disabled' : ''}>${icon('chev-r')}</button>
          <button type="button" class="btn ed-replay" data-act="replay" aria-label="Replay clip (R)">${icon('replay')}<span class="btn-label">Replay</span><kbd>R</kbd></button>
          <button type="button" class="icon-btn" data-act="more" aria-label="More for this clip: reorder, reset, delete" aria-haspopup="dialog">${icon('dots')}</button>
        </div>
        ${timing(clip)}
      </div>
      ${editorDetails(clip)}
    </div>`;
  renderTimes();
}

// "3: Nice breakout", or "3: Untitled · 12:34" while it has no title.
const pickLabel = (c, i) => `${i + 1}: ${c.title.trim() || `Untitled · ${formatTime(c.start)}`}`;
function renderPickLabel() {
  const clip = selected();
  const opt = $('#ed-pick option:checked');
  if (clip && opt) opt.textContent = pickLabel(clip, clips().indexOf(clip));
}

// A trim timeline like a video editor. The clip is the blue stretch between two
// handles, with its start and end times on the handles. Start controls sit on the
// left, end controls on the right.
function timing(clip) {
  const side = (edge) => {
    const word = edge === 'start' ? 'Start' : 'End';
    // Left column moves earlier, right column later, like the timeline above.
    const steps = [-5, 5, -1, 1];
    const nudges = steps.map((n) => `<button type="button" class="nudge" data-act="nudge" data-edge="${edge}" data-by="${n}"
      aria-label="${word} ${Math.abs(n)} second${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'earlier' : 'later'}">${n < 0 ? '−' : '+'}${Math.abs(n)}s</button>`).join('');
    return `
      <div class="tl-side ${edge}">
        <span class="label">${edge === 'start' ? '[ Start' : 'End ]'}</span>
        <div class="tl-nudges">${nudges}</div>
        <button type="button" class="btn primary" data-act="set-here" data-edge="${edge}">${icon('pin')}<span><span class="btn-pre">Set </span>${edge}<span class="btn-label"> here</span></span></button>
      </div>`;
  };
  return `
        <div class="tl" id="tl">
          <div class="tl-flags">
            <div class="tl-flag start" id="tl-fs" role="button" tabindex="0" data-act="type-edge" data-edge="start" aria-label="Start time, tap to type"><small>Start</small><b></b></div>
            <div class="tl-flag end" id="tl-fe" role="button" tabindex="0" data-act="type-edge" data-edge="end" aria-label="End time, tap to type"><small>End</small><b></b></div>
          </div>
          <div class="tl-track" id="tl-track">
            <div class="tl-ticks" id="tl-ticks"></div>
            <div class="tl-clip" id="tl-clip"></div>
            <div class="tl-mark" id="tl-mark" title="You clipped here"></div>
            <div class="tl-head" id="tl-head"></div>
            <span class="tl-handle start" id="tl-hs" data-handle="start" role="slider" tabindex="0" aria-label="Clip start, drag or use arrow keys"></span>
            <span class="tl-handle end" id="tl-he" data-handle="end" role="slider" tabindex="0" aria-label="Clip end, drag or use arrow keys"></span>
          </div>
          <div class="tl-scale"><span id="tl-from"></span><span id="tl-len"></span><span id="tl-to"></span></div>
        </div>
        <div class="tl-sides">${side('start')}${side('end')}</div>`;
}

function editorDetails(clip) {
  const g = state.game;
  const available = g.roster.filter((p) => !clip.players.includes(p.number)).sort((a, b) => a.number - b.number);
  const addPlayer = g.roster.length
    ? `<select data-add-player aria-label="Add a player">
         <option value="">Add a player</option>
         ${available.map((p) => `<option value="${p.number}">#${p.number} ${esc(p.name)}${p.position ? ' · ' + esc(p.position) : ''}</option>`).join('')}
       </select>`
    : `<form class="add-player" data-add-number>
         <input type="text" inputmode="numeric" placeholder="Jersey number" aria-label="Jersey number">
         <button class="btn">Add</button>
       </form>
       <button type="button" class="link" data-act="roster">Set up your team roster to pick players by name</button>`;
  return `
      <div class="ed-details">
        <label class="field"><span>Title</span>
          <input type="text" data-field="title" value="${esc(clip.title)}" placeholder="What happened?" autocomplete="off">
        </label>
        <label class="field"><span>Talking points</span>
          <textarea data-field="notes" rows="3" placeholder="What do you want the players to see?">${esc(clip.notes)}</textarea>
        </label>
        <div class="field"><span>Category</span>
          <div class="cats">
            ${CATEGORIES.filter((c) => c.id).map((c) => `<button type="button" class="cat${c.id === clip.category ? ' active' : ''}" data-act="category" data-cat="${c.id}" aria-pressed="${c.id === clip.category}"><span class="dot"></span>${c.label}</button>`).join('')}
          </div>
        </div>
        <div class="field"><span>Players</span>
          <div class="chips">${clip.players.map((n) => `<button type="button" class="chip" data-act="remove-player" data-number="${n}" aria-label="Remove ${esc(playerLabel(g.roster, n))}">${esc(playerLabel(g.roster, n))}</button>`).join('')}</div>
          ${addPlayer}
        </div>
      </div>`;
}

// The stretch of game the trim timeline shows: the clip plus some video either
// side, so there is room to drag a handle out. It holds still while you work on a
// clip (so you can see a handle move), and only widens when an edge gets near its end.
function timelineView(clip) {
  const v = state.view;
  const len = clip.end - clip.start;
  const room = Math.max(4, len * 0.12);
  if (v && v.id === clip.id && clip.start - v.from >= room && v.to - clip.end >= room) return v;
  if (v && v.id === clip.id && state.drag) return v; // never jump while dragging
  const pad = Math.max(10, Math.round(len * 0.4));
  const max = state.duration > 0 ? state.duration : Infinity;
  const from = Math.max(0, clip.start - pad);
  state.view = { id: clip.id, from, to: Math.min(max, clip.end + pad) };
  if (state.view.to - state.view.from < 2) state.view.to = state.view.from + 2;
  return state.view;
}

// Updates just the time text, so typing in other fields never loses focus.
function renderTimes() {
  const clip = selected();
  if (!clip) return;
  set('#seg-start', formatTime(clip.start));
  set('#seg-end', formatTime(clip.end));
  renderPickLabel();
  renderTimeline();
  renderScrub(player.getTime());
  renderList();
  renderTape();
  renderChrome();
}

function renderTimeline() {
  const clip = selected();
  const track = $('#tl-track');
  if (!clip || !track) return;
  const v = timelineView(clip);
  const span = v.to - v.from;
  const pct = (t) => clamp01((t - v.from) / span) * 100;
  const a = pct(clip.start);
  const z = pct(clip.end);
  $('#tl-clip').style.left = `${a}%`;
  $('#tl-clip').style.width = `${z - a}%`;
  $('#tl-hs').style.left = `${a}%`;
  $('#tl-he').style.left = `${z}%`;
  $('#tl-hs').setAttribute('aria-valuetext', formatTime(clip.start));
  $('#tl-he').setAttribute('aria-valuetext', formatTime(clip.end));
  const m = $('#tl-mark');
  m.hidden = clip.mark < v.from || clip.mark > v.to;
  m.style.left = `${pct(clip.mark)}%`;
  $('#tl-from').textContent = formatTime(v.from);
  $('#tl-to').textContent = formatTime(v.to);
  $('#tl-len').textContent = `${clip.end - clip.start}s clip${clip.by ? ` · ${clip.by}` : ''}`;

  // Tick every 5 seconds (10 or 30 on a long view), taller each minute.
  const every = span > 240 ? 30 : span > 100 ? 10 : 5;
  const ticks = [];
  for (let t = Math.ceil(v.from / every) * every; t <= v.to; t += every) {
    ticks.push(`<i style="left:${pct(t)}%"${t % 60 === 0 ? ' class="min"' : ''}></i>`);
  }
  $('#tl-ticks').innerHTML = ticks.join('');

  // Time flags sit above their handles: start reads to the left, end to the right,
  // so they never cover each other. They stay inside the track's width.
  const w = track.clientWidth;
  const place = (flag, x, side) => {
    if (!flag.querySelector('input')) flag.querySelector('b').textContent = formatTime(side === 'start' ? clip.start : clip.end);
    const fw = flag.offsetWidth;
    const px = (x / 100) * w;
    const left = side === 'start' ? px - fw + 6 : px - 6;
    flag.style.left = `${Math.max(0, Math.min(w - fw, left))}px`;
  };
  place($('#tl-fs'), a, 'start');
  place($('#tl-fe'), z, 'end');
}

function renderScrub(t) {
  const clip = selected();
  if (!clip) return;
  const head = $('#tl-head');
  if (head && state.view) {
    const v = state.view;
    head.hidden = t < v.from || t > v.to;
    head.style.left = `${clamp01((t - v.from) / (v.to - v.from)) * 100}%`;
  }
}

function selectClip(id, { play = true } = {}) {
  const clip = clips().find((c) => c.id === id);
  if (!clip) return;
  state.selectedId = id;
  renderList();
  renderTape();
  renderEditor();
  if (play) playClip(clip);
}

function step(delta) {
  const i = clips().indexOf(selected());
  const next = clips()[i + delta];
  if (next) selectClip(next.id);
}

// Opening a clip from the list or the tape: go to Trim, play it, keep the video in view.
function openClip(id) {
  setTab('trim', { cue: false });
  selectClip(id);
  if (phonePortrait.matches) showEditorOnPhone();
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- trim actions ----------

function moveClip(clip, delta) {
  const index = clips().indexOf(clip);
  const to = index + delta;
  if (to < 0 || to >= clips().length) return;
  clips().splice(index, 1);
  clips().splice(to, 0, clip);
  changed();
  renderAll();
}

// Sorting puts the clips in a new order everywhere (the list, the Clips arrows and
// picker, and presenting). Ties keep game order. Undo puts the old order back.
const CATEGORY_ORDER = { good: 0, 'needs-work': 1, teaching: 2 };
const SORTS = {
  time: { name: 'game time', key: () => 0 },
  category: { name: 'category', key: (c) => CATEGORY_ORDER[c.category] ?? 3 },
  player: { name: 'player number', key: (c) => (c.players.length ? Math.min(...c.players) : 1e6) },
};
function sortClips(by) {
  const sort = SORTS[by];
  if (!sort) return;
  const before = clips().slice();
  clips().sort((a, b) => (sort.key(a) - sort.key(b)) || (a.mark - b.mark) || (a.start - b.start));
  if (clips().every((c, i) => c === before[i])) return toast(`Already in order by ${sort.name}.`, { ms: 2200 });
  changed();
  renderAll();
  toast(`Sorted by ${sort.name}.`, {
    action: 'Undo',
    ms: 6000,
    onAction: () => {
      // Put back the old order by id, so a clip made or deleted since stays that way.
      const at = new Map(before.map((c, i) => [c.id, i]));
      const old = (c) => (at.has(c.id) ? at.get(c.id) : before.length);
      clips().sort((a, b) => old(a) - old(b));
      changed();
      renderAll();
    },
  });
}

function trimAction(act, el) {
  const clip = selected();
  if (!clip) return;
  const duration = player.getDuration();
  const edge = el.dataset.edge; // the start and end buttons name their edge

  switch (act) {
    case 'prev': return step(-1);
    case 'next': return step(1);
    case 'replay': return playClip(clip);
    case 'roster': return openRoster();
    case 'type-edge': {
      // Tap a time on the timeline to type it.
      if (el.querySelector('input')) return;
      const name = el.dataset.edge;
      el.querySelector('b').innerHTML = `<input type="text" inputmode="numeric" data-time data-edge="${name}" value="${formatTime(clip[name])}" aria-label="${name === 'start' ? 'Start' : 'End'} time">`;
      const input = el.querySelector('input');
      input.focus();
      input.select();
      return;
    }
    case 'more': {
      const index = clips().indexOf(clip);
      $('[data-clip-act="up"]').disabled = index === 0;
      $('[data-clip-act="down"]').disabled = index === clips().length - 1;
      $('#reset-hint').textContent = `Back to ${windowText()} the moment you clipped`;
      return $('#dlg-clip').showModal();
    }
    case 'set-here': {
      if (!player.isReady()) return toast('The video is still loading.');
      const t = Math.round(player.getTime());
      // Refuse rather than quietly squash the clip to one second.
      if (edge === 'start' && t >= clip.end) return toast("That's after this clip's end. Move the end first, or tap Replay.");
      if (edge === 'end' && t <= clip.start) return toast("That's before this clip's start. Move the start first, or tap Replay.");
      if (edge === 'start') setStart(clip, t, duration); else setEnd(clip, t, duration);
      toast(`${edge === 'start' ? 'Start' : 'End'} set to ${formatTime(clip[edge])}`, { ms: 1800 });
      break;
    }
    case 'nudge': {
      const by = Number(el.dataset.by);
      if (edge === 'start') {
        setStart(clip, clip.start + by, duration);
        playClip(clip);
      } else {
        setEnd(clip, clip.end + by, duration);
        playClip(clip, Math.max(clip.start, clip.end - END_PREVIEW));
      }
      break;
    }
    case 'category':
      // Tapping the active category again clears it back to untagged.
      clip.category = clip.category === el.dataset.cat ? '' : el.dataset.cat;
      changed();
      renderAll();
      return;
    case 'remove-player':
      clip.players = clip.players.filter((n) => n !== Number(el.dataset.number));
      changed();
      renderList();
      return renderEditor();
    default:
      return;
  }
  changed();
  renderTimes();
}

function clipMenuAction(act) {
  const clip = selected();
  if (!clip) return;
  if (act === 'up') moveClip(clip, -1);
  else if (act === 'down') moveClip(clip, 1);
  else if (act === 'delete') deleteClip(clip.id);
  else if (act === 'reset') {
    resetWindow(clip, state.settings, player.getDuration());
    changed();
    renderTimes();
    toast('Clip reset to its default window.', { ms: 1800 });
  }
}

function addPlayerToClip(number) {
  const clip = selected();
  if (!clip || !Number.isFinite(number) || number < 0) return;
  if (!clip.players.includes(number)) clip.players.push(number);
  changed();
  renderList();
  renderEditor();
}

// ---------- games ----------

// teamGameId: the team game this is (from the team's copy). Any other game set
// while in a team becomes a new team game as soon as it has a video.
function setGame(game, startAt = 0, teamGameId = null) {
  const team = state.team;
  if (team && team.sync.gameId !== teamGameId) {
    team.sync.flush(); // the game on screen is still the old one: save its last edits
    team.sync.detach();
  }
  state.game = game;
  state.selectedId = game.clips[0] ? game.clips[0].id : null;
  state.undoStack = [];
  state.playing = null;
  state.lastAdd = null;
  state.newSinceTrim = false;
  state.watchAt = null;
  saveLocal(game);
  renderAll();
  loadVideo(startAt);
  if (team && teamGameId) rememberTeamGame(teamGameId);
  else if (team && game.source) team.sync.changed();
}

function renderShare() {
  const url = linkStore.save(state.game, { includeNames: $('#share-names').checked });
  $('#share-url').textContent = url;
  $('#share-info').textContent = url.length > LONG_LINK
    ? 'This is a long link, and long links can get cut off in texts. For a copy that always works, use Save game file in the menu.'
    : 'Links can get cut off in texts. For a copy that always works, use Save game file in the menu.';
  return url;
}

function openShare() {
  if (!state.game.source) return toast('Load a video first.');
  $('#share-names').checked = false;
  renderShare();
  $('#share-native').hidden = !navigator.share;
  $('#dlg-share').showModal();
}

function renderSettings() {
  const fill = (box, options, value, key) => {
    const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
    box.innerHTML = all.map((n) => `<button type="button" data-key="${key}" data-v="${n}" class="${n === value ? 'active' : ''}" aria-pressed="${n === value}">${n}s</button>`).join('');
  };
  fill($('#set-before'), BEFORE_OPTIONS, state.settings.before, 'before');
  fill($('#set-after'), AFTER_OPTIONS, state.settings.after, 'after');
  const theme = getTheme();
  $$('[data-theme-pick]').forEach((b) => {
    b.classList.toggle('active', b.dataset.themePick === theme);
    b.setAttribute('aria-pressed', b.dataset.themePick === theme);
  });
}

// ---------- events ----------

// After a mouse or touch press, drop focus from the button so the Space bar goes
// back to play/pause instead of pressing that button again. Keyboard users keep focus.
document.addEventListener('click', (e) => {
  if (e.detail > 0) e.target.closest?.('button')?.blur();
});

// Dialogs: every pop-up gets an X in the corner, and tapping the dimmed area also
// closes it. Menu items close their menu first.
$$('dialog').forEach((dlg) => {
  dlg.insertAdjacentHTML('afterbegin',
    `<button type="button" class="dlg-x" data-close aria-label="Close">${icon('x')}</button>`);
});
$$('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]') || e.target.closest('.menu-item')) dlg.close();
  });
});
$('#btn-menu').addEventListener('click', () => $('#dlg-menu').showModal());
$('#dlg-clip').addEventListener('click', (e) => {
  const item = e.target.closest('[data-clip-act]');
  if (item) clipMenuAction(item.dataset.clipAct);
});

$$('.url-form').forEach((form) => form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = form.querySelector('input');
  const parsed = parseYouTubeUrl(input.value);
  if (!parsed) return toast('That does not look like a YouTube link.');
  const dlg = form.closest('dialog');
  if (dlg) dlg.close();
  const current = state.game.source;
  if (current && current.id !== parsed.id) {
    if (!(await okToReplace())) return;
    setGame({ ...newGame(), roster: state.game.roster, source: { type: 'youtube', id: parsed.id } }, parsed.t);
  } else {
    state.game.source = { type: 'youtube', id: parsed.id };
    changed();
    renderAll();
    loadVideo(parsed.t);
  }
  input.value = '';
  input.blur();
}));

$('#btn-video').addEventListener('click', () => $('#dlg-video').showModal());

$('#game-title').addEventListener('input', (e) => {
  state.game.title = e.target.value;
  document.title = e.target.value ? `${e.target.value} · Tape Scope` : 'Tape Scope Review';
  changed();
});
$('#game-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

$('#btn-new').addEventListener('click', async () => {
  if (!(await okToReplace())) return;
  newGameReload();
});

async function newGameReload() {
  if (state.team) {
    leaving = true;
    await state.team.sync.settle();
    writeJSON(TEAM_GAME_KEY, { team: state.team.id, game: 'new' });
  } else {
    localStore.save({ ...newGame(), roster: state.game.roster });
  }
  location.reload(); // simplest way to clear the old video out of the player
}

$('#btn-save').addEventListener('click', () => {
  if (!state.game.source) return toast('Nothing to save yet. Load a video first.');
  fileStore.save(state.game);
  toast('Game file downloaded.');
});

const pickGame = () => $('#file-game').click();
$('#btn-open').addEventListener('click', pickGame);
$$('[data-open-game]').forEach((b) => b.addEventListener('click', pickGame));
$('#file-game').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const game = await fileStore.load(file);
    if (!(await okToReplace())) return;
    state.tab = game.clips.length ? 'trim' : 'clip';
    setGame(game);
    toast(`Opened ${game.title || 'game'}: ${game.clips.length} clip${game.clips.length === 1 ? '' : 's'}.`);
  } catch (err) {
    toast(err.message);
  }
});

// Another coach's game file for the same video: their clips are added after
// yours. Clips already here (same id) are skipped, so merging twice is harmless.
$('#btn-merge').addEventListener('click', () => {
  if (!state.game.source) return toast('Load the game video first.');
  $('#file-merge').click();
});
$('#file-merge').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let other;
  try {
    other = await fileStore.load(file);
  } catch (err) {
    return toast(err.message);
  }
  const mine = state.game;
  if (!other.source || !mine.source || other.source.id !== mine.source.id) {
    return toast('That game file is for a different video. Both coaches need to clip the same YouTube link.', { ms: 6000 });
  }
  const have = new Set(mine.clips.map((c) => c.id));
  const added = other.clips.filter((c) => !have.has(c.id)).sort((a, b) => a.start - b.start);
  const skipped = other.clips.length - added.length;
  if (!added.length) {
    return toast(skipped ? `All ${skipped} of those clips are already here.` : 'That file has no clips.');
  }
  const before = mine.clips.slice();
  const rosterBefore = mine.roster;
  mine.clips.push(...added);
  if (!mine.roster.length && other.roster.length) mine.roster = other.roster;
  changed();
  renderAll();
  const names = [...new Set(added.map((c) => c.by).filter(Boolean))];
  const from = names.length ? ` from ${names.join(', ')}` : '';
  toast(`Added ${added.length} clip${added.length === 1 ? '' : 's'}${from}${skipped ? ` (${skipped} already here)` : ''}.`, {
    action: 'Undo',
    ms: 8000,
    onAction: () => {
      mine.clips.splice(0, mine.clips.length, ...before);
      mine.roster = rosterBefore;
      if (!selected()) state.selectedId = mine.clips[0] ? mine.clips[0].id : null;
      changed();
      renderAll();
    },
  });
});

function openRoster() {
  armBack();
  rosterPage.show();
}
$('#btn-roster').addEventListener('click', openRoster);
$('#file-roster').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const roster = parseRosterText(await file.text(), file.name);
    if (state.game.roster.length && !confirm(`Replace the ${state.game.roster.length} players on the roster with the ${roster.length} in this file?`)) return;
    setRoster(roster);
    if (rosterPage.isOpen()) rosterPage.render();
    toast(`Roster loaded: ${roster.length} players.`);
  } catch (err) {
    toast(err.message || 'That team file could not be read.');
  }
});

$('#btn-present').addEventListener('click', () => {
  presenter.enter();
  if (presenter.isActive()) armBack();
});

$('#btn-settings').addEventListener('click', () => {
  $('#set-coach').value = coach;
  renderSettings();
  $('#dlg-settings').showModal();
});
$('#set-coach').addEventListener('input', (e) => { saveCoach(e.target.value); renderChrome(); });
$('#set-coach').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('#dlg-settings').addEventListener('click', (e) => {
  const pick = e.target.closest('[data-theme-pick]');
  if (pick) {
    setTheme(pick.dataset.themePick);
    renderSettings();
    renderChrome();
    return;
  }
  const b = e.target.closest('[data-key]');
  if (!b) return;
  state.settings[b.dataset.key] = Number(b.dataset.v);
  saveSettings();
  renderSettings();
  renderChrome();
});

$('#btn-share').addEventListener('click', openShare);
$('#btn-share-2').addEventListener('click', openShare);
$('#share-names').addEventListener('change', renderShare);
$('#share-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#share-url').textContent);
    toast('Link copied.');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('#share-url'));
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('Link selected. Copy it from here.');
  }
});
$('#share-native').addEventListener('click', async () => {
  try {
    await navigator.share({ title: state.game.title || 'Tape Scope Review', url: $('#share-url').textContent });
  } catch { /* cancelled */ }
});

$$('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

$('#tab-clip').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-clip]');
  if (btn) addClip(btn.dataset.clip);
});
$('#btn-undo').addEventListener('click', undoLastClip);
$('#btn-back').addEventListener('click', () => {
  if (state.watchAt == null) return;
  state.playing = null;
  player.seek(state.watchAt);
  player.play();
  state.watchAt = null;
  renderChrome();
});

const openFromEvent = (e) => {
  const item = e.target.closest('[data-id]');
  if (item) openClip(item.dataset.id);
};
$('#clip-list').addEventListener('click', openFromEvent);
$('#btn-sort').addEventListener('click', () => $('#dlg-sort').showModal());
$('#dlg-sort').addEventListener('click', (e) => {
  const item = e.target.closest('[data-sort]');
  if (!item) return;
  $('#dlg-sort').close();
  sortClips(item.dataset.sort);
});

// On a wide screen the game strip sits under the video, in the room the video
// leaves; elsewhere it heads the clip list.
const wideQuery = matchMedia('(min-width: 1024px) and (min-height: 521px)');
function placeTape() {
  if (wideQuery.matches) $('.stage').append($('#tape'));
  else $('.clips-head').after($('#tape'));
}
wideQuery.addEventListener('change', placeTape);
placeTape();
$('#tape').addEventListener('click', openFromEvent);

const trimBox = $('#tab-trim');
trimBox.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el) trimAction(el.dataset.act, el);
});

trimBox.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const clip = selected();
  if (!field || !clip) return;
  clip[field] = e.target.value;
  changed();
  if (field === 'title') { renderList(); renderTape(); renderPickLabel(); }
});
trimBox.addEventListener('change', (e) => {
  const clip = selected();
  if (!clip) return;
  if (e.target.matches('[data-time]')) {
    const t = parseTime(e.target.value);
    const edge = e.target.dataset.edge;
    if (t == null) {
      toast('Type a time like 12:34 or 1:02:15.');
    } else {
      if (edge === 'start') setStart(clip, t, player.getDuration());
      else setEnd(clip, t, player.getDuration());
      changed();
    }
    e.target.value = formatTime(clip[edge]);
    const flag = e.target.closest('.tl-flag');
    if (flag) flag.querySelector('b').textContent = ''; // back to a label
    renderTimes();
  } else if (e.target.matches('[data-pick]')) {
    selectClip(e.target.value);
  } else if (e.target.matches('[data-add-player]') && e.target.value !== '') {
    addPlayerToClip(Number(e.target.value));
  }
});
trimBox.addEventListener('submit', (e) => {
  if (!e.target.matches('[data-add-number]')) return;
  e.preventDefault();
  const value = e.target.querySelector('input').value.trim();
  if (!/^\d{1,3}$/.test(value)) return toast('Type a jersey number.');
  addPlayerToClip(parseInt(value, 10));
});
trimBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-time]')) e.target.blur();
});
trimBox.addEventListener('focusin', (e) => {
  if (e.target.matches('[data-time]')) e.target.select();
});
// A typed time on the timeline turns back into a label when you leave it.
trimBox.addEventListener('focusout', (e) => {
  if (!e.target.matches('.tl-flag input')) return;
  setTimeout(() => {
    const flag = e.target.closest('.tl-flag');
    if (flag && !flag.contains(document.activeElement)) { flag.querySelector('b').textContent = ''; renderTimeline(); }
  }, 0);
});

// Trim timeline: drag a handle to move that end (the video shows the frame
// under your finger); tap anywhere else on the track to watch from there.
function timelineTime(e) {
  const v = state.view;
  const box = $('#tl-track').getBoundingClientRect();
  return v.from + clamp01((e.clientX - box.left) / box.width) * (v.to - v.from);
}
function previewEdge(clip, edge) {
  if (edge === 'start') playClip(clip);
  else playClip(clip, Math.max(clip.start, clip.end - END_PREVIEW));
}
trimBox.addEventListener('pointerdown', (e) => {
  const track = e.target.closest('#tl-track');
  const clip = selected();
  if (!track || !clip || !state.view || !player.isReady()) return;
  e.preventDefault();
  track.setPointerCapture(e.pointerId);
  state.playing = null;
  player.pause();
  const handle = e.target.closest('[data-handle]');
  if (handle) {
    state.drag = { edge: handle.dataset.handle, moved: false };
    track.classList.add('dragging', `drag-${state.drag.edge}`);
    player.seek(clip[state.drag.edge]);
  } else {
    state.drag = { edge: null };
    player.seek(timelineTime(e));
  }
});
trimBox.addEventListener('pointermove', (e) => {
  const clip = selected();
  if (!state.drag || !clip) return;
  const t = timelineTime(e);
  if (!state.drag.edge) { player.seek(t); renderScrub(t); return; }
  const before = clip[state.drag.edge];
  if (state.drag.edge === 'start') setStart(clip, t, player.getDuration());
  else setEnd(clip, t, player.getDuration());
  if (clip[state.drag.edge] !== before) {
    state.drag.moved = true;
    player.seek(clip[state.drag.edge]);
    renderTimeline();
    renderScrub(clip[state.drag.edge]);
    }
});
const endDrag = (e) => {
  const drag = state.drag;
  const clip = selected();
  state.drag = null;
  $('#tl-track')?.classList.remove('dragging', 'drag-start', 'drag-end');
  if (!drag || !clip) return;
  if (e.type !== 'pointerup') {
    // Cancelled (a touch gesture took over): keep any handle move already made.
    if (drag.moved) { changed(); renderTimes(); }
    return;
  }
  if (drag.edge) {
    changed();
    renderTimes(); // widens the view if an edge got close to its end
    previewEdge(clip, drag.edge);
    return;
  }
  // Inside the clip it plays to the clip's end; outside it just plays on.
  const t = timelineTime(e);
  if (t >= clip.start && t < clip.end) playClip(clip, t);
  else { state.playing = null; player.seek(t); player.play(); }
};
trimBox.addEventListener('pointerup', endDrag);
trimBox.addEventListener('pointercancel', endDrag);
// Flags and ticks are placed in pixels, so redo them when the screen changes size.
window.addEventListener('resize', () => renderTimeline());
// A time flag opens for typing with Enter or Space too.
trimBox.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tl-flag')) { e.preventDefault(); e.target.click(); }
});
// Arrow keys on a focused handle: 1 second, or 5 with Shift.
trimBox.addEventListener('keydown', (e) => {
  const handle = e.target.closest && e.target.closest('[data-handle]');
  const clip = selected();
  if (!handle || !clip || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  e.preventDefault();
  e.stopPropagation();
  const by = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1);
  const edge = handle.dataset.handle;
  if (edge === 'start') setStart(clip, clip.start + by, player.getDuration());
  else setEnd(clip, clip.end + by, player.getDuration());
  changed();
  renderTimes();
  previewEdge(clip, edge);
});

// Transport
function togglePlay() {
  if (!player.isReady()) return;
  if (player.isPlaying()) player.pause();
  else player.play();
}
function seekBy(seconds) {
  if (!player.isReady()) return;
  state.playing = null; // a manual jump takes over from clip playback
  player.seek(player.getTime() + seconds);
}
$('#btn-play').addEventListener('click', togglePlay);
$$('[data-seek]').forEach((b) => b.addEventListener('click', () => seekBy(Number(b.dataset.seek))));
// Speed: the same choice shows on every speed control (the Review bar, the
// phone's speed sheet and presentation mode).
function setRate(rate) {
  if (!player.isReady()) return;
  const allowed = player.getRates();
  if (allowed.length && !allowed.includes(rate)) {
    toast(`This video doesn't allow ${RATE_LABELS[rate]} speed.`);
    return;
  }
  player.setRate(rate);
  $$('[data-rate]').forEach((x) => {
    const on = Number(x.dataset.rate) === rate;
    x.classList.toggle('active', on);
    x.setAttribute('aria-pressed', on);
  });
  $('#btn-rate').textContent = RATE_LABELS[rate] || `${rate}×`;
  $('#btn-rate').classList.toggle('fast', rate > 1);
}
$$('[data-rate]').forEach((b) => b.addEventListener('click', () => {
  setRate(Number(b.dataset.rate));
  if (b.closest('#dlg-rate')) $('#dlg-rate').close();
}));
$('#btn-rate').addEventListener('click', () => $('#dlg-rate').showModal());

// Mute: the iPad's YouTube player has no volume slider, so we offer our own.
function syncMute() {
  const muted = player.isMuted();
  $$('[data-mute]').forEach((b) => {
    if (b.classList.contains('is-muted') === muted) return;
    b.classList.toggle('is-muted', muted);
    b.setAttribute('aria-pressed', muted);
    b.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-mute]') || !player.isReady()) return;
  player.setMuted(!player.isMuted());
  setTimeout(syncMute, 150);
});

// Keyboard. Ignored while typing or while a dialog is open.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.matches && t.matches('input, textarea, select, [contenteditable]')) return;
  if (document.querySelector('dialog[open]') || rosterPage.isOpen() || !state.game.source) return;
  if (presenter.isActive()) { presenter.handleKey(e); return; }
  const key = e.key.toLowerCase();
  if (state.tab === 'clip' && !e.repeat) {
    if (key === 'c') return addClip('');
  }
  if (isEditTab() && !e.repeat && selected()) {
    if (key === 'n') return step(1);
    if (key === 'p') return step(-1);
    if (key === 'r') return playClip(selected());
  }
  if (key === ' ' && !(t.matches && t.matches('button'))) { e.preventDefault(); togglePlay(); }
  else if (key === 'arrowleft') { e.preventDefault(); seekBy(-5); }
  else if (key === 'arrowright') { e.preventDefault(); seekBy(5); }
});

// Clicking the video moves keyboard focus into YouTube's frame, where our
// shortcuts can't be heard. Hand focus back to the page right after the click.
window.addEventListener('blur', () => {
  setTimeout(() => {
    const el = document.activeElement;
    if (el && el.tagName === 'IFRAME') el.blur();
  }, 100);
});

// ---------- team ----------
// A team link (?team=id) signs this browser in to a team. From then on games are
// shared with every coach on the team and kept in step live. Without a team the
// site works as before, all in this browser.

const readJSON = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJSON = (key, v) => { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };

// The browser's own last game, once added to the team, isn't offered again.
const UPLOADED_KEY = 'tapescope.teamUploaded';
const localKey = (g) => `${g.source && g.source.id}|${g.clips.map((c) => c.id).join(',')}`;

let leaving = false; // a reload for a new game has started: don't remember the old one
function rememberTeamGame(game) {
  if (state.team && !leaving) writeJSON(TEAM_GAME_KEY, { team: state.team.id, game });
}

// Before the page goes away (tab closed, phone locked, app switched): start the
// save, and keep a copy of what isn't saved yet in this browser, because the
// save may not finish once the page is gone. It is replayed next time the game
// opens, and dropped once the team has confirmed everything.
const UNSAVED_KEY = 'tapescope.teamUnsaved';
function stashUnsaved() {
  const t = state.team;
  if (!t) return;
  const u = t.sync.unsaved();
  if (u) writeJSON(UNSAVED_KEY, { team: t.id, ...u });
  t.sync.flush();
}
addEventListener('pagehide', stashUnsaved);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stashUnsaved();
});
function rememberedTeamGame(teamId) {
  const r = readJSON(TEAM_GAME_KEY);
  return r && r.team === teamId ? r.game : null;
}

function renderTeamChrome() {
  const t = state.team;
  $$('[data-team]').forEach((el) => { el.hidden = !t; });
  $$('[data-team-games]').forEach((el) => { el.hidden = !t; });
  if (!t) return;
  $('#team-status').textContent = `${t.name} · shared with every coach on the team`;
  $('#welcome-team').textContent = `${t.name} games`;
  $('#welcome-fine').textContent = `Signed in to ${t.name}. Games are saved for every coach on the team.`;
  renderSaveNote();
}

function renderSaveNote() {
  const t = state.team;
  const note = $('#save-note');
  if (!t) { note.textContent = 'Autosaved in this browser as you work.'; return; }
  if (!t.sync.gameId) note.textContent = state.game.source ? `Saving to ${t.name}…` : `Signed in to ${t.name}.`;
  else if (!navigator.onLine) note.textContent = 'Offline. Your changes are kept and will send when you are back online.';
  else note.textContent = t.saving ? `Saving to ${t.name}…` : `Saved to ${t.name}. Other coaches see changes as you make them.`;
}
addEventListener('online', renderSaveNote);
addEventListener('offline', renderSaveNote);

let rosterTimer = null;
function saveTeamRoster(roster) {
  const t = state.team;
  if (!t) return;
  clearTimeout(rosterTimer);
  rosterTimer = setTimeout(() => t.store.saveRoster(t.id, roster).catch((e) => toast(e.message)), 800);
}

// Another coach changed the game: take their copy without disturbing what's on
// screen more than needed. A field being typed in is left alone until it's done.
let editorStale = false;
function applyRemote(game) {
  const sourceChanged = (state.game.source && state.game.source.id) !== (game.source && game.source.id);
  state.game = game;
  if (!selected()) state.selectedId = clips()[0] ? clips()[0].id : null;
  if (sourceChanged) loadVideo(0);
  renderChrome();
  renderTabs();
  renderList();
  renderTape();
  const el = document.activeElement;
  if (state.drag || ($('#tab-trim').contains(el) && el.matches('input, textarea, select'))) editorStale = true;
  else renderEditor();
}
$('#tab-trim').addEventListener('focusout', () => {
  setTimeout(() => {
    const el = document.activeElement;
    if (editorStale && !state.drag && !($('#tab-trim').contains(el) && el.matches('input, textarea, select'))) {
      editorStale = false;
      renderEditor();
    }
  }, 0);
});

function enterTeam(store, id, name) {
  writeJSON(TEAM_KEY, { id, name });
  const team = { id, name, store, saving: false };
  team.sync = createTeamSync({
    store,
    teamId: id,
    getGame: () => state.game,
    onOpen: (game, gameId) => {
      $('#dlg-games').close();
      state.tab = 'clip';
      const u = readJSON(UNSAVED_KEY);
      if (u && u.team === id && u.gameId === gameId) {
        writeJSON(UNSAVED_KEY, null);
        setGame(mergeUnsaved(game, u), 0, gameId);
        team.sync.changed(); // send what didn't make it last time
        return;
      }
      setGame(game, 0, gameId);
    },
    onRemote: applyRemote,
    onCreated: (gameId) => rememberTeamGame(gameId),
    onGone: () => {
      toast('That game was deleted by another coach.', { ms: 6000 });
      rememberTeamGame('new');
      setGame({ ...newGame(), roster: loadTeam() });
      openGames();
    },
    onError: (err) => toast(err.message, { ms: 6000 }),
    onStatus: ({ saving, confirmed }) => {
      team.saving = saving;
      renderSaveNote();
      // The server has everything: a stash for this game is no longer needed.
      const u = readJSON(UNSAVED_KEY);
      if (confirmed && u && u.gameId === team.sync.gameId && !team.sync.unsaved()) writeJSON(UNSAVED_KEY, null);
    },
  });
  store.onWriteError((err) => toast(err.message, { ms: 6000 }));
  state.team = team;
  document.body.classList.add('in-team');
  renderChrome();

  // The team roster: the team's copy wins over this browser's.
  store.loadRoster(id).then((players) => {
    if (players && players.length) {
      saveTeam(players);
      if (!state.game.roster.length) { state.game.roster = loadTeam(); renderChrome(); }
    }
  }).catch(() => { /* offline: keep this browser's */ });

  const last = rememberedTeamGame(id);
  if (last && last !== 'new') {
    team.sync.open(last);
    return;
  }
  setGame({ ...newGame(), roster: loadTeam() });
  if (last !== 'new') openGames();
}

// Shows the sign-in pop-up. Resolves true once signed in, false for "Not now".
function askSignIn(store, id, name) {
  const dlg = $('#dlg-signin');
  $('#signin-title').textContent = `Sign in to ${name}`;
  $('#signin-user').value = id;
  $('#signin-pass').value = '';
  $('#signin-name').value = coach;
  $('#signin-err').hidden = true;
  return new Promise((resolve) => {
    let done = false;
    const onSubmit = async (e) => {
      e.preventDefault();
      const go = $('#signin-go');
      go.disabled = true;
      $('#signin-err').hidden = true;
      try {
        await store.signIn(id, $('#signin-pass').value, $('#signin-keep').checked);
        if ($('#signin-name').value.trim()) saveCoach($('#signin-name').value);
        done = true;
        dlg.close();
      } catch (err) {
        $('#signin-err').textContent = err.message;
        $('#signin-err').hidden = false;
      } finally {
        go.disabled = false;
      }
    };
    $('#signin-form').addEventListener('submit', onSubmit);
    dlg.addEventListener('close', () => {
      $('#signin-form').removeEventListener('submit', onSubmit);
      resolve(done);
    }, { once: true });
    dlg.showModal();
    $('#signin-pass').focus();
  });
}

// Returns true if this browser ends up in the team.
async function initTeam(id, { fromLink }) {
  let store;
  try {
    store = await teamStore();
  } catch {
    toast("Can't reach the team right now. Working in this browser only.", { ms: 6000 });
    return false;
  }
  const saved = readJSON(TEAM_KEY);
  const me = await store.whoAmI().catch(() => null);
  if (me && me.teamId === id) {
    const name = (saved && saved.id === id && saved.name)
      || ((await store.teamLink(id).catch(() => null)) || {}).name || id;
    enterTeam(store, id, name);
    return true;
  }
  let link;
  try {
    link = await store.teamLink(id);
  } catch (err) {
    toast(err.message, { ms: 6000 });
    return false;
  }
  if (!link) {
    writeJSON(TEAM_KEY, null);
    toast("That team link doesn't work. Check it with whoever sent it.", { ms: 7000 });
    return false;
  }
  if (!fromLink) {
    // Signed out here (or the password changed): ask again.
    toast(`Sign in to ${link.name} again to see the team's games.`, { ms: 5000 });
  }
  if (await askSignIn(store, id, link.name)) {
    enterTeam(store, id, link.name);
    return true;
  }
  writeJSON(TEAM_KEY, null);
  return false;
}

const dateText = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

async function openGames() {
  const t = state.team;
  if (!t) return;
  $('#games-title').textContent = `${t.name} games`;
  const local = localStore.load();
  const localBtn = $('#games-local');
  localBtn.hidden = !(local && local.source && local.clips.length) || readJSON(UPLOADED_KEY) === localKey(local);
  if (!localBtn.hidden) {
    localBtn.textContent = `Add "${local.title || 'Untitled game'}" (${local.clips.length} clips) from this browser`;
  }
  const list = $('#games-list');
  list.innerHTML = '<li class="note">Loading…</li>';
  if (!$('#dlg-games').open) $('#dlg-games').showModal();
  try {
    const games = await t.store.listGames(t.id);
    list.innerHTML = games.length ? games.map((g) => {
      const current = g.id === t.sync.gameId;
      const title = g.title || 'Untitled game';
      const meta = [`${g.clipCount} clip${g.clipCount === 1 ? '' : 's'}`, dateText(g.updatedAt), current ? 'open now' : ''].filter(Boolean).join(' · ');
      return `<li>
        <button type="button" class="menu-item${current ? ' current' : ''}" data-game="${esc(g.id)}">
          ${icon('folder')}<span><strong>${esc(title)}</strong><small>${esc(meta)}</small></span>
        </button>
        <button type="button" class="icon-btn" data-del-game="${esc(g.id)}" data-title="${esc(title)}" aria-label="Delete ${esc(title)}">${icon('trash')}</button>
      </li>`;
    }).join('') : '<li class="empty">No games yet. Start one with New game.</li>';
  } catch (err) {
    list.innerHTML = `<li class="note">${esc(err.message)}</li>`;
  }
}

$('#btn-team-games').addEventListener('click', openGames);
$$('[data-team-games]').forEach((b) => b.addEventListener('click', openGames));

$('#dlg-games').addEventListener('click', async (e) => {
  const t = state.team;
  if (!t) return;
  const open = e.target.closest('[data-game]');
  if (open) {
    if (open.dataset.game !== t.sync.gameId) {
      t.sync.flush();
      t.sync.open(open.dataset.game);
    }
    return;
  }
  const del = e.target.closest('[data-del-game]');
  if (!del) return;
  if (!confirm(`Delete "${del.dataset.title}" for every coach on ${t.name}? This can't be undone.`)) return;
  const id = del.dataset.delGame;
  try {
    if (id === t.sync.gameId) {
      t.sync.detach();
      rememberTeamGame('new');
      setGame({ ...newGame(), roster: loadTeam() });
    }
    await t.store.deleteGame(t.id, id);
    toast('Game deleted.');
  } catch (err) {
    toast(err.message);
  }
  openGames();
});

$('#games-new').addEventListener('click', () => {
  $('#dlg-games').close();
  if (!state.game.source) return;
  newGameReload();
});

$('#games-local').addEventListener('click', () => {
  const local = localStore.load();
  $('#dlg-games').close();
  if (!local || !local.source) return;
  state.tab = local.clips.length ? 'trim' : 'clip';
  writeJSON(UPLOADED_KEY, localKey(local));
  setGame(local); // not a team game yet, so it is saved to the team as a new one
  toast(`Added "${local.title || 'Untitled game'}" to ${state.team.name}.`);
});

$('#btn-team-out').addEventListener('click', async () => {
  const t = state.team;
  if (!t) return;
  if (!confirm(`Sign out of ${t.name} on this device? The team's games stay saved for the team.`)) return;
  await t.sync.settle();
  await t.store.signOut().catch(() => {});
  writeJSON(TEAM_KEY, null);
  writeJSON(TEAM_GAME_KEY, null);
  location.reload();
});

// ---------- start ----------

async function start() {
  // A team link, or a team this browser signed in to before.
  const params = new URLSearchParams(location.search);
  const linkTeam = (params.get('team') || '').trim().toLowerCase();
  if (linkTeam) {
    params.delete('team');
    const rest = params.toString();
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  }
  const savedTeam = readJSON(TEAM_KEY);
  const teamId = linkTeam || (savedTeam && savedTeam.id);
  if (teamId && !location.hash) {
    renderAll(); // the welcome screen behind the sign-in, not a blank page
    if (await initTeam(teamId, { fromLink: !!linkTeam })) return;
  }

  const saved = localStore.load() || newGame();
  // No roster in the saved game: start from the team roster kept in this browser.
  if (!saved.roster.length) saved.roster = loadTeam();
  let fromLink = null;
  try {
    fromLink = linkStore.load(location.hash);
  } catch (err) {
    toast(err.message, { ms: 8000 });
  }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  setGame(saved);
  if (!fromLink) return;
  const same = JSON.stringify(fromLink.clips) === JSON.stringify(saved.clips);
  if (!same && !(await okToReplace())) return;
  // A link without names keeps a roster already here for the same video.
  if (!fromLink.roster.length && saved.source && fromLink.source && saved.source.id === fromLink.source.id) {
    fromLink.roster = saved.roster;
  }
  state.tab = fromLink.clips.length ? 'trim' : 'clip';
  setGame(fromLink);
}

start();

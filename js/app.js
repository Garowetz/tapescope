// UI wiring. Talks to the video only through the player adapter and to saved
// games only through the storage adapters. Clip timing rules are in clips.js.

import {
  BEFORE_OPTIONS, AFTER_OPTIONS, NUDGE_STEPS, CATEGORIES, END_PREVIEW,
  normalizeSettings, createClip, resetWindow, setStart, setEnd,
  formatTime, parseTime, categoryLabel,
} from './clips.js';
import { newGame } from './game.js';
import { parseRosterText, playerLabel } from './roster.js';
import { createYouTubePlayer, parseYouTubeUrl } from './players/youtube.js';
import { localStore } from './storage/local.js';
import { fileStore } from './storage/file.js';
import { linkStore, LONG_LINK } from './storage/link.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const SETTINGS_KEY = 'tapescope.settings';

const state = {
  game: newGame(),
  settings: loadSettings(),
  tab: 'clip',
  selectedId: null,
  undoStack: [],   // ids of clips made this sitting, newest last
  playing: null,   // { id, entered } while a clip is playing to its end
};

const player = createYouTubePlayer($('#player'));

// ---------- helpers ----------

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)));
  } catch {
    return normalizeSettings(null);
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* ignore */ }
}

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

let saveTimer = null;
function changed() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => localStore.save(state.game), 250);
}

const clips = () => state.game.clips;
const selected = () => clips().find((c) => c.id === state.selectedId) || null;
const clipName = (clip, index) => clip.title || `Clip ${index + 1}`;

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
  if (!state.playing) return;
  const clip = clips().find((c) => c.id === state.playing.id);
  if (!clip) { state.playing = null; return; }
  if (t < clip.end) state.playing.entered = true;
  else if (state.playing.entered) {
    player.pause();
    state.playing = null;
  }
});

player.onError((message) => toast(message));

function loadVideo(startAt = 0) {
  const src = state.game.source;
  $('#player-empty').hidden = !!src;
  if (src) player.load(src.id, startAt);
}

// ---------- clip it ----------

function addClip(category) {
  if (!state.game.source || !player.isReady()) {
    toast('Load a video first.');
    return;
  }
  const clip = createClip(player.getTime(), state.settings, player.getDuration(), category);
  clips().push(clip);
  state.undoStack.push(clip.id);
  state.selectedId = clip.id;
  changed();
  renderAll();
  const btn = document.querySelector(`[data-clip="${category}"]`);
  if (btn) {
    btn.classList.remove('flash');
    void btn.offsetWidth; // restart the animation
    btn.classList.add('flash');
  }
  const list = $('#clip-list');
  list.scrollTop = list.scrollHeight;
}

function undoLastClip() {
  let id = state.undoStack.pop();
  while (id && !clips().some((c) => c.id === id)) id = state.undoStack.pop();
  if (!id) return;
  removeClip(id);
  toast('Last clip removed.');
}

function removeClip(id) {
  const i = clips().findIndex((c) => c.id === id);
  if (i < 0) return;
  clips().splice(i, 1);
  if (state.playing && state.playing.id === id) state.playing = null;
  if (state.selectedId === id) {
    const next = clips()[Math.min(i, clips().length - 1)];
    state.selectedId = next ? next.id : null;
  }
  changed();
  renderAll();
}

// ---------- rendering ----------

function renderAll() {
  renderHeader();
  renderTabs();
  renderList();
  renderEditor();
}

function renderHeader() {
  const g = state.game;
  if (document.activeElement !== $('#game-title')) $('#game-title').value = g.title;
  $('#btn-roster').textContent = g.roster.length ? 'Update roster' : 'Load roster';
  $('#roster-status').textContent = g.roster.length
    ? `Roster: ${g.roster.length} players`
    : 'No roster loaded. Players can still be added by jersey number.';
  $('#window-hint').textContent = `${state.settings.before}s before, ${state.settings.after}s after`;
  $('#btn-undo').disabled = !state.undoStack.some((id) => clips().some((c) => c.id === id));
  $('#clip-count').textContent = clips().length ? `(${clips().length})` : '';
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
  $('#tab-clip').hidden = state.tab !== 'clip';
  $('#tab-trim').hidden = state.tab !== 'trim';
}

function renderList() {
  const list = $('#clip-list');
  if (!clips().length) {
    list.innerHTML = '<li class="empty">No clips yet. Press Clip it right after something happens.</li>';
    return;
  }
  list.innerHTML = clips().map((c, i) => `
    <li><button type="button" class="clip-item cat-${esc(c.category)}${c.id === state.selectedId ? ' selected' : ''}" data-id="${esc(c.id)}" title="${esc(categoryLabel(c.category))}">
      <span class="num">${i + 1}</span>
      <span class="name">${esc(clipName(c, i))}</span>
      <span class="when">${formatTime(c.start)} - ${formatTime(c.end)}</span>
    </button></li>`).join('');
}

function renderEditor() {
  const box = $('#tab-trim');
  const clip = selected();
  if (!clip) {
    box.innerHTML = '<p class="empty">No clips to trim yet. Use the Clip it tab while watching the game.</p>';
    return;
  }
  const g = state.game;
  const index = clips().indexOf(clip);
  const nudges = (edge, steps) => steps.map((n) =>
    `<button type="button" class="btn small" data-act="nudge" data-edge="${edge}" data-by="${n}">${n > 0 ? '+' : ''}${n}</button>`).join('');
  const neg = NUDGE_STEPS.filter((n) => n < 0);
  const pos = NUDGE_STEPS.filter((n) => n > 0);
  const edge = (name, label) => `
    <div class="edge">
      <span class="label">${label}</span>
      <button type="button" class="btn" data-act="set-${name}">Set ${name} here</button>
      <div class="edge-row">
        ${nudges(name, neg)}
        <input type="text" inputmode="numeric" id="ed-${name}" data-time="${name}" value="${formatTime(clip[name])}" aria-label="${label} time">
        ${nudges(name, pos)}
      </div>
    </div>`;

  const available = g.roster.filter((p) => !clip.players.includes(p.number));
  const addPlayer = g.roster.length
    ? `<select data-add-player aria-label="Add player">
         <option value="">Add player...</option>
         ${available.map((p) => `<option value="${p.number}">#${p.number} ${esc(p.name)}${p.position ? ' (' + esc(p.position) + ')' : ''}</option>`).join('')}
       </select>`
    : `<form class="add-player" data-add-number>
         <input type="text" inputmode="numeric" placeholder="Jersey number" aria-label="Jersey number">
         <button class="btn">Add</button>
       </form>`;

  box.innerHTML = `
    <div class="editor">
      <div class="nav">
        <button type="button" class="btn" data-act="prev" ${index === 0 ? 'disabled' : ''}>Prev</button>
        <button type="button" class="btn primary" data-act="replay">Replay</button>
        <button type="button" class="btn" data-act="next" ${index === clips().length - 1 ? 'disabled' : ''}>Next</button>
      </div>
      <div class="editor-head">
        <strong>Clip ${index + 1} of ${clips().length}</strong>
        <span class="muted" id="ed-meta"></span>
      </div>
      ${edge('start', 'Start')}
      ${edge('end', 'End')}
      <button type="button" class="btn" data-act="reset">Reset to default window</button>
      <label class="field"><span>Title</span>
        <input type="text" data-field="title" value="${esc(clip.title)}" placeholder="Clip ${index + 1}">
      </label>
      <div class="field"><span>Category</span>
        <div class="cats">
          ${CATEGORIES.map((c) => `<button type="button" class="btn${c.id === clip.category ? ' active' : ''}" data-act="category" data-cat="${c.id}">${c.label}</button>`).join('')}
        </div>
      </div>
      <div class="field"><span>Players</span>
        <div class="chips">
          ${clip.players.map((n) => `<button type="button" class="chip" data-act="remove-player" data-number="${n}" title="Remove">${esc(playerLabel(g.roster, n))}</button>`).join('')}
        </div>
        ${addPlayer}
      </div>
      <label class="field"><span>Talking points</span>
        <textarea data-field="notes" rows="3">${esc(clip.notes)}</textarea>
      </label>
      <div class="row-3">
        <button type="button" class="btn" data-act="up" ${index === 0 ? 'disabled' : ''}>Move up</button>
        <button type="button" class="btn" data-act="down" ${index === clips().length - 1 ? 'disabled' : ''}>Move down</button>
        <button type="button" class="btn danger" data-act="delete">Delete</button>
      </div>
    </div>`;
  renderTimes();
}

// Updates just the time text, so typing in other fields never loses focus.
function renderTimes() {
  const clip = selected();
  if (!clip) return;
  const start = $('#ed-start');
  const end = $('#ed-end');
  if (start) start.value = formatTime(clip.start);
  if (end) end.value = formatTime(clip.end);
  const meta = $('#ed-meta');
  if (meta) meta.textContent = `Clipped at ${formatTime(clip.mark)} · ${clip.end - clip.start}s long`;
  renderList();
}

function selectClip(id, { play = true } = {}) {
  const clip = clips().find((c) => c.id === id);
  if (!clip) return;
  state.selectedId = id;
  renderList();
  renderEditor();
  if (play) playClip(clip);
}

function step(delta) {
  const i = clips().indexOf(selected());
  const next = clips()[i + delta];
  if (next) selectClip(next.id);
}

// ---------- trim actions ----------

function trimAction(act, el) {
  const clip = selected();
  if (!clip) return;
  const duration = player.getDuration();
  const index = clips().indexOf(clip);

  switch (act) {
    case 'prev': return step(-1);
    case 'next': return step(1);
    case 'replay': return playClip(clip);
    case 'set-start':
      if (!player.isReady()) return toast('Load a video first.');
      setStart(clip, player.getTime(), duration);
      break;
    case 'set-end':
      if (!player.isReady()) return toast('Load a video first.');
      setEnd(clip, player.getTime(), duration);
      break;
    case 'nudge': {
      const by = Number(el.dataset.by);
      if (el.dataset.edge === 'start') {
        setStart(clip, clip.start + by, duration);
        playClip(clip);
      } else {
        setEnd(clip, clip.end + by, duration);
        playClip(clip, Math.max(clip.start, clip.end - END_PREVIEW));
      }
      break;
    }
    case 'reset':
      resetWindow(clip, state.settings, duration);
      break;
    case 'category':
      clip.category = el.dataset.cat;
      changed();
      renderList();
      return renderEditor();
    case 'remove-player':
      clip.players = clip.players.filter((n) => n !== Number(el.dataset.number));
      changed();
      return renderEditor();
    case 'up':
    case 'down': {
      const to = index + (act === 'up' ? -1 : 1);
      if (to < 0 || to >= clips().length) return;
      clips().splice(index, 1);
      clips().splice(to, 0, clip);
      changed();
      renderList();
      return renderEditor();
    }
    case 'delete':
      if (confirm(`Delete "${clipName(clip, index)}"?`)) removeClip(clip.id);
      return;
    default:
      return;
  }
  changed();
  renderTimes();
}

function addPlayerToClip(number) {
  const clip = selected();
  if (!clip || !Number.isFinite(number) || number < 0) return;
  if (!clip.players.includes(number)) clip.players.push(number);
  changed();
  renderEditor();
}

// ---------- games ----------

function setGame(game, startAt = 0) {
  state.game = game;
  state.selectedId = game.clips[0] ? game.clips[0].id : null;
  state.undoStack = [];
  state.playing = null;
  localStore.save(game);
  renderAll();
  loadVideo(startAt);
}

function hasWork() {
  return clips().length > 0;
}

function shareUrl() {
  return linkStore.save(state.game, { includeNames: $('#share-names').checked });
}

function renderShare() {
  const url = shareUrl();
  $('#share-url').value = url;
  $('#share-info').textContent = url.length > LONG_LINK
    ? `${url.length} characters. Long links can get cut off in some texting and email apps. Send the game file if it does not open.`
    : `${url.length} characters.`;
}

// ---------- events ----------

$('#url-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const parsed = parseYouTubeUrl($('#url-input').value);
  if (!parsed) return toast('That does not look like a YouTube link.');
  const current = state.game.source;
  if (current && current.id !== parsed.id && hasWork()) {
    if (!confirm('Start a new game with this video? Save the current game first if you want to keep its clips.')) return;
    setGame({ ...newGame(), roster: state.game.roster, source: { type: 'youtube', id: parsed.id } }, parsed.t);
  } else {
    state.game.source = { type: 'youtube', id: parsed.id };
    changed();
    renderAll();
    loadVideo(parsed.t);
  }
  $('#url-input').value = '';
  $('#url-input').blur();
});

$('#game-title').addEventListener('input', (e) => {
  state.game.title = e.target.value;
  changed();
});

$('#btn-new').addEventListener('click', () => {
  if (hasWork() && !confirm('Start a new game? Save the current game first if you want to keep its clips.')) return;
  setGame({ ...newGame(), roster: state.game.roster });
  location.reload(); // simplest way to clear the old video out of the player
});

$('#btn-save').addEventListener('click', () => {
  if (!state.game.source) return toast('Nothing to save yet. Load a video first.');
  fileStore.save(state.game);
});

$('#btn-open').addEventListener('click', () => $('#file-game').click());
$('#file-game').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const game = await fileStore.load(file);
    if (hasWork() && !confirm('Open this game? It replaces the game currently on screen.')) return;
    setGame(game);
    state.tab = game.clips.length ? 'trim' : 'clip';
    renderAll();
    toast(`Opened ${game.title || 'game'}: ${game.clips.length} clips.`);
  } catch (err) {
    toast(err.message);
  }
});

$('#btn-roster').addEventListener('click', () => $('#file-roster').click());
$('#file-roster').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    state.game.roster = parseRosterText(await file.text(), file.name);
    changed();
    renderAll();
    toast(`Roster loaded: ${state.game.roster.length} players.`);
  } catch (err) {
    toast(err.message || 'That team file could not be read.');
  }
});

$('#btn-settings').addEventListener('click', () => {
  const fill = (sel, options, value) => {
    const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
    sel.innerHTML = all.map((n) => `<option value="${n}"${n === value ? ' selected' : ''}>${n} seconds</option>`).join('');
  };
  fill($('#set-before'), BEFORE_OPTIONS, state.settings.before);
  fill($('#set-after'), AFTER_OPTIONS, state.settings.after);
  $('#dlg-settings').showModal();
});
$('#set-before').addEventListener('change', (e) => { state.settings.before = Number(e.target.value); saveSettings(); renderHeader(); });
$('#set-after').addEventListener('change', (e) => { state.settings.after = Number(e.target.value); saveSettings(); renderHeader(); });

$('#btn-share').addEventListener('click', () => {
  if (!state.game.source) return toast('Nothing to share yet. Load a video first.');
  $('#share-names').checked = false;
  renderShare();
  $('#dlg-share').showModal();
});
$('#share-names').addEventListener('change', renderShare);
$('#share-copy').addEventListener('click', async () => {
  const box = $('#share-url');
  try {
    await navigator.clipboard.writeText(box.value);
    toast('Link copied.');
  } catch {
    box.focus();
    box.select();
    toast('Press Ctrl+C (or Cmd+C) to copy.');
  }
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  state.tab = t.dataset.tab;
  if (state.tab === 'trim' && !selected() && clips().length) state.selectedId = clips()[0].id;
  renderAll();
}));

$('#tab-clip').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-clip]');
  if (btn) addClip(btn.dataset.clip);
});
$('#btn-undo').addEventListener('click', undoLastClip);

$('#clip-list').addEventListener('click', (e) => {
  const item = e.target.closest('[data-id]');
  if (!item) return;
  state.tab = 'trim';
  renderTabs();
  selectClip(item.dataset.id);
});

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
  if (field === 'title') renderList();
});
trimBox.addEventListener('change', (e) => {
  const clip = selected();
  if (!clip) return;
  if (e.target.dataset.time) {
    const t = parseTime(e.target.value);
    if (t == null) {
      toast('Type a time like 12:34 or 1:02:15.');
    } else if (e.target.dataset.time === 'start') {
      setStart(clip, t, player.getDuration());
      changed();
    } else {
      setEnd(clip, t, player.getDuration());
      changed();
    }
    renderTimes();
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
  if (e.key === 'Enter' && e.target.dataset.time) e.target.blur();
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
document.querySelectorAll('[data-seek]').forEach((b) => b.addEventListener('click', () => seekBy(Number(b.dataset.seek))));
document.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => {
  player.setRate(Number(b.dataset.rate));
  document.querySelectorAll('[data-rate]').forEach((x) => x.classList.toggle('active', x === b));
}));

// Keyboard. Ignored while typing or while a dialog is open.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.matches && t.matches('input, textarea, select, [contenteditable]')) return;
  if (document.querySelector('dialog[open]')) return;
  const key = e.key.toLowerCase();
  if (state.tab === 'clip' && !e.repeat) {
    if (key === 'c') return addClip('');
    if (key === 'g') return addClip('good');
    if (key === 'f') return addClip('needs-work');
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

// ---------- start ----------

function start() {
  let game = localStore.load() || newGame();
  let fromLink = null;
  try {
    fromLink = linkStore.load(location.hash);
  } catch (err) {
    toast(err.message);
  }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (fromLink) {
    const sameAsSaved = JSON.stringify(fromLink.clips) === JSON.stringify(game.clips);
    if (!game.clips.length || sameAsSaved
      || confirm('Open the shared game? It replaces the game saved in this browser. Cancel to keep yours.')) {
      // A link without names keeps a roster already here for the same video.
      if (!fromLink.roster.length && game.source && fromLink.source && game.source.id === fromLink.source.id) {
        fromLink.roster = game.roster;
      }
      game = fromLink;
      state.tab = game.clips.length ? 'trim' : 'clip';
    }
  }
  setGame(game);
}

start();

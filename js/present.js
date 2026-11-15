// Presentation mode: one clip at a time, big controls, sized for a TV or an iPad.
//
// The video is never moved into the presentation screen, because moving a
// YouTube iframe in the page reloads it. Instead the existing player is pinned
// (position: fixed) over the empty #pv-stage area and put back on exit.

import { categoryLabel } from './clips.js?v=9';
import { playerLabel } from './roster.js?v=9';

const PREFS_KEY = 'tapescope.present';
const REEL_GAP_MS = 1500; // pause between clips in Play all
const ASPECT = 16 / 9;
const NOTES_MIN_W = 280; // talking points beside the video: at least this wide
const NOTES_MIN_H = 120; // talking points under the video: at least this tall

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const clamp01 = (n) => Math.max(0, Math.min(1, n));

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    return { notes: p.notes !== false, names: p.names !== false };
  } catch {
    return { notes: true, names: true };
  }
}

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const canFullscreen = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function enterFullscreen() {
  const el = document.documentElement;
  try {
    const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    if (r && r.catch) r.catch(() => {});
  } catch { /* not supported here (iPhone): carry on without it */ }
}
function exitFullscreen() {
  try {
    const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    if (r && r.catch) r.catch(() => {});
  } catch { /* ignore */ }
}

// app: { player, getGame, getSelectedId, select(id, {play}), playClip(clip, from), stopClip(), toast, onExit }
export function createPresenter(app) {
  const root = $('#present');
  const stage = $('#pv-stage');
  const wrap = $('.player-wrap');
  const prefs = loadPrefs();
  let active = false;
  let reel = false;
  let reelTimer = null;
  let wakeLock = null;
  let seeking = false;

  const clips = () => app.getGame().clips;
  const current = () => clips().find((c) => c.id === app.getSelectedId()) || clips()[0] || null;

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }

  // Pin the player over the stage, as large as fits at 16:9.
  // With talking points on, try them beside the video and under it, and use
  // whichever leaves the bigger picture. A TV keeps them beside; an iPad on its
  // side usually gets a strip underneath; anything upright stacks.
  function layout() {
    if (!active) return;
    const main = $('#pv-main');
    main.classList.remove('side', 'bottom', 'strip');
    main.style.removeProperty('--pv-notes-w');
    main.style.removeProperty('--pv-notes-h');
    if (prefs.notes) {
      const m = main.getBoundingClientRect();
      const fit = (w, h) => (w / h > ASPECT ? h * ASPECT * h : w * (w / ASPECT));
      const sideW = Math.min(m.width * 0.5, Math.max(NOTES_MIN_W, Math.min(400, m.width * 0.22), m.width - m.height * ASPECT));
      const bottomH = Math.min(m.height * 0.6, Math.max(NOTES_MIN_H, m.height - m.width / ASPECT));
      const side = fit(m.width - sideW, m.height);
      const bottom = fit(m.width, m.height - bottomH);
      if (side > bottom) {
        main.classList.add('side');
        main.style.setProperty('--pv-notes-w', `${Math.round(sideW)}px`);
      } else {
        main.classList.add('bottom');
        main.style.setProperty('--pv-notes-h', `${Math.round(bottomH)}px`);
        main.classList.toggle('strip', bottomH < 220 && m.width >= 640);
      }
    }
    const r = stage.getBoundingClientRect();
    let w = r.width;
    let h = w / ASPECT;
    if (h > r.height) { h = r.height; w = h * ASPECT; }
    Object.assign(wrap.style, {
      position: 'fixed', zIndex: '101', margin: '0', maxWidth: 'none', aspectRatio: 'auto',
      left: `${r.left + (r.width - w) / 2}px`, top: `${r.top + (r.height - h) / 2}px`,
      width: `${w}px`, height: `${h}px`, borderRadius: '0', boxShadow: 'none',
    });
  }
  const resizeObserver = new ResizeObserver(layout);

  async function keepAwake() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not supported or refused */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (active && document.visibilityState === 'visible') keepAwake();
  });

  function render() {
    const clip = current();
    if (!clip) return;
    const list = clips();
    const i = list.indexOf(clip);
    const g = app.getGame();
    $('#pv-num').textContent = i + 1;
    $('#pv-of').textContent = `of ${list.length}`;
    $('#pv-title').textContent = clip.title;
    root.querySelector('[data-pv="prev"]').disabled = i === 0;
    root.querySelector('[data-pv="next"]').disabled = i === list.length - 1;
    $('#pv-main').classList.toggle('notes-off', !prefs.notes);
    $('#pv-progress').className = `pv-progress cat-${clip.category}`;
    $('#pv-reel').checked = reel;

    const players = clip.players
      .map((n) => `<span class="pv-player">${esc(prefs.names ? playerLabel(g.roster, n) : `#${n}`)}</span>`)
      .join('');
    const cat = clip.category
      ? `<span class="pv-cat cat-${esc(clip.category)}"><span class="dot"></span>${esc(categoryLabel(clip.category))}</span>`
      : '';
    $('#pv-notes').innerHTML = `
      <div class="pv-facts">
        <div class="pv-meta">${cat}<span class="pv-len">${clip.end - clip.start}s</span></div>
        ${players ? `<div class="pv-players">${players}</div>` : ''}
      </div>
      ${clip.notes ? `<p class="pv-text">${esc(clip.notes)}</p>` : ''}`;
    layout();
    requestAnimationFrame(layout);
  }

  // Called by the app on every player tick (about 5 times a second).
  function tick(t, playing) {
    if (!active) return;
    const play = $('#pv-play');
    if (play.classList.contains('is-playing') !== playing) {
      play.classList.toggle('is-playing', playing);
      play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    const clip = current();
    if (clip && !seeking) $('#pv-fill').style.width = `${clamp01((t - clip.start) / (clip.end - clip.start)) * 100}%`;
  }

  function cue() {
    const clip = current();
    if (!clip) return;
    app.stopClip();
    app.player.pause();
    app.player.seek(clip.start);
  }

  function goTo(id, play = true) {
    clearTimeout(reelTimer);
    app.select(id, { play });
    if (!play) cue();
    render();
  }

  function go(delta) {
    const list = clips();
    const next = list[list.indexOf(current()) + delta];
    if (next) goTo(next.id);
  }

  function replay() {
    clearTimeout(reelTimer);
    const clip = current();
    if (clip) app.playClip(clip);
  }

  function togglePlay() {
    const clip = current();
    if (!clip || !app.player.isReady()) return;
    if (app.player.isPlaying()) {
      clearTimeout(reelTimer);
      app.player.pause();
      return;
    }
    const t = app.player.getTime();
    // Outside the clip, or at its end: start the clip again. Otherwise carry on.
    if (t < clip.start - 1 || t >= clip.end - 0.5) app.playClip(clip);
    else app.playClip(clip, t);
  }

  // Called by the app when a clip reaches its end and pauses.
  function clipEnded(clip) {
    if (!active || !reel) return;
    const list = clips();
    const i = list.indexOf(clip);
    if (i < 0 || i === list.length - 1) {
      reel = false;
      render();
      return;
    }
    clearTimeout(reelTimer);
    reelTimer = setTimeout(() => { if (active && reel) go(1); }, REEL_GAP_MS);
  }

  function enter() {
    if (!clips().length) return app.toast('Clip a few moments first, then present them.');
    if (!app.player.isReady()) return app.toast('The video is still loading.');
    active = true;
    reel = false;
    root.hidden = false;
    document.body.classList.add('presenting');
    $('#pv-full').hidden = !canFullscreen();
    goTo(current().id, false);
    resizeObserver.observe(stage);
    resizeObserver.observe(root);
    window.addEventListener('resize', layout);
    enterFullscreen();
    keepAwake();
  }

  function exit() {
    if (!active) return;
    active = false;
    reel = false;
    clearTimeout(reelTimer);
    resizeObserver.disconnect();
    window.removeEventListener('resize', layout);
    app.stopClip();
    app.player.pause();
    root.hidden = true;
    document.body.classList.remove('presenting');
    wrap.removeAttribute('style');
    if (fullscreenElement()) exitFullscreen();
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
    app.onExit();
  }

  function openList() {
    const list = clips();
    const cur = current();
    $('#pv-grid').innerHTML = list.map((c, i) => `
      <button type="button" class="clip-item cat-${esc(c.category)}${c === cur ? ' current' : ''}" data-goto="${esc(c.id)}">
        <span class="ci-num">${i + 1}</span>
        <span class="ci-main">
          <span class="ci-title${c.title ? '' : ' untitled'}">${esc(c.title || `Clip ${i + 1}`)}</span>
          <span class="ci-meta">${esc(c.category ? categoryLabel(c.category) : 'Untagged')}</span>
        </span>
        <span class="ci-len">${c.end - c.start}s</span>
      </button>`).join('');
    $('#dlg-pv-list').showModal();
    const on = $('#pv-grid .current');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function openView() {
    $('#pv-show-notes').checked = prefs.notes;
    $('#pv-show-names').checked = prefs.names;
    $('#dlg-pv-view').showModal();
  }

  // ---------- events ----------

  root.addEventListener('click', (e) => {
    const go_ = e.target.closest('[data-goto]');
    if (go_) {
      $('#dlg-pv-list').close();
      goTo(go_.dataset.goto);
      return;
    }
    const b = e.target.closest('[data-pv]');
    if (!b) return;
    const act = b.dataset.pv;
    if (act === 'prev') go(-1);
    else if (act === 'next') go(1);
    else if (act === 'replay') replay();
    else if (act === 'play') togglePlay();
    else if (act === 'list') openList();
    else if (act === 'view') openView();
    else if (act === 'full') { if (fullscreenElement()) exitFullscreen(); else enterFullscreen(); }
    else if (act === 'exit') exit();
  });

  $('#pv-reel').addEventListener('change', (e) => {
    reel = e.target.checked;
    clearTimeout(reelTimer);
    if (reel && !app.player.isPlaying()) replay();
  });
  $('#pv-show-notes').addEventListener('change', (e) => { prefs.notes = e.target.checked; savePrefs(); render(); });
  $('#pv-show-names').addEventListener('change', (e) => { prefs.names = e.target.checked; savePrefs(); render(); });

  // The thin bar above the controls: tap or drag to move within the clip.
  const bar = $('#pv-progress');
  const barTime = (e, clip) => {
    const box = bar.getBoundingClientRect();
    return clip.start + clamp01((e.clientX - box.left) / box.width) * (clip.end - clip.start);
  };
  bar.addEventListener('pointerdown', (e) => {
    const clip = current();
    if (!clip || !app.player.isReady()) return;
    seeking = true;
    bar.setPointerCapture(e.pointerId);
    clearTimeout(reelTimer);
    app.stopClip();
    app.player.seek(barTime(e, clip));
    $('#pv-fill').style.width = `${clamp01((barTime(e, clip) - clip.start) / (clip.end - clip.start)) * 100}%`;
  });
  bar.addEventListener('pointermove', (e) => {
    const clip = current();
    if (!seeking || !clip) return;
    const t = barTime(e, clip);
    app.player.seek(t);
    $('#pv-fill').style.width = `${clamp01((t - clip.start) / (clip.end - clip.start)) * 100}%`;
  });
  const endSeek = (e) => {
    const clip = current();
    if (seeking && clip && e.type === 'pointerup') app.playClip(clip, barTime(e, clip));
    seeking = false;
  };
  bar.addEventListener('pointerup', endSeek);
  bar.addEventListener('pointercancel', endSeek);

  // Keys, including what presentation clickers send (Page Up / Page Down).
  // Returns true if the key was used.
  function handleKey(e) {
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const actions = {
      ArrowRight: () => go(1), PageDown: () => go(1), n: () => go(1),
      ArrowLeft: () => go(-1), PageUp: () => go(-1), p: () => go(-1),
      Home: () => goTo(clips()[0].id), End: () => goTo(clips()[clips().length - 1].id),
      r: replay, Escape: exit,
    };
    let fn = actions[lower];
    if (k === ' ' && !(e.target.matches && e.target.matches('button'))) fn = togglePlay;
    if (!fn) return false;
    e.preventDefault();
    if (!e.repeat) fn(); // holding a key down never races through the clips
    return true;
  }

  return { enter, exit, tick, clipEnded, handleKey, isActive: () => active };
}

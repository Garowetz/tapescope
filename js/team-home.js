// The team home page: the team's games as cards (newest first), each with quick
// Review and Present buttons, and a last card to add a game. No Firebase here:
// it reads the games list through the team store interface.

import { thumbnailUrl } from './players/youtube.js?v=15';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const dateText = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const LIST_TIMEOUT_MS = 10000;

const TALLY = [['good', 'Good'], ['needs-work', 'Fix'], ['teaching', 'Teach']];

// app: { getTeam() -> { id, name, store }, currentGameId(), hasGame(),
//        open(id, mode 'review' | 'present'), addGame(), gameMenu(id, title), menu(), roster(), onClose() }
export function createTeamHome(app) {
  const page = $('#home-page');
  const list = $('#game-cards');
  let open = false;
  let games = [];
  let loadedFor = null;

  function card(g) {
    const current = g.id === app.currentGameId();
    const title = g.title || 'Untitled game';
    const thumb = g.source && g.source.id ? thumbnailUrl(g.source.id) : '';
    const tally = g.tally || null;
    const counted = tally ? TALLY.filter(([k]) => tally[k]) : [];
    const bar = tally && g.clipCount ? `<span class="gc-bar" aria-hidden="true">${
      [...TALLY.map(([k]) => [k, tally[k] || 0]), ['none', tally.none || 0]]
        .filter(([, n]) => n).map(([k, n]) => `<i class="cat-${k}" style="flex:${n}"></i>`).join('')}</span>` : '';
    const meta = [plural(g.clipCount, 'clip'), dateText(g.updatedAt) && `updated ${dateText(g.updatedAt)}`].filter(Boolean).join(' · ');
    return `
      <li class="game-card${current ? ' current' : ''}">
        <button type="button" class="gc-thumb" data-open="review" data-gid="${esc(g.id)}" aria-label="Review ${esc(title)}">
          ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
          ${current ? '<span class="gc-now">Open now</span>' : ''}
        </button>
        <div class="gc-body">
          <div class="gc-head">
            <h2 class="gc-title">${esc(title)}</h2>
            <button type="button" class="icon-btn" data-gmenu="${esc(g.id)}" data-title="${esc(title)}" aria-label="More for ${esc(title)}">${icon('dots')}</button>
          </div>
          <p class="gc-meta">${esc(meta)}</p>
          ${bar}
          ${counted.length ? `<p class="gc-tally">${counted.map(([k, label]) => `<span class="cat-${k}"><span class="dot"></span>${tally[k]} ${label}</span>`).join('')}</p>` : ''}
          ${g.coaches && g.coaches.length ? `<p class="gc-by">Clipped by ${esc(g.coaches.join(', '))}</p>` : ''}
          <div class="gc-actions">
            <button type="button" class="btn soft" data-open="review" data-gid="${esc(g.id)}">${icon('play')}Review</button>
            <button type="button" class="btn" data-open="present" data-gid="${esc(g.id)}" ${g.clipCount ? '' : 'disabled'}>${icon('tv')}Present</button>
          </div>
        </div>
      </li>`;
  }

  const addCard = () => `
    <li class="game-card add">
      <button type="button" class="gc-add" data-add-game>${icon('plus')}<span>Add game</span></button>
    </li>`;

  function render(note = '') {
    const t = app.getTeam();
    if (!t) return;
    $('#home-h').textContent = t.name;
    $('#home-back').hidden = !app.hasGame();
    $('#home-intro').textContent = note || (games.length
      ? `${plural(games.length, 'game')}, shared with every coach on ${t.name}.`
      : `No games yet. Add one: name it and paste the YouTube link.`);
    list.innerHTML = games.map(card).join('') + addCard();
  }

  async function refresh() {
    const t = app.getTeam();
    if (!t) return;
    if (loadedFor !== t.id) { games = []; loadedFor = t.id; }
    render(games.length ? '' : 'Loading games…');
    try {
      const timeout = new Promise((_, no) => setTimeout(() => no(new Error("Can't reach the team right now. Check the connection.")), LIST_TIMEOUT_MS));
      games = await Promise.race([t.store.listGames(t.id), timeout]);
      if (open) render();
    } catch (err) {
      if (open) render(err.message);
    }
  }

  function show() {
    open = true;
    page.hidden = false;
    document.body.classList.add('on-page');
    page.scrollTop = 0;
    refresh();
  }

  function close() {
    if (!open) return;
    open = false;
    page.hidden = true;
    app.onClose();
  }

  // Shows a game as opening until the team's copy arrives.
  function opening(id) {
    page.querySelectorAll(`[data-gid="${CSS.escape(id)}"]`).forEach((b) => { b.disabled = true; });
    $('#home-intro').textContent = 'Opening the game…';
  }

  page.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.home === 'close') return close();
    if (b.dataset.home === 'roster') return app.roster();
    if (b.dataset.home === 'menu') return app.menu();
    if (b.matches('[data-add-game]')) return app.addGame();
    if (b.dataset.gmenu) return app.gameMenu(b.dataset.gmenu, b.dataset.title);
    if (b.dataset.open) app.open(b.dataset.gid, b.dataset.open);
  });
  page.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.hasGame()) { e.preventDefault(); close(); }
  });

  return { show, close, refresh, render, opening, isOpen: () => open };
}

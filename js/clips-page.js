// The clips page: every clip in the game as a card, with filters (category,
// player, position, coach) and sorting. Tap a card to work on that clip; present
// just the clips showing; put the clips in a sorted order; or nudge one card
// earlier or later in the list.

import { categoryLabel, formatTime } from './clips.js?v=15';
import { playerFor, playerLabel, playerTag, positionGroup } from './roster.js?v=15';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const CATEGORY_ORDER = { good: 0, 'needs-work': 1, teaching: 2 };
const SORT_NAMES = { list: 'list order', time: 'game time', category: 'category', player: 'player number' };

// app: { getGame, openClip(id), present(ids), setOrder(ids, name), move(id, delta), onClose }
export function createClipsPage(app) {
  const page = $('#clips-page');
  const cards = $('#clip-cards');
  let open = false;
  let forGame = null; // filters reset when another game is opened
  const f = { cats: new Set(), player: '', pos: '', coach: '', sort: 'list' };

  const game = () => app.getGame();
  const roster = () => game().roster;

  function playerKey(c) {
    if (!c.players.length) return 1e6;
    return Math.min(...c.players.map((t) => {
      const p = playerFor(roster(), t);
      return p ? (p.number ?? 1e5) : (typeof t === 'number' ? t : 1e5);
    }));
  }

  function matches(c) {
    if (f.cats.size && !f.cats.has(c.category || 'none')) return false;
    if (f.player && !c.players.some((t) => String(t) === f.player)) return false;
    if (f.pos && !c.players.some((t) => {
      const p = playerFor(roster(), t);
      return p && positionGroup(p.position) === f.pos;
    })) return false;
    if (f.coach && (c.by || '') !== f.coach) return false;
    return true;
  }

  function shown() {
    const all = game().clips;
    const list = all.filter(matches);
    const at = new Map(all.map((c, i) => [c.id, i]));
    const keys = {
      list: (c) => at.get(c.id),
      time: () => 0,
      category: (c) => CATEGORY_ORDER[c.category] ?? 3,
      player: playerKey,
    };
    const key = keys[f.sort] || keys.list;
    if (f.sort !== 'list') list.sort((a, b) => (key(a) - key(b)) || (a.mark - b.mark) || (a.start - b.start));
    return list;
  }

  const filtering = () => !!(f.cats.size || f.player || f.pos || f.coach);

  function renderTools() {
    const g = game();
    $('#cp-game').textContent = g.title || '';
    $$('#cp-cats [data-fcat]').forEach((b) => {
      const on = f.cats.has(b.dataset.fcat);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });

    // Only players and coaches who are on a clip.
    const tagged = new Set(g.clips.flatMap((c) => c.players.map(String)));
    const players = roster().filter((p) => tagged.has(String(playerTag(p))))
      .sort((a, b) => ((a.number ?? 1e5) - (b.number ?? 1e5)) || a.name.localeCompare(b.name));
    const known = new Set(players.map((p) => String(playerTag(p))));
    const loose = [...tagged].filter((t) => !known.has(t)); // numbers not on the roster
    $('#cp-player').innerHTML = '<option value="">All players</option>'
      + players.map((p) => `<option value="${esc(playerTag(p))}">${esc(playerLabel(roster(), playerTag(p)))}</option>`).join('')
      + loose.map((t) => `<option value="${esc(t)}">${esc(/^\d+$/.test(t) ? `#${t}` : 'Player')}</option>`).join('');
    if (![...$('#cp-player').options].some((o) => o.value === f.player)) f.player = '';
    $('#cp-player').value = f.player;
    $('#cp-player').closest('.cp-pick').hidden = !tagged.size;

    const groups = new Set(players.map((p) => positionGroup(p.position)).filter(Boolean));
    $('#cp-pos').closest('.cp-pick').hidden = groups.size < 2;
    $('#cp-pos').value = f.pos;

    const coaches = [...new Set(g.clips.map((c) => c.by).filter(Boolean))].sort();
    $('#cp-coach').innerHTML = '<option value="">Everyone</option>'
      + coaches.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (!coaches.includes(f.coach)) f.coach = '';
    $('#cp-coach').value = f.coach;
    $('#cp-coach').closest('.cp-pick').hidden = coaches.length < 2;

    $('#cp-sort').value = f.sort;
  }

  function card(c, list) {
    const i = game().clips.indexOf(c);
    const players = c.players.map((t) => playerLabel(roster(), t));
    const movable = f.sort === 'list' && !filtering();
    const at = list.indexOf(c);
    return `
      <li class="clip-card cat-${esc(c.category)}">
        <button type="button" class="cc-open" data-id="${esc(c.id)}" aria-label="Open clip ${i + 1}${c.title ? `, ${esc(c.title)}` : ''}">
          <span class="cc-top">
            <span class="cc-num">${i + 1}</span>
            <span class="cc-time">${formatTime(c.start)}</span>
            <span class="cc-len">${c.end - c.start}s</span>
            <span class="bar-space"></span>
            <span class="cc-cat"><span class="dot"></span>${esc(c.category ? categoryLabel(c.category) : 'Untagged')}</span>
          </span>
          <span class="cc-title${c.title ? '' : ' untitled'}">${esc(c.title || `Clip ${i + 1}`)}</span>
          ${players.length ? `<span class="cc-players">${players.map((p) => `<span class="cc-player">${esc(p)}</span>`).join('')}</span>` : ''}
          ${c.notes ? `<span class="cc-notes">${esc(c.notes)}</span>` : ''}
          ${c.by ? `<span class="cc-by">${esc(c.by)}</span>` : ''}
        </button>
        ${movable ? `<div class="cc-move">
          <button type="button" class="icon-btn" data-move="-1" data-mid="${esc(c.id)}" aria-label="Move clip ${i + 1} earlier" ${at === 0 ? 'disabled' : ''}>${icon('chev-l')}</button>
          <button type="button" class="icon-btn" data-move="1" data-mid="${esc(c.id)}" aria-label="Move clip ${i + 1} later" ${at === list.length - 1 ? 'disabled' : ''}>${icon('chev-r')}</button>
        </div>` : ''}
      </li>`;
  }

  function render() {
    if (!open) return;
    const g = game();
    const key = g.source && g.source.id;
    if (forGame !== key) {
      forGame = key;
      Object.assign(f, { cats: new Set(), player: '', pos: '', coach: '', sort: 'list' });
    }
    renderTools();
    const list = shown();
    const total = list.reduce((s, c) => s + (c.end - c.start), 0);
    const n = g.clips.length;
    $('#cp-count').textContent = !n ? ''
      : filtering() ? `Showing ${list.length} of ${n} clips · ${formatTime(total)}`
        : `${n} clip${n === 1 ? '' : 's'} · ${formatTime(total)} of video`;
    $('#cp-clear').hidden = !filtering();
    const apply = $('#cp-apply');
    apply.hidden = f.sort === 'list' || filtering() || n < 2;
    apply.textContent = `Use this order (${SORT_NAMES[f.sort]})`;
    page.querySelector('[data-cp="present"]').disabled = !list.length;
    cards.innerHTML = !n ? '<li class="empty">No clips yet. Press Clip it while you watch the game.</li>'
      : list.length ? list.map((c) => card(c, list)).join('')
        : '<li class="empty">No clips match. Try fewer filters.</li>';
  }

  function show() {
    open = true;
    page.hidden = false;
    document.body.classList.add('on-page');
    render();
    page.scrollTop = 0;
  }

  function close() {
    if (!open) return;
    open = false;
    page.hidden = true;
    app.onClose();
  }

  page.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cp === 'close') return close();
    if (b.dataset.cp === 'present') {
      const ids = shown().map((c) => c.id);
      close();
      return app.present(ids);
    }
    if (b.dataset.fcat != null) {
      const k = b.dataset.fcat;
      if (f.cats.has(k)) f.cats.delete(k); else f.cats.add(k);
      return render();
    }
    if (b.id === 'cp-clear') {
      Object.assign(f, { cats: new Set(), player: '', pos: '', coach: '' });
      return render();
    }
    if (b.id === 'cp-apply') {
      app.setOrder(shown().map((c) => c.id), SORT_NAMES[f.sort]);
      f.sort = 'list';
      return render();
    }
    if (b.dataset.move) {
      app.move(b.dataset.mid, Number(b.dataset.move));
      render();
      const again = cards.querySelector(`[data-mid="${CSS.escape(b.dataset.mid)}"][data-move="${b.dataset.move}"]`);
      if (again && !again.disabled) again.focus();
      return;
    }
    if (b.dataset.id) {
      close();
      app.openClip(b.dataset.id);
    }
  });
  page.addEventListener('change', (e) => {
    const map = { 'cp-player': 'player', 'cp-pos': 'pos', 'cp-coach': 'coach', 'cp-sort': 'sort' };
    if (map[e.target.id]) { f[map[e.target.id]] = e.target.value; render(); }
  });
  page.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.target.matches('select')) { e.preventDefault(); close(); }
  });

  return { show, close, render, isOpen: () => open };
}

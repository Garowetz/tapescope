// The team roster page: 17 lineup spots (2 goalies, 3 defence pairs, 3 forward
// lines) plus extra players, with import and export of the team file.
// Every change is saved straight away through app.setRoster.

import { SLOTS, POSITIONS, placeRoster, normalizeRoster, rosterToCsv } from './roster.js?v=9';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const POS_NAMES = { G: 'Goalie', LD: 'Left defence', RD: 'Right defence', LW: 'Left wing', C: 'Centre', RW: 'Right wing' };

// app: { getRoster, setRoster(roster), toast, importFile(), onClose() }
export function createRosterPage(app) {
  const page = $('#roster-page');
  const groups = $('#roster-groups');
  let open = false;
  let extraCount = 0;

  const row = (slot, p) => `
    <div class="r-row" data-slot="${slot.id}">
      <span class="r-pos" title="${POS_NAMES[slot.pos]}">${slot.pos}</span>
      <input type="text" class="r-num" inputmode="numeric" maxlength="3" placeholder="#" value="${p ? p.number : ''}"
        aria-label="${slot.set} ${POS_NAMES[slot.pos]} jersey number">
      <input type="text" class="r-name" placeholder="Name" autocomplete="off" value="${p ? esc(p.name) : ''}"
        aria-label="${slot.set} ${POS_NAMES[slot.pos]} name">
    </div>`;

  const extraRow = (p = { number: '', name: '', position: 'F' }) => `
    <div class="r-row extra" data-extra="${extraCount++}">
      <select class="r-posel" aria-label="Position">
        ${POSITIONS.map((x) => `<option${x === p.position ? ' selected' : ''}>${x}</option>`).join('')}
        ${POSITIONS.includes(p.position) || !p.position ? '' : `<option selected>${esc(p.position)}</option>`}
      </select>
      <input type="text" class="r-num" inputmode="numeric" maxlength="3" placeholder="#" value="${p.number}" aria-label="Extra player jersey number">
      <input type="text" class="r-name" placeholder="Name" autocomplete="off" value="${esc(p.name)}" aria-label="Extra player name">
      <button type="button" class="icon-btn" data-remove aria-label="Remove this player"><svg class="i" aria-hidden="true"><use href="#i-x"/></svg></button>
    </div>`;

  function set(name, card) {
    const slots = SLOTS.filter((s) => s.set === name);
    const heading = name === 'Goalies' ? '' : `<h3>${name}</h3>`; // the card already says Goalies
    return `<div class="r-set">${heading}${slots.map((s) => row(s, card.slots[s.id])).join('')}</div>`;
  }

  function render() {
    const placed = placeRoster(app.getRoster());
    const sets = (prefix) => [...new Set(SLOTS.filter((s) => s.set.startsWith(prefix)).map((s) => s.set))];
    extraCount = 0;
    groups.innerHTML = `
      <section class="r-card"><h2>Goalies</h2><div class="r-sets">${set('Goalies', placed)}</div></section>
      <section class="r-card"><h2>Defence</h2><div class="r-sets">${sets('Pair').map((n) => set(n, placed)).join('')}</div></section>
      <section class="r-card forwards"><h2>Forwards</h2><div class="r-sets">${sets('Line').map((n) => set(n, placed)).join('')}</div></section>
      <section class="r-card"><h2>Extra players</h2>
        <p class="muted">Spares, call-ups, or anyone who doesn't fit the lineup above.</p>
        <div class="r-set" id="r-extras">${placed.extras.map((p) => extraRow(p)).join('')}</div>
        <button type="button" class="btn r-add" data-add><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg>Add player</button>
      </section>`;
    check();
  }

  // Reads the page back into a roster list, in lineup order.
  function read() {
    const list = [];
    for (const slot of SLOTS) {
      const el = groups.querySelector(`[data-slot="${slot.id}"]`);
      list.push({ el, number: el.querySelector('.r-num').value.trim(), name: el.querySelector('.r-name').value.trim(), position: slot.pos });
    }
    groups.querySelectorAll('[data-extra]').forEach((el) => {
      list.push({ el, number: el.querySelector('.r-num').value.trim(), name: el.querySelector('.r-name').value.trim(), position: el.querySelector('.r-posel').value });
    });
    return list;
  }

  // Flags a name with no number (it can't be tagged on a clip) and repeated numbers.
  function check() {
    const list = read();
    const seen = new Map();
    list.forEach((p) => { if (p.number) seen.set(p.number, (seen.get(p.number) || 0) + 1); });
    let missing = 0;
    let dups = 0;
    list.forEach((p) => {
      const isMissing = !p.number && !!p.name;
      const isDup = !!p.number && seen.get(p.number) > 1;
      p.el.classList.toggle('missing', isMissing);
      p.el.classList.toggle('dup', isDup);
      if (isMissing) missing++;
      if (isDup) dups++;
    });
    const msgs = [];
    if (missing) msgs.push(`${missing} player${missing === 1 ? ' needs' : 's need'} a jersey number to be tagged on clips.`);
    if (dups) msgs.push('Two players share a jersey number. Only the first is kept.');
    $('#roster-warn').textContent = msgs.join(' ');
    return list;
  }

  function save() {
    const list = check().map(({ number, name, position }) => ({ number, name, position }));
    app.setRoster(normalizeRoster(list));
  }

  function count() {
    return app.getRoster().length;
  }

  function show() {
    open = true;
    render();
    page.hidden = false;
    document.body.classList.add('on-page');
    page.scrollTop = 0;
  }

  function close() {
    if (!open) return;
    open = false;
    page.hidden = true;
    document.body.classList.remove('on-page');
    app.onClose();
  }

  function exportFile() {
    const roster = app.getRoster();
    if (!roster.length) return app.toast('Add some players first.');
    const blob = new Blob([rosterToCsv(roster)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'team-roster.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    app.toast('Roster file downloaded. Keep it with your game files.');
  }

  page.addEventListener('click', (e) => {
    const b = e.target.closest('[data-roster], [data-add], [data-remove]');
    if (!b) return;
    if (b.matches('[data-add]')) {
      $('#r-extras').insertAdjacentHTML('beforeend', extraRow());
      $('#r-extras').lastElementChild.querySelector('.r-num').focus();
      return;
    }
    if (b.matches('[data-remove]')) {
      b.closest('.r-row').remove();
      save();
      return;
    }
    const act = b.dataset.roster;
    if (act === 'close') close();
    else if (act === 'import') app.importFile();
    else if (act === 'export') exportFile();
  });
  page.addEventListener('input', (e) => {
    if (e.target.classList.contains('r-num')) e.target.value = e.target.value.replace(/\D/g, '');
    save();
  });
  page.addEventListener('change', save);
  page.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  return { show, close, render, count, isOpen: () => open };
}

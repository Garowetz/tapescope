// Team roster: the lineup layout, file parsing and export.
// A player has an id that never changes, a jersey number (or null when the coach
// doesn't know it) and a name. A clip tags a player by jersey number when they have
// one (older files only have these), otherwise by the player's id. playerFor() looks
// either up, so a player who gets a number later still matches their old tags.

// The roster page's layout: 2 goalies, 3 defence pairs, 3 forward lines (17 spots).
export const SLOTS = [
  { id: 'g1', set: 'Goalies', pos: 'G' },
  { id: 'g2', set: 'Goalies', pos: 'G' },
  ...[1, 2, 3].flatMap((n) => [
    { id: `d${n}l`, set: `Pair ${n}`, pos: 'LD' },
    { id: `d${n}r`, set: `Pair ${n}`, pos: 'RD' },
  ]),
  ...[1, 2, 3].flatMap((n) => [
    { id: `f${n}lw`, set: `Line ${n}`, pos: 'LW' },
    { id: `f${n}c`, set: `Line ${n}`, pos: 'C' },
    { id: `f${n}rw`, set: `Line ${n}`, pos: 'RW' },
  ]),
];

// Positions offered for extra players. D and F are for "plays either side".
export const POSITIONS = ['G', 'LD', 'RD', 'D', 'LW', 'C', 'RW', 'F'];
const ALIASES = {
  G: 'G', GK: 'G', GOALIE: 'G', GOALTENDER: 'G',
  LD: 'LD', RD: 'RD', D: 'D', DEF: 'D', DEFENCE: 'D', DEFENSE: 'D',
  LW: 'LW', C: 'C', CENTER: 'C', CENTRE: 'C', RW: 'RW', F: 'F', W: 'F', FWD: 'F', FORWARD: 'F',
};
export const normalizePosition = (p) => {
  const key = String(p || '').trim().toUpperCase();
  return ALIASES[key] || key;
};

const FORWARD = ['LW', 'C', 'RW'];

// Puts each player in the first free spot that matches their position, in file
// order. Anyone who doesn't fit (a third goalie, an unknown position) is an extra.
export function placeRoster(roster) {
  const slots = {};
  const extras = [];
  const free = (test) => SLOTS.find((s) => !slots[s.id] && test(s.pos));
  for (const p of roster) {
    const pos = normalizePosition(p.position);
    let slot = null;
    if (pos === 'G' || pos === 'LD' || pos === 'RD' || FORWARD.includes(pos)) slot = free((x) => x === pos);
    else if (pos === 'D') slot = free((x) => x === 'LD' || x === 'RD');
    else if (pos === 'F') slot = free((x) => FORWARD.includes(x));
    if (slot) slots[slot.id] = { ...p, position: slot.pos };
    else extras.push({ ...p, position: pos });
  }
  return { slots, extras };
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export function rosterToCsv(roster) {
  const lines = ['number,name,position', ...roster.map((p) => [p.number ?? '', p.name, p.position].map(csvCell).join(','))];
  return lines.join('\r\n') + '\r\n';
}

// The team roster is also kept in this browser, so the next game starts with it.
const TEAM_KEY = 'tapescope.team';
export function loadTeam() {
  try { return normalizeRoster(JSON.parse(localStorage.getItem(TEAM_KEY))); } catch { return []; }
}
export function saveTeam(roster) {
  try { localStorage.setItem(TEAM_KEY, JSON.stringify(roster)); } catch { /* private window: still works this visit */ }
}

const newPlayerId = () => 'p' + Math.random().toString(36).slice(2, 9);

// Keeps the order given (the lineup order). A repeated jersey number keeps its
// first place and takes the later details. A player needs a number or a name.
export function normalizeRoster(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const byNumber = new Map();
  const ids = new Set();
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const n = parseInt(p.number, 10);
    const number = Number.isFinite(n) && n >= 0 ? n : null;
    const name = p.name == null ? '' : String(p.name).trim();
    if (number == null && !name) continue;
    let id = typeof p.id === 'string' && /^p\w{2,20}$/.test(p.id) ? p.id : newPlayerId();
    while (ids.has(id)) id = newPlayerId();
    const player = { id, number, name, position: p.position == null ? '' : normalizePosition(p.position) };
    if (number != null && byNumber.has(number)) {
      Object.assign(byNumber.get(number), { name: player.name, position: player.position });
      continue;
    }
    ids.add(id);
    if (number != null) byNumber.set(number, player);
    out.push(player);
  }
  return out;
}

// What a clip stores to tag this player.
export const playerTag = (p) => (p.number != null ? p.number : p.id);
export const isPlayerTag = (t) => (Number.isInteger(t) && t >= 0) || (typeof t === 'string' && /^p\w{2,20}$/.test(t));

export function playerFor(roster, tag) {
  return roster.find((p) => (typeof tag === 'string' ? p.id === tag : p.number === tag)) || null;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  let cols = { number: 0, name: 1, position: 2 };
  const first = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = !/^\d*$/.test(first[0] || '') || ['number', '#', 'no', 'name'].includes(first[0]);
  if (hasHeader) {
    const find = (names, fallback) => {
      const i = first.findIndex((c) => names.includes(c));
      return i >= 0 ? i : fallback;
    };
    cols = {
      number: find(['number', '#', 'no', 'no.', 'jersey', 'num'], 0),
      name: find(['name', 'player'], 1),
      position: find(['position', 'pos'], 2),
    };
  }
  return lines.slice(hasHeader ? 1 : 0).map((line) => {
    const c = splitCsvLine(line);
    return { number: c[cols.number], name: c[cols.name], position: c[cols.position] };
  });
}

// Accepts a team CSV (number,name,position), a JSON array, or JSON with a "roster" array
// (so a saved game file also works as a team file).
export function parseRosterText(text, filename = '') {
  const trimmed = text.trim();
  let rows;
  if (/\.json$/i.test(filename) || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    rows = Array.isArray(data) ? data : data && data.roster;
  } else {
    rows = parseCsv(text);
  }
  const roster = normalizeRoster(rows);
  if (!roster.length) throw new Error('No players found. The team file needs number,name,position columns.');
  return roster;
}

// "#12 Sam", "#12", or "Sam" for a player without a number.
export function playerLabel(roster, tag) {
  const p = playerFor(roster, tag);
  if (!p) return typeof tag === 'number' ? `#${tag}` : 'Player';
  if (p.number == null) return p.name || 'Player';
  return p.name ? `#${p.number} ${p.name}` : `#${p.number}`;
}

// Without names (a TV, a link sent on): the number, or "Player" when there is none.
export function playerNumberLabel(roster, tag) {
  const p = playerFor(roster, tag);
  if (p && p.number != null) return `#${p.number}`;
  return typeof tag === 'number' ? `#${tag}` : 'Player';
}

// G, D or F for filtering, or '' when unknown.
export function positionGroup(position) {
  const pos = normalizePosition(position);
  if (pos === 'G') return 'G';
  if (['LD', 'RD', 'D'].includes(pos)) return 'D';
  if (['LW', 'C', 'RW', 'F'].includes(pos)) return 'F';
  return '';
}

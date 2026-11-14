// Team roster: the lineup layout, file parsing and export. Clips store jersey
// numbers only; names are looked up here.

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
  const lines = ['number,name,position', ...roster.map((p) => [p.number, p.name, p.position].map(csvCell).join(','))];
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

// Keeps the order given (the lineup order). A repeated jersey number keeps its
// first place and takes the later details.
export function normalizeRoster(raw) {
  if (!Array.isArray(raw)) return [];
  const byNumber = new Map();
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const number = parseInt(p.number, 10);
    if (!Number.isFinite(number)) continue;
    byNumber.set(number, {
      number,
      name: p.name == null ? '' : String(p.name).trim(),
      position: p.position == null ? '' : normalizePosition(p.position),
    });
  }
  return [...byNumber.values()];
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
  const hasHeader = !/^\d+$/.test(first[0] || '');
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

export function playerLabel(roster, number) {
  const p = roster.find((x) => x.number === number);
  return p && p.name ? `#${number} ${p.name}` : `#${number}`;
}

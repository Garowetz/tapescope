// Team file parsing. Clips store jersey numbers only; names are looked up here.

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
      position: p.position == null ? '' : String(p.position).trim(),
    });
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
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

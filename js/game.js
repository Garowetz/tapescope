// The game object: one video, its clips and a copy of the roster.
// Every storage adapter reads and writes this shape and nothing else.

import { CATEGORIES, clampWindow } from './clips.js?v=9';
import { normalizeRoster } from './roster.js?v=9';

export const SCHEMA_VERSION = 1;

export function newGame() {
  return { schemaVersion: SCHEMA_VERSION, title: '', source: null, roster: [], clips: [] };
}

// Turns anything loaded from a file, a link or the browser into a valid game.
// Throws if it isn't a game at all. Older schema versions get upgraded here.
export function normalizeGame(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('This is not a Tape Scope game file.');
  }
  const version = Number(raw.schemaVersion) || 1;
  if (version > SCHEMA_VERSION) {
    throw new Error('This game was saved by a newer version of Tape Scope. Reload the site and try again.');
  }
  if (!Array.isArray(raw.clips) && !raw.source) {
    throw new Error('This is not a Tape Scope game file.');
  }

  const game = newGame();
  game.title = typeof raw.title === 'string' ? raw.title : '';
  if (raw.source && typeof raw.source.id === 'string' && raw.source.id) {
    game.source = { type: raw.source.type || 'youtube', id: raw.source.id };
  }
  game.roster = normalizeRoster(raw.roster);

  const categoryIds = CATEGORIES.map((c) => c.id);
  const seen = new Set();
  (raw.clips || []).forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const mark = Number.isFinite(+c.mark) ? Math.max(0, Math.round(+c.mark)) : Math.round(+c.start || 0);
    const [start, end] = clampWindow(+c.start || 0, +c.end || 0, 0);
    let id = typeof c.id === 'string' && c.id ? c.id : 'c' + (i + 1);
    while (seen.has(id)) id += 'x';
    seen.add(id);
    game.clips.push({
      id,
      mark,
      start,
      end,
      title: typeof c.title === 'string' ? c.title : '',
      category: categoryIds.includes(c.category) ? c.category : '',
      players: Array.isArray(c.players)
        ? [...new Set(c.players.map((n) => parseInt(n, 10)).filter(Number.isFinite))]
        : [],
      notes: typeof c.notes === 'string' ? c.notes : '',
      drawings: Array.isArray(c.drawings) ? c.drawings : [],
    });
    // Who clipped it (added later; older files simply have none).
    if (typeof c.by === 'string' && c.by.trim()) game.clips[game.clips.length - 1].by = c.by.trim().slice(0, 40);
  });
  return game;
}

// Share link adapter: the whole game, compressed into the URL hash (#g=...).
// Nothing is sent to a server; the part after # never leaves the browser.
// The roster is left out unless includeNames is on, so a forwarded link carries
// jersey numbers only.

import { normalizeGame } from '../game.js?v=7';

const PREFIX = '#g=';
export const LONG_LINK = 2000; // past this, some texting and email apps cut links off

function compact(game, includeNames) {
  const out = { schemaVersion: game.schemaVersion, title: game.title, source: game.source };
  if (includeNames && game.roster.length) out.roster = game.roster;
  out.clips = game.clips.map((c) => {
    const clip = { id: c.id, mark: c.mark, start: c.start, end: c.end };
    if (c.title) clip.title = c.title;
    if (c.category) clip.category = c.category;
    if (c.players.length) clip.players = c.players;
    if (c.notes) clip.notes = c.notes;
    if (c.drawings.length) clip.drawings = c.drawings;
    return clip;
  });
  return out;
}

export const linkStore = {
  // Returns the full share URL.
  save(game, { includeNames = false } = {}) {
    const packed = window.LZString.compressToEncodedURIComponent(JSON.stringify(compact(game, includeNames)));
    return location.origin + location.pathname + PREFIX + packed;
  },
  // Returns a game, or null if the hash is not a share link. Throws if it is damaged.
  load(hash) {
    if (!hash || !hash.startsWith(PREFIX)) return null;
    const text = window.LZString.decompressFromEncodedURIComponent(hash.slice(PREFIX.length));
    if (!text) throw new Error('This share link is damaged or was cut off. Ask for the game file instead.');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('This share link is damaged or was cut off. Ask for the game file instead.');
    }
    return normalizeGame(data);
  },
};

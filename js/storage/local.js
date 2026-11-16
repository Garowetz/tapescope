// Storage adapters all take and return the game object from game.js:
//   save(game, options)   load(input) -> game, or null if there is nothing to load
// local.js  autosave in this browser (localStorage)
// file.js   game file download / open
// link.js   share link in the URL hash
// A team Google Sheet adapter (Phase 5) slots in beside these.

import { normalizeGame } from '../game.js?v=15';

const KEY = 'tapescope.game';

export const localStore = {
  save(game) {
    try {
      localStorage.setItem(KEY, JSON.stringify(game));
      return true;
    } catch {
      return false; // private window or storage full: the app still works, it just won't autosave
    }
  },
  load() {
    try {
      const text = localStorage.getItem(KEY);
      return text ? normalizeGame(JSON.parse(text)) : null;
    } catch {
      return null;
    }
  },
};

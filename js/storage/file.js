// Game file adapter: "Save game" downloads JSON, "Open game" reads it back.
// The game file is the reliable copy. It includes the roster with names, so it
// belongs in the coaches' shared folder, never in this repo.

import { normalizeGame } from '../game.js?v=14';

function slug(title) {
  const s = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'game';
}

export const fileStore = {
  save(game) {
    const blob = new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(game.title)}.tapescope.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async load(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('That file is not a Tape Scope game file.');
    }
    return normalizeGame(data);
  },
};

// Keeps the game on screen and the team's copy in step. The app edits its game
// object as it always has and calls changed(); this works out what changed since
// the last sync and saves just that. Edits from other coaches come in through
// onRemote. No Firebase here: it talks to the team store interface only.
//
// createTeamSync({ store, teamId, getGame, onOpen(game, id), onRemote(game),
//                  onCreated(id), onGone(), onError(err), onStatus({ saving }) })
//   open(gameId)   start following a team game; onOpen gets its first copy
//   changed()      the game on screen was edited; saves shortly
//   flush()        save now
//   detach()       stop following (the next save with a video makes a new team game)
//   gameId         the team game being followed, or null

import { normalizeGame } from './game.js?v=14';

const infoOf = (game) => JSON.stringify({
  title: game.title,
  source: game.source,
  roster: game.roster,
  order: game.clips.map((c) => c.id),
});

function snapOf(game) {
  return { info: infoOf(game), clips: new Map(game.clips.map((c) => [c.id, JSON.stringify(c)])) };
}

function same(a, b) {
  if (!a || !b || a.info !== b.info || a.clips.size !== b.clips.size) return false;
  for (const [id, json] of a.clips) if (b.clips.get(id) !== json) return false;
  return true;
}

export const SAVE_DELAY_MS = 700;

// Puts edits that never reached the team (see unsaved()) back on top of the
// team's copy: their clips replace the team's, their deletions stay deleted.
export function mergeUnsaved(game, u) {
  const byId = new Map(game.clips.map((c) => [c.id, c]));
  for (const id of u.deleted || []) byId.delete(id);
  for (const c of u.clips || []) byId.set(c.id, c);
  const order = u.info ? u.info.order : game.clips.map((c) => c.id);
  const ids = [...new Set([...order, ...byId.keys()])].filter((id) => byId.has(id));
  const head = u.info ? { title: u.info.title, source: u.info.source, roster: u.info.roster } : {};
  return normalizeGame({ ...game, ...head, clips: ids.map((id) => byId.get(id)) });
}

export function createTeamSync({
  store, teamId, getGame, onOpen, onRemote, onCreated = () => {}, onGone, onError, onStatus = () => {},
}) {
  let gameId = null;
  let stop = null;
  let last = null;      // the team's copy as of the last sync
  let timer = null;
  let loaded = false;   // the first copy of the game has arrived
  let pending = false;  // edits not yet confirmed by the server
  let creating = false; // a new team game is being made from the game on screen
  let generation = 0;   // bumped whenever the followed game changes

  // confirmed: called from a server copy with nothing of ours outstanding.
  const status = (confirmed = false) => onStatus({ saving: !!timer || pending, gameId, confirmed });

  function detach() {
    generation += 1;
    clearTimeout(timer);
    timer = null;
    if (stop) stop();
    stop = null;
    gameId = null;
    last = null;
    loaded = false;
    pending = false;
  }

  function follow(id, { fresh }) {
    detach();
    gameId = id;
    loaded = !fresh;
    stop = store.watchGame(teamId, id, (game, meta) => {
      pending = meta.pending;
      const incoming = snapOf(game);
      if (!loaded) {
        loaded = true;
        last = incoming;
        onOpen(game, id);
        status();
        return;
      }
      // Local edits not saved yet: save them first. The save comes back as a
      // fresh copy that has both theirs and ours.
      if (timer || !same(snapOf(getGame()), last)) {
        flush();
        return;
      }
      last = incoming;
      if (!same(incoming, snapOf(getGame()))) onRemote(game);
      status(!meta.pending && !timer && !meta.fromCache);
    }, (err) => {
      if (/deleted/i.test(err.message)) {
        detach();
        onGone();
      } else {
        onError(err);
      }
      status();
    });
  }

  function changed() {
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
    status();
  }

  async function flush() {
    clearTimeout(timer);
    timer = null;
    const game = getGame();
    if (!game.source) { status(); return; }
    try {
      if (!gameId) {
        if (creating) { changed(); return; }
        creating = true;
        const sent = snapOf(game);
        const gen = generation;
        try {
          const id = await store.createGame(teamId, game);
          // Another game was opened meanwhile: the new one stays in the list, unfollowed.
          if (gen !== generation || getGame() !== game) return;
          follow(id, { fresh: false });
          last = sent;
          onCreated(id);
        } finally {
          creating = false;
        }
        if (!same(snapOf(getGame()), last)) changed();
        return;
      }
      if (!loaded) return; // still waiting for the first copy; it will compare then
      const now = snapOf(game);
      const info = now.info !== last.info ? JSON.parse(now.info) : null;
      const clips = game.clips.filter((c) => now.clips.get(c.id) !== last.clips.get(c.id));
      const deleted = [...last.clips.keys()].filter((id) => !now.clips.has(id));
      if (!info && !clips.length && !deleted.length) return;
      const prev = last;
      const gen = generation;
      last = now;
      try {
        await store.saveChanges(teamId, gameId, { info, clips, deleted });
      } catch (err) {
        // Not saved: count it as unsaved again and retry, unless access is gone.
        if (gen === generation && last === now) {
          last = prev;
          if (!/access/i.test(err.message)) changed();
        }
        throw err;
      }
    } catch (err) {
      onError(err);
    } finally {
      status();
    }
  }

  // Edits on screen the team hasn't got yet, as { gameId, info, clips, deleted },
  // or null. Kept by the app when the page hides, in case the save can't finish.
  function unsaved() {
    if (!gameId || !loaded || !last) return null;
    const game = getGame();
    const now = snapOf(game);
    if (same(now, last) && !timer) return null;
    return {
      gameId,
      info: JSON.parse(now.info),
      clips: game.clips.filter((c) => now.clips.get(c.id) !== last.clips.get(c.id)),
      deleted: [...last.clips.keys()].filter((id) => !now.clips.has(id)),
    };
  }

  // Save now and wait (up to ms) for the server to confirm, e.g. before a reload.
  async function settle(ms = 3000) {
    await flush();
    const until = Date.now() + ms;
    while ((pending || creating) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  }

  return {
    open: (id) => follow(id, { fresh: true }),
    changed,
    flush,
    settle,
    detach,
    unsaved,
    get gameId() { return gameId; },
  };
}

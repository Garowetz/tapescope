// Team storage: shared games for a team, behind one interface so the backend
// can be swapped. The app imports this file only, never a backend directly.
// Today's backend is Firebase (firebase.js). Another backend is a new file with
// the same methods and a one-line change below. The backend loads only when a
// team or the admin page is used, so local-only use downloads nothing extra.
//
// Methods (all async unless noted):
//   teamLink(teamId)                   -> { name } or null. Public; no sign-in.
//   signIn(teamId, password, keep)     keep = stay signed in on this device
//   signOut()
//   whoAmI()                           -> { uid, teamId, google, name } or null
//   listGames(teamId)                  -> [{ id, title, updatedAt, clipCount }]
//   createGame(teamId, game)           -> gameId at once (saves in the background)
//   watchGame(teamId, gameId, onChange(game, { pending }), onError) -> stop()  (not async)
//   saveChanges(teamId, gameId, { info, clips, deleted })   one atomic edit; returns
//                                      before the server confirms (works offline)
//   onWriteError(fn)                   (not async) where background write failures go
//   saveGameInfo(teamId, gameId, { title, source, roster, order })
//   saveClip(teamId, gameId, clip)
//   deleteClip(teamId, gameId, clipId)
//   deleteGame(teamId, gameId)
//   loadRoster(teamId) / saveRoster(teamId, players)
//   Admin only: adminSignIn(), listTeams(), createTeam({ id, name, password }),
//   resetTeamPassword(teamId, password)

let backend;

export async function teamStore() {
  if (!backend) backend = (await import('./firebase.js?v=14')).firebaseStore;
  return backend;
}

// Team ids appear in links: lower case letters, digits and dashes.
export const TEAM_ID = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export function teamIdFromName(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 32);
}

export function teamUrl(teamId) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return `${base}?team=${encodeURIComponent(teamId)}`;
}

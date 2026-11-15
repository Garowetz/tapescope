// Firebase backend for team storage. The only file that imports Firebase.
// See team.js for the interface. Data layout:
//   teamLinks/{teamId}                     { name, login }   readable by anyone with the id
//   teams/{teamId}                         { name, uid, login, created }
//   teams/{teamId}/roster/current          { players, updatedAt }
//   teams/{teamId}/games/{gameId}          { title, source, roster, order, clipCount, schemaVersion, createdAt, updatedAt }
//   teams/{teamId}/games/{gameId}/clips/{clipId}   one clip, plus updatedAt
// A team signs in with one shared login (email/password with a made-up address).
// firestore.rules lets that login reach only its own team.

import { firebaseConfig } from './firebase-config.js?v=9';
import { normalizeGame, SCHEMA_VERSION } from '../game.js?v=9';

const SDK = 'https://www.gstatic.com/firebasejs/13.1.0';
const LOGIN_DOMAIN = 'teams.tapescope.invalid';
// ?emulator on localhost talks to `firebase emulators:start` instead of the real project.
const EMULATOR = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  && new URLSearchParams(location.search).has('emulator');

let fb;

async function load() {
  if (fb) return fb;
  const [appM, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let db;
  try {
    // Offline cache: games open and edits queue without a connection.
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch {
    db = F.getFirestore(app);
  }
  if (EMULATOR) {
    A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  fb = { appM, app, auth, db, A, F };
  return fb;
}

const now = () => fb.F.serverTimestamp();
const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
const loginFor = (teamId, n) => `${teamId}.${n}@${LOGIN_DOMAIN}`;
const plain = (v) => JSON.parse(JSON.stringify(v ?? null)); // drops undefined, which Firestore rejects

function friendly(err) {
  const code = (err && err.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return new Error("That password isn't right.");
  if (/too-many-requests/.test(code)) return new Error('Too many tries. Wait a few minutes and try again.');
  if (/network-request-failed|unavailable/.test(code)) return new Error("Can't reach the server. Check the connection.");
  if (/permission-denied/.test(code)) return new Error("You don't have access to that.");
  if (/popup-closed|cancelled-popup/.test(code)) return new Error('Sign-in was closed before it finished.');
  if (/weak-password/.test(code)) return new Error('That password is too short.');
  return err instanceof Error ? err : new Error(String(err));
}

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    throw friendly(e);
  }
}

// Builds a game.js game from the game record and its clip records.
function assemble(info, clipDocs) {
  const byId = new Map(clipDocs.map((d) => [d.id, d.data()]));
  const order = Array.isArray(info.order) ? info.order.filter((id) => byId.has(id)) : [];
  const listed = new Set(order);
  const rest = [...byId.keys()].filter((id) => !listed.has(id))
    .sort((a, b) => (byId.get(a).mark || 0) - (byId.get(b).mark || 0));
  const clips = [...order, ...rest].map((id) => {
    const { updatedAt, ...clip } = byId.get(id);
    return { ...clip, id };
  });
  return normalizeGame({
    schemaVersion: info.schemaVersion || 1,
    title: info.title || '',
    source: info.source || null,
    roster: info.roster || [],
    clips,
  });
}

function clipRecord(clip) {
  const { id, ...rest } = clip;
  return plain(rest);
}

// A throwaway Firebase app that creates a team login without signing the admin out.
async function makeLogin(email, password) {
  const { appM, A } = await load();
  const maker = appM.initializeApp(firebaseConfig, `maker-${Date.now()}`);
  try {
    const auth = A.initializeAuth(maker, { persistence: A.inMemoryPersistence });
    if (EMULATOR) A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await A.createUserWithEmailAndPassword(auth, email, password);
    await A.signOut(auth);
    return cred.user.uid;
  } finally {
    await appM.deleteApp(maker);
  }
}

export const firebaseStore = {
  async teamLink(teamId) {
    const { db, F } = await load();
    return guard(async () => {
      const snap = await F.getDoc(F.doc(db, 'teamLinks', teamId));
      return snap.exists() ? { name: snap.data().name || teamId } : null;
    });
  },

  async signIn(teamId, password, keep = true) {
    const { auth, db, A, F } = await load();
    return guard(async () => {
      const link = await F.getDoc(F.doc(db, 'teamLinks', teamId));
      if (!link.exists()) throw new Error('There is no team with that link. Check it with whoever sent it.');
      await A.setPersistence(auth, keep ? A.browserLocalPersistence : A.browserSessionPersistence);
      await A.signInWithEmailAndPassword(auth, link.data().login, password);
      return { teamId, name: link.data().name };
    });
  },

  async signOut() {
    const { auth, A } = await load();
    await A.signOut(auth);
  },

  async whoAmI() {
    const { auth } = await load();
    await auth.authStateReady();
    const u = auth.currentUser;
    if (!u) return null;
    const local = (u.email || '').endsWith(`@${LOGIN_DOMAIN}`) ? u.email.split('@')[0] : '';
    const google = u.providerData.some((p) => p.providerId === 'google.com');
    return {
      uid: u.uid,
      teamId: local ? local.replace(/\.\d+$/, '') : null,
      google,
      name: google ? u.displayName || u.email || '' : '',
    };
  },

  async listGames(teamId) {
    const { db, F } = await load();
    return guard(async () => {
      const snap = await F.getDocs(F.query(F.collection(db, 'teams', teamId, 'games'), F.orderBy('updatedAt', 'desc')));
      return snap.docs.map((d) => ({
        id: d.id, title: d.data().title || '', updatedAt: ms(d.data().updatedAt), clipCount: d.data().clipCount || 0,
      }));
    });
  },

  async createGame(teamId, game) {
    const { db, F } = await load();
    return guard(async () => {
      const ref = F.doc(F.collection(db, 'teams', teamId, 'games'));
      const clips = game.clips.slice(0, 450); // one batch holds 500 writes
      const batch = F.writeBatch(db);
      batch.set(ref, {
        schemaVersion: SCHEMA_VERSION,
        title: game.title || '',
        source: plain(game.source),
        roster: plain(game.roster || []),
        order: clips.map((c) => c.id),
        clipCount: clips.length,
        createdAt: now(),
        updatedAt: now(),
      });
      for (const clip of clips) batch.set(F.doc(ref, 'clips', clip.id), { ...clipRecord(clip), updatedAt: now() });
      await batch.commit();
      return ref.id;
    });
  },

  // Calls onChange with the whole game whenever it or any clip changes, on
  // this device or another. pending is true while local edits are unsent.
  watchGame(teamId, gameId, onChange, onError = () => {}) {
    let info = null;
    let clipDocs = null;
    let infoPending = false;
    let clipsPending = false;
    let stopped = false;
    const stops = [];
    const emit = () => {
      if (info && clipDocs && !stopped) onChange(assemble(info, clipDocs), { pending: infoPending || clipsPending });
    };
    const fail = (e) => { if (!stopped) onError(friendly(e)); };
    load().then(({ db, F }) => {
      if (stopped) return;
      const ref = F.doc(db, 'teams', teamId, 'games', gameId);
      stops.push(F.onSnapshot(ref, (s) => {
        if (!s.exists()) { fail(new Error('That game was deleted.')); return; }
        info = s.data();
        infoPending = s.metadata.hasPendingWrites;
        emit();
      }, fail));
      stops.push(F.onSnapshot(F.collection(ref, 'clips'), (s) => {
        clipDocs = s.docs;
        clipsPending = s.metadata.hasPendingWrites;
        emit();
      }, fail));
    }, fail);
    return () => { stopped = true; stops.forEach((f) => f()); };
  },

  async saveGameInfo(teamId, gameId, fields) {
    const { db, F } = await load();
    const data = { updatedAt: now() };
    for (const k of ['title', 'source', 'roster']) if (k in fields) data[k] = plain(fields[k]);
    if (Array.isArray(fields.order)) { data.order = fields.order; data.clipCount = fields.order.length; }
    return guard(() => F.setDoc(F.doc(db, 'teams', teamId, 'games', gameId), data, { merge: true }));
  },

  async saveClip(teamId, gameId, clip) {
    const { db, F } = await load();
    return guard(() => F.setDoc(F.doc(db, 'teams', teamId, 'games', gameId, 'clips', clip.id),
      { ...clipRecord(clip), updatedAt: now() }));
  },

  async deleteClip(teamId, gameId, clipId) {
    const { db, F } = await load();
    return guard(() => F.deleteDoc(F.doc(db, 'teams', teamId, 'games', gameId, 'clips', clipId)));
  },

  async deleteGame(teamId, gameId) {
    const { db, F } = await load();
    return guard(async () => {
      const ref = F.doc(db, 'teams', teamId, 'games', gameId);
      const clips = await F.getDocs(F.collection(ref, 'clips'));
      const batch = F.writeBatch(db);
      clips.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(ref);
      await batch.commit();
    });
  },

  async loadRoster(teamId) {
    const { db, F } = await load();
    return guard(async () => {
      const snap = await F.getDoc(F.doc(db, 'teams', teamId, 'roster', 'current'));
      return snap.exists() ? snap.data().players || [] : null;
    });
  },

  async saveRoster(teamId, players) {
    const { db, F } = await load();
    return guard(() => F.setDoc(F.doc(db, 'teams', teamId, 'roster', 'current'),
      { players: plain(players), updatedAt: now() }));
  },

  // ---- Admin (the project owner's Google account) ----

  async adminSignIn() {
    const { auth, A } = await load();
    await guard(async () => {
      await A.setPersistence(auth, A.browserLocalPersistence);
      await A.signInWithPopup(auth, new A.GoogleAuthProvider());
    });
    return this.whoAmI();
  },

  async listTeams() {
    const { db, F } = await load();
    return guard(async () => {
      const snap = await F.getDocs(F.collection(db, 'teams'));
      return snap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id, created: ms(d.data().created) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  },

  async createTeam({ id, name, password }) {
    const { db, F } = await load();
    return guard(async () => {
      if ((await F.getDoc(F.doc(db, 'teamLinks', id))).exists()) throw new Error(`A team with the id "${id}" already exists.`);
      const login = loginFor(id, 1);
      const uid = await makeLogin(login, password);
      const batch = F.writeBatch(db);
      batch.set(F.doc(db, 'teams', id), { name, uid, login, created: now() });
      batch.set(F.doc(db, 'teamLinks', id), { name, login });
      await batch.commit();
    });
  },

  // Makes a fresh login with the new password and points the team at it. The
  // old login stops working at once (the rules check the uid), so every device
  // signed in with the old password loses access to the team's data.
  async resetTeamPassword(id, password) {
    const { db, F } = await load();
    return guard(async () => {
      const team = await F.getDoc(F.doc(db, 'teams', id));
      if (!team.exists()) throw new Error('No such team.');
      const n = (parseInt(String(team.data().login || '').split('@')[0].split('.').pop(), 10) || 1) + 1;
      const login = loginFor(id, n);
      const uid = await makeLogin(login, password);
      const batch = F.writeBatch(db);
      batch.update(F.doc(db, 'teams', id), { uid, login });
      batch.update(F.doc(db, 'teamLinks', id), { login });
      await batch.commit();
    });
  },
};

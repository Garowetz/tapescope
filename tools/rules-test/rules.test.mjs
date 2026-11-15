// Run from the repo root:  npm --prefix tools/rules-test test
// Needs Java (the Firestore emulator) and firebase-tools.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
  .replace(/auth\.uid in \[[^\]]*\]/, "auth.uid in ['admin1']");
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tapescope',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teams/hawks'), { name: 'Hawks', uid: 'hawksLogin' });
    await setDoc(doc(db, 'teamLinks/hawks'), { name: 'Hawks', login: 'hawks.1@teams.tapescope.invalid' });
    await setDoc(doc(db, 'teams/hawks/games/g1'), { title: 'Game 1' });
    await setDoc(doc(db, 'teams/hawks/games/g1/clips/c1'), { title: 'Breakout' });
    await setDoc(doc(db, 'teams/owls'), { name: 'Owls', uid: 'owlsLogin' });
    await setDoc(doc(db, 'teams/owls/games/g9'), { title: 'Owls game' });
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

test('anyone can read one team link, but not list them or write', async () => {
  await assertSucceeds(getDoc(doc(as(null), 'teamLinks/hawks')));
  await assertFails(getDocs(collection(as(null), 'teamLinks')));
  await assertFails(getDocs(collection(as('stranger'), 'teamLinks')));
  await assertFails(setDoc(doc(as('hawksLogin'), 'teamLinks/hawks'), { name: 'x' }));
});

test('a team reads and writes its own games and clips', async () => {
  const db = as('hawksLogin');
  await assertSucceeds(getDoc(doc(db, 'teams/hawks')));
  await assertSucceeds(getDocs(collection(db, 'teams/hawks/games')));
  await assertSucceeds(getDocs(collection(db, 'teams/hawks/games/g1/clips')));
  await assertSucceeds(setDoc(doc(db, 'teams/hawks/games/g2'), { title: 'New' }));
  await assertSucceeds(setDoc(doc(db, 'teams/hawks/games/g1/clips/c2'), { title: 'x' }));
  await assertSucceeds(deleteDoc(doc(db, 'teams/hawks/games/g1/clips/c1')));
  await assertSucceeds(setDoc(doc(db, 'teams/hawks/roster/current'), { players: [] }));
});

test('a team cannot change its own team record or see the team list', async () => {
  const db = as('hawksLogin');
  await assertFails(setDoc(doc(db, 'teams/hawks'), { name: 'Hawks', uid: 'other' }));
  await assertFails(getDocs(collection(db, 'teams')));
});

test('a team cannot touch another team', async () => {
  const db = as('hawksLogin');
  await assertFails(getDoc(doc(db, 'teams/owls')));
  await assertFails(getDocs(collection(db, 'teams/owls/games')));
  await assertFails(setDoc(doc(db, 'teams/owls/games/g9'), { title: 'hacked' }));
  await assertFails(setDoc(doc(db, 'teams/newteam/games/g1'), { title: 'x' }));
});

test('signed-out and stray accounts get nothing', async () => {
  for (const uid of [null, 'stranger']) {
    const db = as(uid);
    await assertFails(getDoc(doc(db, 'teams/hawks')));
    await assertFails(getDocs(collection(db, 'teams/hawks/games')));
    await assertFails(setDoc(doc(db, 'teams/hawks/games/g1/clips/c3'), { title: 'x' }));
    await assertFails(setDoc(doc(db, 'teams/stray'), { name: 'Mine', uid: uid || 'x' }));
  }
});

test('an old login loses access after a password reset', async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'teams/hawks'), { name: 'Hawks', uid: 'hawksLogin2' }));
  await assertFails(getDocs(collection(as('hawksLogin'), 'teams/hawks/games')));
  await assertSucceeds(getDocs(collection(as('hawksLogin2'), 'teams/hawks/games')));
});

test('the admin can do everything', async () => {
  const db = as('admin1');
  await assertSucceeds(getDocs(collection(db, 'teams')));
  await assertSucceeds(getDocs(collection(db, 'teamLinks')));
  await assertSucceeds(setDoc(doc(db, 'teams/newteam'), { name: 'New', uid: 'n1' }));
  await assertSucceeds(setDoc(doc(db, 'teamLinks/newteam'), { name: 'New', login: 'x' }));
  await assertSucceeds(getDocs(collection(db, 'teams/owls/games')));
});

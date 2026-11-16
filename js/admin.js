// Admin page (admin.html): the owner signs in with Google and manages team logins.
// Access is enforced by firestore.rules, not by this page.

import { teamStore, TEAM_ID, teamIdFromName, teamUrl } from './storage/team.js?v=15';

const $ = (s) => document.querySelector(s);
const show = (sel, on = true) => { $(sel).hidden = !on; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Easy to say and type: three short words and two digits.
const WORDS = ('puck stick blade glove skate crease slot point wing rink boards bench '
  + 'whistle zamboni pylon visor helmet laces tape twig snipe deke dangle sauce '
  + 'apple maple river cedar stone cloud frost north lake pine cabin comet '
  + 'tiger otter moose eagle falcon raven bison lynx badger heron trout').split(' ');

function makePassword() {
  const n = new Uint32Array(5);
  crypto.getRandomValues(n);
  const w = [0, 1, 2].map((i) => WORDS[n[i] % WORDS.length]);
  return `${w.join('-')}-${String(n[3] % 90 + 10)}`;
}

let store;
let idTouched = false;

function error(msg) {
  $('#err').textContent = msg || '';
  show('#err', !!msg);
}

async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch {
    prompt('Copy this:', text);
  }
}

function showMade(name, id, password, verb) {
  const url = teamUrl(id);
  const box = $('#made');
  box.innerHTML = `<strong>${esc(name)} ${verb}.</strong>
    <span>Link: <code>${esc(url)}</code></span>
    <span>Password: <code>${esc(password)}</code></span>
    <span class="muted">Send the link and the password separately. The password isn't shown again.</span>
    <span class="row"><button class="btn outline" type="button" data-copy="${esc(url)}">Copy link</button>
    <button class="btn outline" type="button" data-copy="${esc(password)}">Copy password</button></span>`;
  show('#made');
}

async function renderTeams() {
  const teams = await store.listTeams();
  $('#teams').innerHTML = teams.length ? teams.map((t) => `
    <li class="team">
      <span class="team-name">${esc(t.name)}</span>
      <span class="team-link">${esc(teamUrl(t.id))}</span>
      <span class="row">
        <button class="btn outline" type="button" data-copy="${esc(teamUrl(t.id))}">Copy link</button>
        <button class="btn outline" type="button" data-reset="${esc(t.id)}" data-name="${esc(t.name)}">New password</button>
      </span>
    </li>`).join('') : '<li class="muted">No teams yet.</li>';
}

async function refresh() {
  const me = await store.whoAmI();
  show('#signin', !me || !me.google);
  show('#sign-out', !!me);
  $('#who').textContent = me && me.google ? me.name : '';
  show('#panel', false);
  show('#not-admin', false);
  if (!me || !me.google) {
    $('#status').textContent = me ? 'Signed in as a team. Sign out, then sign in with Google.' : '';
    show('#status', !!me);
    return;
  }
  try {
    await renderTeams();
    show('#status', false);
    show('#panel');
  } catch {
    // The rules refuse to list teams for anyone but the admin.
    $('#my-uid').textContent = me.uid;
    show('#status', false);
    show('#not-admin');
  }
}

async function start() {
  try {
    store = await teamStore();
  } catch {
    $('#status').textContent = "Couldn't load the sign-in service. Check the connection and reload.";
    return;
  }
  $('#nt-pass').value = makePassword();
  await refresh();
}

$('#google').addEventListener('click', async () => {
  try {
    await store.adminSignIn();
  } catch (e) {
    $('#status').textContent = e.message;
    show('#status');
  }
  refresh();
});

$('#sign-out').addEventListener('click', async () => {
  await store.signOut();
  refresh();
});

$('#nt-name').addEventListener('input', () => {
  if (!idTouched) $('#nt-id').value = teamIdFromName($('#nt-name').value);
});
$('#nt-id').addEventListener('input', () => { idTouched = true; });
$('#nt-gen').addEventListener('click', () => { $('#nt-pass').value = makePassword(); });

$('#new-team').addEventListener('submit', async (e) => {
  e.preventDefault();
  error('');
  const name = $('#nt-name').value.trim();
  const id = $('#nt-id').value.trim().toLowerCase();
  const password = $('#nt-pass').value.trim();
  if (!TEAM_ID.test(id)) { error('The link name needs 3 to 32 lower-case letters, numbers or dashes.'); return; }
  if (password.length < 8) { error('Use a password of at least 8 characters.'); return; }
  $('#nt-go').disabled = true;
  try {
    await store.createTeam({ id, name, password });
    showMade(name, id, password, 'is ready');
    $('#new-team').reset();
    idTouched = false;
    $('#nt-pass').value = makePassword();
    await renderTeams();
  } catch (err) {
    error(err.message);
  } finally {
    $('#nt-go').disabled = false;
  }
});

document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) { copy(c.dataset.copy, c); return; }
  const r = e.target.closest('[data-reset]');
  if (!r) return;
  const name = r.dataset.name;
  const password = prompt(`New password for ${name}? Everyone signed in now will have to sign in again.`, makePassword());
  if (!password) return;
  if (password.trim().length < 8) { error('Use a password of at least 8 characters.'); return; }
  error('');
  r.disabled = true;
  try {
    await store.resetTeamPassword(r.dataset.reset, password.trim());
    showMade(name, r.dataset.reset, password.trim(), 'has a new password');
  } catch (err) {
    error(err.message);
  } finally {
    r.disabled = false;
  }
});

start();

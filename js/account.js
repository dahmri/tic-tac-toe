// Accounts in the browser: log in, sign up, play as a guest, reset a
// forgotten password with a recovery code, the profile dialog (edit,
// recovery code, download your data, delete the account), log out.
// Forms are checked with the same rules as the server for instant feedback;
// the server still has the final say.

import { api } from './api.js';
import { AVATARS, GUEST_AVATAR, avatarEmoji, avatarName } from './avatars.js';
import { countryFlag, isCountryCode, sortedCountries } from './countries.js';
import { MIN_AGE, passwordError, validateProfile, validateRegistration } from './validation.js';
import { uploadGuestGames } from './stats.js';

const $ = (id) => document.getElementById(id);

// Guests play on this device only, without an account; remembered so a
// reload doesn't send them back to the log-in form
const GUEST_KEY = 'pencil-ttt-guest';

let user = null;
let guest = false;
let handlers = { onSignIn() {}, onSignOut() {}, onGuest() {}, onEmailState() {} };

export const currentUser = () => user;
export const isGuest = () => guest;
// Online play needs a confirmed email
export const canPlayOnline = () => !!user?.emailVerified;

function rememberGuest(on) {
  try {
    if (on) localStorage.setItem(GUEST_KEY, '1');
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* storage unavailable */
  }
}

function wasGuest() {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

/* ---------- Form helpers ---------- */

function fillCountries(select) {
  const guess = /-([A-Z]{2})$/.exec(navigator.language || '')?.[1];
  select.innerHTML = '<option value="">Choose…</option>';
  for (const { code, name } of sortedCountries()) {
    select.add(new Option(`${countryFlag(code)} ${name}`, code));
  }
  if (guess && isCountryCode(guess)) select.value = guess;
}

// Latest birth date allowed: MIN_AGE years ago today
function birthDateLimit() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE);
  return d.toISOString().slice(0, 10);
}

// One radio button per avatar: native keyboard and screen reader support
function fillAvatars(form) {
  const grid = form.querySelector('[data-avatars]');
  grid.replaceChildren(
    ...AVATARS.map(({ id, emoji, name }) => {
      const label = document.createElement('label');
      label.className = 'avatar-option';
      label.title = name;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'avatar';
      input.value = id;
      input.className = 'sr-only';
      input.setAttribute('aria-label', name);
      const face = document.createElement('span');
      face.className = 'avatar-face';
      face.setAttribute('aria-hidden', 'true');
      face.textContent = emoji;
      label.append(input, face);
      return label;
    }),
  );
}

const formData = (form) => Object.fromEntries(new FormData(form));

function showErrors(form, fields = {}, message = '') {
  form.querySelectorAll('[data-err]').forEach((el) => {
    const msg = fields[el.dataset.err] || '';
    el.textContent = msg;
    // A group of radio buttons is marked on its fieldset
    const input = form.elements[el.dataset.err];
    const target = input instanceof Element ? input : el.closest('fieldset');
    target?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  });
  form.querySelector('.form-msg').textContent = message;
  const first = form.querySelector('[aria-invalid="true"]');
  (first?.matches('fieldset') ? first.querySelector('input') : first)?.focus();
}

// Disables the form while a request runs, and reports its errors in place
async function submit(form, request) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    return await request();
  } catch (err) {
    showErrors(form, err.fields, err.message);
    return null;
  } finally {
    button.disabled = false;
  }
}

/* ---------- Views ---------- */

function show(view) {
  $('loading').hidden = true;
  $('authView').hidden = view !== 'auth';
  $('gameView').hidden = view !== 'game';
}

function setAuthTab(tab) {
  document
    .querySelectorAll('[data-auth]')
    .forEach((b) => b.setAttribute('aria-selected', String(b.dataset.auth === tab)));
  $('loginForm').hidden = tab !== 'login';
  $('signupForm').hidden = tab !== 'signup';
  $('resetForm').hidden = true;
  const form = tab === 'login' ? $('loginForm') : $('signupForm');
  showErrors(form);
  form.elements[tab === 'login' ? 'username' : 'firstName'].focus();
}

function renderMe() {
  const avatar = guest ? GUEST_AVATAR.id : user.avatar;
  $('meAvatar').textContent = avatarEmoji(avatar);
  $('meAvatar').title = guest ? GUEST_AVATAR.name : avatarName(avatar);
  $('meName').textContent = guest ? 'Guest' : user.username;
  $('meFlag').textContent = guest ? '' : countryFlag(user.country);
  document.querySelectorAll('[data-member]').forEach((b) => (b.hidden = guest));
  document.querySelectorAll('[data-guest]').forEach((b) => (b.hidden = !guest));
  renderEmailNotice();
}

/* ---------- Email confirmation ---------- */

// A message for the banner that outranks the usual one, e.g. "confirmed!"
let flash = '';

// The banner under the account bar, until the email is confirmed
function renderEmailNotice() {
  const box = $('emailNotice');
  const text = $('emailNoticeText');
  const action = $('emailAction');
  if (guest || !user) {
    box.hidden = true;
    return;
  }
  box.hidden = !flash && user.emailVerified;
  action.hidden = !!flash || user.emailVerified;
  if (flash) text.textContent = flash;
  else if (!user.email) {
    text.textContent = 'Add your email address to play online.';
    action.textContent = 'Add my email';
  } else if (!user.emailVerified) {
    text.textContent = `Confirm your email to play online: click the link we sent to ${user.email}.`;
    action.textContent = 'Send it again';
    action.disabled = false;
  }
}

function setFlash(message) {
  flash = message;
  renderEmailNotice();
}

async function emailAction() {
  if (!user.email) {
    openProfile();
    $('profileForm').elements.email.focus();
    return;
  }
  $('emailAction').disabled = true;
  try {
    await api('POST', '/api/me/email/resend');
    $('emailNoticeText').textContent =
      `Sent! Check your inbox for ${user.email} (and the spam folder).`;
  } catch (err) {
    $('emailNoticeText').textContent = err.message;
    $('emailAction').disabled = false;
  }
}

// The account changed in a way that may open or close online play
function setUser(u) {
  const before = canPlayOnline();
  user = u;
  renderMe();
  if (canPlayOnline() !== before) handlers.onEmailState(user);
}

// The link from the email opens the site with ?verify=<token>
async function confirmFromLink() {
  const token = new URLSearchParams(location.search).get('verify');
  if (!token) return null;
  history.replaceState(null, '', location.pathname);
  try {
    await api('POST', '/api/email/verify', { token });
    return { ok: true, message: 'Email confirmed. You can play online now!' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// Confirmed in another tab or on the phone? Check when the player comes back.
async function refreshIfPending() {
  if (!user || user.emailVerified || !user.email) return;
  try {
    const { user: fresh } = await api('GET', '/api/me');
    if (fresh.emailVerified) {
      flash = 'Email confirmed. You can play online now!';
      setUser(fresh);
    }
  } catch {
    /* offline or logged out: the next action will tell */
  }
}

function signedIn(u) {
  user = u;
  flash = '';
  guest = false;
  rememberGuest(false);
  renderMe();
  show('game');
  handlers.onSignIn(user);
}

function playAsGuest() {
  user = null;
  guest = true;
  rememberGuest(true);
  renderMe();
  show('game');
  handlers.onGuest();
}

function signedOut(tab = 'login') {
  user = null;
  guest = false;
  rememberGuest(false);
  $('loginForm').reset();
  $('signupForm').reset();
  fillCountries($('signupForm').elements.country);
  show('auth');
  setAuthTab(tab);
  handlers.onSignOut();
}

// From guest play to the forms, to make an account or log in
export const leaveGuest = () => signedOut('signup');

/* ---------- Recovery codes ---------- */

// Shows a new recovery code, which the server never shows again
function showRecovery(code, note = '') {
  $('recoveryCode').textContent = code;
  $('recoveryNote').textContent = note;
  $('recoveryDialog').showModal();
}

function showReset() {
  const form = $('resetForm');
  form.reset();
  form.elements.username.value = $('loginForm').elements.username.value;
  $('loginForm').hidden = true;
  form.hidden = false;
  showErrors(form);
  form.elements[form.elements.username.value ? 'recoveryCode' : 'username'].focus();
}

async function resetPassword(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const { username, recoveryCode, newPassword } = formData(form);
  if (!username || !recoveryCode) {
    return showErrors(form, {}, 'Enter your username and recovery code.');
  }
  const problem = passwordError(newPassword, username);
  if (problem) return showErrors(form, { newPassword: problem });
  const res = await submit(form, () =>
    api('POST', '/api/password-reset', { username, recoveryCode, newPassword }),
  );
  if (!res) return;
  signedIn(res.user);
  showRecovery(
    res.recoveryCode,
    'Your password is changed and your old code no longer works. Here is your new one.',
  );
}

async function newRecoveryCode(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const { password } = formData(form);
  if (!password) return showErrors(form, { password: 'Enter your password.' });
  const res = await submit(form, () => api('POST', '/api/me/recovery-code', { password }));
  if (!res) return;
  form.reset();
  form.elements.username.value = user.username;
  showErrors(form, {}, 'New code made. Your old one no longer works.');
  showRecovery(res.recoveryCode);
}

async function deleteAccount(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const { password } = formData(form);
  if (!password) return showErrors(form, { password: 'Enter your password.' });
  if (!window.confirm('Delete your account for good? This cannot be undone.')) return;
  const res = await submit(form, () => api('DELETE', '/api/me', { password }).then(() => true));
  if (!res) return;
  $('profileDialog').close();
  signedOut();
  $('loginForm').querySelector('.form-msg').textContent = 'Your account has been deleted.';
}

/* ---------- Profile dialog ---------- */

function openProfile() {
  const form = $('profileForm');
  for (const key of [
    'firstName',
    'lastName',
    'username',
    'email',
    'avatar',
    'birthDate',
    'country',
    'phone',
  ]) {
    form.elements[key].value = user[key] ?? '';
  }
  for (const id of ['passwordForm', 'recoveryForm', 'deleteForm']) {
    $(id).reset();
    $(id).elements.username.value = user.username;
    showErrors($(id));
  }
  showErrors(form);
  $('profileDialog').showModal();
}

async function saveProfile(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const data = formData(form);
  if (!data.email && !user.email) delete data.email; // accounts from before emails
  const { ok, value, errors } = validateProfile(data);
  if (!ok) return showErrors(form, errors);
  const res = await submit(form, () => api('PATCH', '/api/me', value));
  if (!res) return;
  flash = '';
  setUser(res.user);
  showErrors(
    form,
    {},
    res.emailSent ? `Saved. We sent a link to ${res.user.email}: click it to confirm.` : 'Saved.',
  );
}

async function changePassword(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const { currentPassword, newPassword } = formData(form);
  const problem = passwordError(newPassword, user.username);
  if (!currentPassword)
    return showErrors(form, { currentPassword: 'Enter your current password.' });
  if (problem) return showErrors(form, { newPassword: problem });
  const res = await submit(form, () =>
    api('PUT', '/api/me/password', { currentPassword, newPassword }).then(() => true),
  );
  if (!res) return;
  form.reset();
  form.elements.username.value = user.username;
  showErrors(form, {}, 'Password changed. Other devices have been logged out.');
}

/* ---------- Wiring ---------- */

export async function initAccount(callbacks) {
  handlers = { ...handlers, ...callbacks };

  for (const form of [$('signupForm'), $('profileForm')]) {
    fillAvatars(form);
    fillCountries(form.elements.country);
    form.elements.birthDate.max = birthDateLimit();
    form.elements.birthDate.min = '1900-01-01';
  }

  document
    .querySelectorAll('[data-auth]')
    .forEach((b) => b.addEventListener('click', () => setAuthTab(b.dataset.auth)));

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const { username, password } = formData(form);
    if (!username || !password) return showErrors(form, {}, 'Enter your username and password.');
    const res = await submit(form, () => api('POST', '/api/session', { username, password }));
    if (res) signedIn(res.user);
  });

  $('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const { ok, value, errors } = validateRegistration(formData(form));
    if (!ok) return showErrors(form, errors, 'Check the highlighted fields.');
    const res = await submit(form, () => api('POST', '/api/account', value));
    if (!res) return;
    signedIn(res.user);
    const added = await uploadGuestGames();
    const note = added
      ? `We added your ${added} game${added === 1 ? '' : 's'} as a guest to your stats.`
      : '';
    showRecovery(res.recoveryCode, note);
  });

  $('guestBtn').addEventListener('click', playAsGuest);
  $('emailAction').addEventListener('click', emailAction);
  window.addEventListener('focus', refreshIfPending);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshIfPending();
  });
  $('forgotBtn').addEventListener('click', showReset);
  $('backToLogin').addEventListener('click', () => setAuthTab('login'));
  $('resetForm').addEventListener('submit', resetPassword);
  $('recoveryForm').addEventListener('submit', newRecoveryCode);
  $('deleteForm').addEventListener('submit', deleteAccount);
  $('copyRecovery').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('recoveryCode').textContent);
      $('recoveryNote').textContent = 'Copied.';
    } catch {
      $('recoveryNote').textContent = 'Copy it by hand: select the code above.';
    }
  });
  $('recoverySaved').addEventListener('click', () => $('recoveryDialog').close());
  $('joinBtn').addEventListener('click', leaveGuest);
  $('profileBtn').addEventListener('click', openProfile);
  $('profileForm').addEventListener('submit', saveProfile);
  $('passwordForm').addEventListener('submit', changePassword);
  $('profileDialog')
    .querySelector('[data-close]')
    .addEventListener('click', () => $('profileDialog').close());

  $('logoutBtn').addEventListener('click', async () => {
    await api('DELETE', '/api/session').catch(() => {});
    signedOut();
  });

  const confirmed = await confirmFromLink();
  try {
    signedIn((await api('GET', '/api/me')).user);
    if (confirmed) setFlash(confirmed.message);
  } catch (err) {
    // Offline: guests carry on, others can start playing as a guest
    if (err.status === 401 || (err.status === 0 && wasGuest())) {
      if (wasGuest()) playAsGuest();
      else signedOut();
    } else if (err.status === 0) {
      signedOut();
      $('loginForm').querySelector('.form-msg').textContent =
        "You're offline. You can still play as a guest.";
    } else {
      show('auth');
      $('loginForm').querySelector('.form-msg').textContent = err.message;
    }
    // Confirmed from a device where they aren't logged in
    if (confirmed && !user) {
      $('loginForm').querySelector('.form-msg').textContent = confirmed.ok
        ? 'Email confirmed. Log in to play online.'
        : confirmed.message;
    }
  }
}

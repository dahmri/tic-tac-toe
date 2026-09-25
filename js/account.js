// Accounts in the browser: log in, sign up, play as a guest, reset a
// forgotten password with a recovery code, the profile dialog (edit,
// recovery code, download your data, delete the account), log out.
// Forms are checked with the same rules as the server for instant feedback;
// the server still has the final say.

import { api } from './api.js';
import { AVATARS, GUEST_AVATAR, avatarEmoji, avatarName } from './avatars.js';
import { lang, onLangChange, t } from './i18n.js';
import { countryFlag, isCountryCode, sortedCountries } from './countries.js';
import { MIN_AGE, passwordError, validateProfile, validateRegistration } from './validation.js';
import { uploadGuestGames } from './stats.js';
import { checkAnswer, prepareCheck } from './bot-check.js';

// Any element by id, typed loosely: the pages hold forms, dialogs and inputs
const $ = (id) => /** @type {any} */ (document.getElementById(id));

// Guests play on this device only, without an account; remembered so a
// reload doesn't send them back to the log-in form
const GUEST_KEY = 'pencil-ttt-guest';

let user = null;
let guest = false;
/** @type {{ onSignIn: (user?: any) => void, onSignOut: () => void, onGuest: () => void, onEmailState: (user?: any) => void }} */
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
  const keep = select.value;
  select.replaceChildren(new Option(t('Choose…'), ''));
  for (const { code, name } of sortedCountries()) {
    select.add(new Option(`${countryFlag(code)} ${name}`, code));
  }
  if (keep) select.value = keep;
  else if (guess && isCountryCode(guess)) select.value = guess;
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
      label.title = t(name);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'avatar';
      input.value = id;
      input.className = 'sr-only';
      input.setAttribute('aria-label', t(name));
      const face = document.createElement('span');
      face.className = 'avatar-face';
      face.setAttribute('aria-hidden', 'true');
      face.textContent = emoji;
      label.append(input, face);
      return label;
    }),
  );
}

/** @returns {Record<string, any>} */
const formData = (form) => Object.fromEntries(new FormData(form));

function showErrors(form, fields = {}, message = '') {
  form.querySelectorAll('[data-err]').forEach((el) => {
    const msg = fields[el.dataset.err] ? t(fields[el.dataset.err]) : '';
    el.textContent = msg;
    // A group of radio buttons is marked on its fieldset
    const input = form.elements[el.dataset.err];
    const target = input instanceof Element ? input : el.closest('fieldset');
    target?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  });
  form.querySelector('.form-msg').textContent = message && t(message);
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
    .forEach((/** @type {HTMLElement} */ b) =>
      b.setAttribute('aria-selected', String(b.dataset.auth === tab)),
    );
  $('loginForm').hidden = tab !== 'login';
  $('signupForm').hidden = tab !== 'signup';
  if (tab === 'signup') prepareCheck().catch(() => {});
  for (const id of ['resetForm', 'resetMailForm', 'newPasswordForm']) $(id).hidden = true;
  const form = tab === 'login' ? $('loginForm') : $('signupForm');
  showErrors(form);
  form.elements[tab === 'login' ? 'username' : 'firstName'].focus();
}

function renderMe() {
  const avatar = guest ? GUEST_AVATAR.id : user.avatar;
  $('meAvatar').textContent = avatarEmoji(avatar);
  $('meAvatar').title = t(guest ? GUEST_AVATAR.name : avatarName(avatar));
  $('meName').textContent = guest ? t('Guest') : user.username;
  $('meFlag').textContent = guest ? '' : countryFlag(user.country);
  document
    .querySelectorAll('[data-member]')
    .forEach((/** @type {HTMLElement} */ b) => (b.hidden = guest));
  document
    .querySelectorAll('[data-guest]')
    .forEach((/** @type {HTMLElement} */ b) => (b.hidden = !guest));
  $('adminBtn').hidden = guest || !user?.admin;
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
  if (flash) text.textContent = t(flash);
  else if (!user.email) {
    text.textContent = t('Add your email address to play online.');
    action.textContent = t('Add my email');
  } else if (!user.emailVerified) {
    text.textContent = t('Confirm your email to play online: click the link we sent to {email}.', {
      email: user.email,
    });
    action.textContent = t('Send it again');
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
    $('emailNoticeText').textContent = t(
      'Sent! Check your inbox for {email} (and the spam folder).',
      { email: user.email },
    );
  } catch (err) {
    $('emailNoticeText').textContent = t(err.message);
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
  $('recoveryNote').textContent = note && t(note);
  $('recoveryDialog').showModal();
}

// Shows one of the forms that replace the log-in form
function showOnly(id) {
  for (const f of ['loginForm', 'signupForm', 'resetForm', 'resetMailForm', 'newPasswordForm']) {
    $(f).hidden = f !== id;
  }
  const form = $(id);
  showErrors(form);
  return form;
}

// Forgot your password: the email link first, a recovery code as the other way
function showResetMail() {
  const form = showOnly('resetMailForm');
  form.reset();
  form.elements.login.value = $('loginForm').elements.username.value;
  form.elements.login.focus();
}

async function sendResetMail(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const login = formData(form).login.trim();
  if (!login) return showErrors(form, {}, 'Enter your username or email address.');
  const res = await submit(form, () =>
    api('POST', '/api/password-reset/email', { login }).then(() => true),
  );
  if (!res) return;
  showErrors(
    form,
    {},
    "If an account with a confirmed email matches, we've sent it a link. It works for 1 hour.",
  );
}

// The link from the email opens the site with ?reset=<token>
let resetToken = null;
async function resetFromLink() {
  const token = new URLSearchParams(location.search).get('reset');
  if (!token) return false;
  history.replaceState(null, '', location.pathname);
  show('auth');
  const { valid } = await api(
    'GET',
    `/api/password-reset/token?token=${encodeURIComponent(token)}`,
  ).catch(() => ({ valid: false }));
  if (!valid) {
    setAuthTab('login');
    showErrors(
      $('loginForm'),
      {},
      'That reset link has expired or was already used. Ask for a new one.',
    );
    return true;
  }
  resetToken = token;
  showOnly('newPasswordForm').elements.newPassword.focus();
  return true;
}

async function saveNewPassword(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const { newPassword } = formData(form);
  const problem = passwordError(newPassword);
  if (problem) return showErrors(form, { newPassword: problem });
  const res = await submit(form, () =>
    api('POST', '/api/password-reset/token', { token: resetToken, newPassword }),
  );
  if (!res) return;
  resetToken = null;
  form.reset();
  signedIn(res.user);
  setFlash('Your new password is saved. Other devices have been logged out.');
}

function showReset() {
  const form = showOnly('resetForm');
  form.reset();
  // What they typed to get an email, unless it was an email address
  const typed = $('resetMailForm').elements.login.value;
  form.elements.username.value =
    typed && !typed.includes('@') ? typed : $('loginForm').elements.username.value;
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
  if (!window.confirm(t('Delete your account for good? This cannot be undone.'))) return;
  const res = await submit(form, () => api('DELETE', '/api/me', { password }).then(() => true));
  if (!res) return;
  $('profileDialog').close();
  signedOut();
  $('loginForm').querySelector('.form-msg').textContent = t('Your account has been deleted.');
}

/* ---------- Sessions, in the profile ---------- */

const sessionTime = () =>
  new Intl.DateTimeFormat(document.documentElement.lang, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

async function loadSessions() {
  let list;
  try {
    ({ sessions: list } = await api('GET', '/api/me/sessions'));
  } catch {
    return;
  }
  $('logoutOthers').hidden = list.length < 2;
  $('sessionList').replaceChildren(
    ...list.map((s) => {
      const li = document.createElement('li');
      li.className = 'session';
      const what = document.createElement('span');
      what.className = 'session-what';
      const device = document.createElement('strong');
      device.textContent = s.device;
      const when = document.createElement('small');
      when.textContent = s.current
        ? t('This device')
        : t('Last active {when}', { when: sessionTime().format(new Date(s.seen)) });
      what.append(device, when);
      li.append(what);
      if (!s.current) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ghostbtn';
        b.textContent = t('Log out');
        b.setAttribute('aria-label', t('Log out {device}', { device: s.device }));
        b.addEventListener('click', async () => {
          b.disabled = true;
          await api('DELETE', `/api/me/sessions/${s.id}`).catch(() => {});
          loadSessions();
        });
        li.append(b);
      }
      return li;
    }),
  );
}

async function logoutOthers() {
  $('logoutOthers').disabled = true;
  try {
    await api('DELETE', '/api/me/sessions');
    $('sessionMsg').textContent = t('Logged out everywhere else.');
    loadSessions();
  } catch (err) {
    $('sessionMsg').textContent = t(err.message);
  } finally {
    $('logoutOthers').disabled = false;
  }
}

/* ---------- Blocked players, in the profile ---------- */

async function loadBlocked() {
  let list = [];
  try {
    ({ blocked: list } = await api('GET', '/api/blocks'));
  } catch {
    /* the section stays as it was */
  }
  $('blockedEmpty').hidden = list.length > 0;
  $('blockedList').replaceChildren(
    ...list.map((p) => {
      const li = document.createElement('li');
      li.className = 'player';
      const name = document.createElement('span');
      name.className = 'who-line';
      name.textContent = `${avatarEmoji(p.avatar)} ${countryFlag(p.country)} ${p.username}`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = t('Unblock');
      b.setAttribute('aria-label', t('Unblock {name}', { name: p.username }));
      b.addEventListener('click', async () => {
        b.disabled = true;
        await api('DELETE', `/api/blocks/${p.id}`).catch(() => {});
        loadBlocked();
      });
      li.append(name, b);
      return li;
    }),
  );
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
  loadBlocked();
  $('sessionMsg').textContent = '';
  loadSessions();
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
    res.emailSent
      ? t('Saved. We sent a link to {email}: click it to confirm.', { email: res.user.email })
      : 'Saved.',
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

  // A new language: country names, avatar names and the banner
  onLangChange(() => {
    for (const form of [$('signupForm'), $('profileForm')]) {
      fillCountries(form.elements.country);
      form.querySelectorAll('.avatar-option').forEach((label) => {
        const input = label.querySelector('input');
        label.title = t(avatarName(input.value));
        input.setAttribute('aria-label', label.title);
      });
    }
    if (user || guest) renderMe();
  });

  for (const form of [$('signupForm'), $('profileForm')]) {
    fillAvatars(form);
    fillCountries(form.elements.country);
    // Sign-up needs the minimum age; the profile keeps older accounts' dates
    form.elements.birthDate.max =
      form.id === 'signupForm' ? birthDateLimit() : new Date().toISOString().slice(0, 10);
    form.elements.birthDate.min = '1900-01-01';
  }

  document
    .querySelectorAll('[data-auth]')
    .forEach((/** @type {HTMLElement} */ b) =>
      b.addEventListener('click', () => setAuthTab(b.dataset.auth)),
    );

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const { username, password } = formData(form);
    if (!username || !password) return showErrors(form, {}, 'Enter your username and password.');
    const res = await submit(form, () =>
      api('POST', '/api/session', { username, password }).catch((err) => {
        // Suspended for a while: say until when
        if (err.body?.until) {
          const date = new Intl.DateTimeFormat(lang(), { dateStyle: 'long' }).format(
            new Date(err.body.until),
          );
          const message = t('This account is suspended until {date}.', { date });
          throw Object.assign(new Error(message), { fields: {} });
        }
        throw err;
      }),
    );
    if (res) signedIn(res.user);
  });

  $('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const { ok, value, errors } = validateRegistration(formData(form));
    if (!ok) return showErrors(form, errors, 'Check the highlighted fields.');
    const res = await submit(form, async () => {
      const answer = await checkAnswer().catch(() => {
        throw new Error("Couldn't check you're not a robot. Try again.");
      });
      const website = form.elements.website.value;
      try {
        return await api('POST', '/api/account', { ...value, ...answer, website });
      } finally {
        prepareCheck().catch(() => {}); // a new one, in case they try again
      }
    });
    if (!res) return;
    signedIn(res.user);
    const added = await uploadGuestGames();
    const note = !added
      ? ''
      : added === 1
        ? t('We added your game as a guest to your stats.')
        : t('We added your {n} games as a guest to your stats.', { n: added });
    showRecovery(res.recoveryCode, note);
  });

  $('guestBtn').addEventListener('click', playAsGuest);
  $('logoutOthers').addEventListener('click', logoutOthers);
  $('emailAction').addEventListener('click', emailAction);
  window.addEventListener('focus', refreshIfPending);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshIfPending();
  });
  $('forgotBtn').addEventListener('click', showResetMail);
  $('useRecoveryCode').addEventListener('click', showReset);
  document
    .querySelectorAll('[data-back-login]')
    .forEach((b) => b.addEventListener('click', () => setAuthTab('login')));
  $('resetMailForm').addEventListener('submit', sendResetMail);
  $('newPasswordForm').addEventListener('submit', saveNewPassword);
  $('resetForm').addEventListener('submit', resetPassword);
  $('recoveryForm').addEventListener('submit', newRecoveryCode);
  $('deleteForm').addEventListener('submit', deleteAccount);
  $('copyRecovery').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('recoveryCode').textContent);
      $('recoveryNote').textContent = t('Copied.');
    } catch {
      $('recoveryNote').textContent = t('Copy it by hand: select the code above.');
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

  if (await resetFromLink()) return;
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
      $('loginForm').querySelector('.form-msg').textContent = t(
        "You're offline. You can still play as a guest.",
      );
    } else {
      show('auth');
      $('loginForm').querySelector('.form-msg').textContent = t(err.message);
    }
    // Confirmed from a device where they aren't logged in
    if (confirmed && !user) {
      $('loginForm').querySelector('.form-msg').textContent = t(
        confirmed.ok ? 'Email confirmed. Log in to play online.' : confirmed.message,
      );
    }
  }
}

// Accounts in the browser: log in, sign up, the profile dialog, log out.
// Forms are checked with the same rules as the server for instant feedback;
// the server still has the final say.

import { api } from './api.js';
import { countryFlag, isCountryCode, sortedCountries } from './countries.js';
import { MIN_AGE, passwordError, validateProfile, validateRegistration } from './validation.js';

const $ = (id) => document.getElementById(id);

let user = null;
let handlers = { onSignIn() {}, onSignOut() {}, onProfile() {} };

export const currentUser = () => user;

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

const formData = (form) => Object.fromEntries(new FormData(form));

function showErrors(form, fields = {}, message = '') {
  form.querySelectorAll('[data-err]').forEach((el) => {
    const msg = fields[el.dataset.err] || '';
    el.textContent = msg;
    const input = form.elements[el.dataset.err];
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  });
  form.querySelector('.form-msg').textContent = message;
  const first = form.querySelector('[aria-invalid="true"]');
  first?.focus();
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
  const form = tab === 'login' ? $('loginForm') : $('signupForm');
  showErrors(form);
  form.elements[tab === 'login' ? 'username' : 'firstName'].focus();
}

function renderMe() {
  $('meName').textContent = user.username;
  $('meFlag').textContent = countryFlag(user.country);
}

function signedIn(u) {
  user = u;
  renderMe();
  show('game');
  handlers.onSignIn(user);
}

function signedOut() {
  user = null;
  $('loginForm').reset();
  $('signupForm').reset();
  fillCountries($('signupForm').elements.country);
  show('auth');
  setAuthTab('login');
  handlers.onSignOut();
}

/* ---------- Profile dialog ---------- */

function openProfile() {
  const form = $('profileForm');
  for (const key of ['firstName', 'lastName', 'username', 'birthDate', 'country', 'phone']) {
    form.elements[key].value = user[key] ?? '';
  }
  $('passwordForm').reset();
  $('passwordForm').elements.username.value = user.username;
  showErrors(form);
  showErrors($('passwordForm'));
  $('profileDialog').showModal();
}

async function saveProfile(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const { ok, value, errors } = validateProfile(formData(form));
  if (!ok) return showErrors(form, errors);
  const res = await submit(form, () => api('PATCH', '/api/me', value));
  if (!res) return;
  user = res.user;
  renderMe();
  handlers.onProfile(user);
  showErrors(form, {}, 'Saved.');
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
    if (res) signedIn(res.user);
  });

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

  try {
    signedIn((await api('GET', '/api/me')).user);
  } catch (err) {
    if (err.status === 401) signedOut();
    else {
      show('auth');
      $('loginForm').querySelector('.form-msg').textContent = err.message;
    }
  }
}

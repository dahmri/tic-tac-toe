// Account form rules, shared by the browser (instant feedback) and the
// server (the check that counts). Every function returns cleaned values and
// a map of field -> message for anything that isn't acceptable.

import { isAvatar } from './avatars.js';
import { isCountryCode } from './countries.js';

export const MIN_AGE = 13;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const NAME_MAX = 50;

// Letters from any alphabet, plus the spaces, hyphens, apostrophes and
// dots that real names use ("Anne-Marie", "O'Brien", "J. R.")
const NAME_RE = /^\p{L}[\p{L}\p{M}' .-]*$/u;
const USERNAME_RE = /^[A-Za-z0-9_]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// E.164: a + then the country code and number, 8 to 15 digits in all
const PHONE_RE = /^\+[1-9]\d{7,14}$/;
// Deliberately loose: the confirmation email is the real test
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
const EMAIL_MAX = 254;

const text = (v) => (typeof v === 'string' ? v.normalize('NFC').trim().replace(/\s+/g, ' ') : '');

// Messages are whole sentences (not pieced together) so they can be
// translated; the numbers in them match the limits above
const NAME_MESSAGES = {
  first: {
    empty: 'Enter your first name.',
    long: 'Keep your first name under 50 characters.',
    letters: 'Use letters only in your first name.',
  },
  last: {
    empty: 'Enter your last name.',
    long: 'Keep your last name under 50 characters.',
    letters: 'Use letters only in your last name.',
  },
};

function checkName(value, which) {
  const v = text(value);
  const msg = NAME_MESSAGES[which];
  if (!v) return [v, msg.empty];
  if ([...v].length > NAME_MAX) return [v, msg.long];
  if (!NAME_RE.test(v)) return [v, msg.letters];
  return [v, null];
}

function checkUsername(value) {
  const v = text(value);
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) {
    return [v, 'Usernames are 3 to 20 characters.'];
  }
  if (!USERNAME_RE.test(v)) return [v, 'Use letters, numbers and _ only.'];
  return [v, null];
}

// Age in whole years on `today`, from a YYYY-MM-DD string
export function ageOn(birthDate, today) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = today.getUTCFullYear() - y;
  const month = today.getUTCMonth() + 1;
  if (month < m || (month === m && today.getUTCDate() < d)) age--;
  return age;
}

function checkBirthDate(value, today) {
  const v = text(value);
  const m = DATE_RE.exec(v);
  if (!m) return [v, 'Enter your date of birth.'];
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return [v, 'That date does not exist.'];
  }
  if (y < 1900 || date > today) return [v, 'Enter your real date of birth.'];
  if (ageOn(v, today) < MIN_AGE) return [v, 'You must be at least 13 to play.'];
  return [v, null];
}

function checkCountry(value) {
  const v = text(value).toUpperCase();
  return [v, isCountryCode(v) ? null : 'Choose your country.'];
}

// Stored lowercased, so "Ann@Example.com" and "ann@example.com" are one address
function checkEmail(value) {
  const v = text(value).toLowerCase();
  if (!v) return [v, 'Enter your email address.'];
  if (v.length > EMAIL_MAX || !EMAIL_RE.test(v)) {
    return [v, 'That doesn’t look like an email address.'];
  }
  return [v, null];
}

function checkAvatar(value) {
  const v = text(value);
  return [v, isAvatar(v) ? null : 'Pick an avatar.'];
}

// Optional: empty means "no phone number"
function checkPhone(value) {
  const v = text(value).replace(/[\s().-]/g, '');
  if (!v) return [null, null];
  const phone = v.startsWith('00') ? '+' + v.slice(2) : v;
  if (!PHONE_RE.test(phone)) {
    return [phone, 'Use the international format with your country code, like +33 6 12 34 56 78.'];
  }
  return [phone, null];
}

export function passwordError(password, username = '') {
  if (typeof password !== 'string' || [...password].length < PASSWORD_MIN) {
    return 'Use at least 10 characters.';
  }
  if ([...password].length > PASSWORD_MAX) return 'Use at most 128 characters.';
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return "Your password can't contain your username.";
  }
  return null;
}

const PROFILE_CHECKS = {
  firstName: (v) => checkName(v, 'first'),
  lastName: (v) => checkName(v, 'last'),
  username: checkUsername,
  email: checkEmail,
  avatar: checkAvatar,
  birthDate: checkBirthDate,
  country: checkCountry,
  phone: checkPhone,
};

function run(input, fields, today) {
  const value = {};
  const errors = {};
  for (const field of fields) {
    const [v, err] = PROFILE_CHECKS[field](input?.[field], today);
    value[field] = v;
    if (err) errors[field] = err;
  }
  return { value, errors };
}

const ok = (result) => ({ ...result, ok: Object.keys(result.errors).length === 0 });

export function validateRegistration(input, today = new Date()) {
  const result = run(input, Object.keys(PROFILE_CHECKS), today);
  const pwError = passwordError(input?.password, result.value.username);
  if (pwError) result.errors.password = pwError;
  else result.value.password = input.password;
  return ok(result);
}

// A profile update may change any subset of the profile fields
export function validateProfile(input, today = new Date()) {
  const fields = Object.keys(PROFILE_CHECKS).filter((f) => input && f in input);
  return ok(run(input, fields, today));
}

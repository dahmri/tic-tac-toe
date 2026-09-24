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

const text = (v) => (typeof v === 'string' ? v.normalize('NFC').trim().replace(/\s+/g, ' ') : '');

function checkName(value, label) {
  const v = text(value);
  if (!v) return [v, `Enter your ${label}.`];
  if ([...v].length > NAME_MAX) return [v, `Keep your ${label} under ${NAME_MAX} characters.`];
  if (!NAME_RE.test(v)) return [v, `Use letters only in your ${label}.`];
  return [v, null];
}

function checkUsername(value) {
  const v = text(value);
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) {
    return [v, `Usernames are ${USERNAME_MIN} to ${USERNAME_MAX} characters.`];
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
  if (ageOn(v, today) < MIN_AGE) return [v, `You must be at least ${MIN_AGE} to play.`];
  return [v, null];
}

function checkCountry(value) {
  const v = text(value).toUpperCase();
  return [v, isCountryCode(v) ? null : 'Choose your country.'];
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
    return `Use at least ${PASSWORD_MIN} characters.`;
  }
  if ([...password].length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return "Your password can't contain your username.";
  }
  return null;
}

const PROFILE_CHECKS = {
  firstName: (v) => checkName(v, 'first name'),
  lastName: (v) => checkName(v, 'last name'),
  username: checkUsername,
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

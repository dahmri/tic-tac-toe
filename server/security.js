// Password hashing, encryption of personal data, and session tokens.
// Uses only Node's built-in crypto module.

import {
  argon2 as argon2Cb,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const argon2 = promisify(argon2Cb);

// Argon2id with the OWASP-recommended minimum: 19 MiB memory, 2 passes.
// Stored in the standard PHC string format, so the parameters can be raised
// later and old hashes still verify.
const ARGON = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };

const b64 = (buf) => buf.toString('base64').replace(/=+$/, '');

export async function hashPassword(password) {
  const nonce = randomBytes(16);
  const hash = await argon2('argon2id', { message: password, nonce, ...ARGON });
  const { memory: m, passes: t, parallelism: p } = ARGON;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(nonce)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(stored || '');
  if (!m) return false;
  const expected = Buffer.from(m[5], 'base64');
  const actual = await argon2('argon2id', {
    message: password,
    nonce: Buffer.from(m[4], 'base64'),
    memory: Number(m[1]),
    passes: Number(m[2]),
    parallelism: Number(m[3]),
    tagLength: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Whether a stored hash uses weaker settings than today's, so it can be
// upgraded the next time the player logs in
export function needsRehash(stored) {
  const m = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored || '');
  return !m || Number(m[1]) < ARGON.memory || Number(m[2]) < ARGON.passes;
}

// Verified against when a username doesn't exist, so a login attempt takes
// the same time whether or not the account is real
let dummyHash = null;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
}

// Personal data is sealed with AES-256-GCM: [version 1 byte][iv 12][tag 16][ciphertext].
// The version byte leaves room to rotate keys later.
const PII_VERSION = 1;
const AAD = Buffer.from('tic-tac-toe:user-pii');

export function sealPII(data, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([PII_VERSION]), iv, cipher.getAuthTag(), body]);
}

export function openPII(sealed, key) {
  if (sealed[0] !== PII_VERSION) throw new Error('Unknown personal data format');
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(1, 13));
  decipher.setAAD(AAD);
  decipher.setAuthTag(sealed.subarray(13, 29));
  const json = Buffer.concat([decipher.update(sealed.subarray(29)), decipher.final()]);
  return JSON.parse(json.toString('utf8'));
}

// Recovery codes: 20 characters from an alphabet without look-alikes
// (no 0/O, 1/I/L), shown as XXXXX-XXXXX-XXXXX-XXXXX: about 99 random bits.
// Only a hash is stored. Typed codes are matched ignoring case, spaces and
// dashes.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  const chars = Array.from({ length: 20 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return chars.join('').match(/.{5}/g).join('-');
}
export const normalizeRecoveryCode = (code) =>
  typeof code === 'string' ? code.toUpperCase().replace(/[\s-]/g, '') : '';
export const hashRecoveryCode = (code) => hashToken(normalizeRecoveryCode(code));

// Compares two hashes without leaking where they differ
export function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Keeps email addresses unique without storing them in plain form
export const emailHash = (email, key) =>
  createHmac('sha256', key).update(`email:${email.toLowerCase()}`).digest('base64url');

// Session tokens: 256 random bits for the cookie; only their SHA-256 is
// stored, so reading Redis doesn't give anyone a usable session
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('base64url');

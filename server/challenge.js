// A proof-of-work check at sign-up, instead of a CAPTCHA service: nothing
// leaves the site and nobody picks out traffic lights. The server hands
// out a signed challenge; the browser finds a nonce such that
// SHA-256(challenge + ':' + nonce) starts with `bits` zero bits (a second
// or two in a background thread, while the form is filled in), and the
// server checks it once. Cheap for one person, costly for a bot signing up
// thousands.
//
//   challenge = "<issued ms>.<random>.<signature>"
//   used:<challenge>   remembered until it expires, so each works once

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CHALLENGE_TTL_MS = 15 * 60_000;

function leadingZeroBits(buf) {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

export const solves = (challenge, nonce, bits) =>
  leadingZeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest()) >= bits;

// minAgeMs: an answer sooner than this after the challenge was issued is
// faster than a person fills in the form
export function createChallenges({ key, redis, bits, minAgeMs = 1000 }) {
  const sign = (body) =>
    createHmac('sha256', key).update(`pow:${body}`).digest('base64url').slice(0, 22);

  return {
    bits,

    issue(now = Date.now()) {
      const body = `${now}.${randomBytes(9).toString('base64url')}`;
      return { challenge: `${body}.${sign(body)}`, bits };
    },

    // null if the answer is good (and now used up), otherwise why not
    async verify(challenge, nonce, now = Date.now()) {
      if (typeof challenge !== 'string' || typeof nonce !== 'string' || nonce.length > 20) {
        return 'missing';
      }
      const parts = challenge.split('.');
      if (parts.length !== 3) return 'malformed';
      const [issued, rand, sig] = parts;
      const expected = Buffer.from(sign(`${issued}.${rand}`));
      if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), expected)) {
        return 'forged';
      }
      const age = now - Number(issued);
      if (!(age >= minAgeMs && age <= CHALLENGE_TTL_MS)) return 'expired';
      if (!solves(challenge, nonce, bits)) return 'wrong';
      const first = await redis.set(`used:${challenge}`, '1', 'PX', CHALLENGE_TTL_MS, 'NX');
      return first ? null : 'reused';
    },
  };
}

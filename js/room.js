// Room codes for online play. Codes skip look-alike characters
// (0/O, 1/I/L) so they are easy to read out loud or type.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'pencil-ttt-';
export const CODE_LENGTH = 6;

export function newRoomCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return code;
}

// Accepts what a person might type ("abc 234", "ABC-234") and returns the
// canonical code, or null if it can't be a valid code.
export function normalizeCode(input) {
  const code = String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((ch) => ALPHABET.includes(ch)) ? code : null;
}

// The host registers under this id, so a friend can find it from the code alone.
export function peerIdFor(code) {
  return PEER_PREFIX + code.toLowerCase();
}

export function codeFromHash(hash) {
  const m = /^#room-([A-Za-z0-9]+)$/.exec(hash || '');
  return m ? normalizeCode(m[1]) : null;
}

export function inviteLink(location, code) {
  return `${location.origin}${location.pathname}#room-${code}`;
}

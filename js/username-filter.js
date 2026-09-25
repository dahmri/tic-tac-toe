// Refuses usernames that are offensive or pretend to be staff. Shared by
// the sign-up form and the server. Usernames are letters, digits and _,
// so they're split into words (at _, digits and case changes) after
// undoing common look-alikes (0 → o, 1 → i, 3 → e, 4 → a, 5 → s, 7 → t);
// a word is refused if it's on a list, which avoids refusing innocent
// names that merely contain a bad word ("Scunthorpe", "assassin").
//
// The lists are deliberately short and blunt: players can report anything
// that gets through (routes/safety.js).

// Whole words, after look-alikes are undone (English, French, Spanish)
const OFFENSIVE = new Set([
  // English
  'fuck',
  'fucker',
  'fucking',
  'motherfucker',
  'shit',
  'bitch',
  'bastard',
  'cunt',
  'dick',
  'cock',
  'pussy',
  'asshole',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'fag',
  'faggot',
  'retard',
  'rapist',
  'rape',
  'nazi',
  'hitler',
  'kkk',
  'porn',
  'penis',
  'vagina',
  'wanker',
  'twat',
  // French
  'pute',
  'putain',
  'salope',
  'connard',
  'connasse',
  'encule',
  'enculé',
  'batard',
  'bâtard',
  'merde',
  'bite',
  'couille',
  'couilles',
  'nique',
  'niquer',
  'fdp',
  'pd',
  'negre',
  'nègre',
  'bougnoule',
  'youpin',
  'chienne',
  'tapette',
  'pedale',
  'pédale',
  // Spanish
  'puta',
  'puto',
  'mierda',
  'cabron',
  'cabrón',
  'pendejo',
  'pendeja',
  'gilipollas',
  'coño',
  'joder',
  'polla',
  'verga',
  'maricon',
  'maricón',
  'zorra',
  'culero',
  'chinga',
  'chingada',
  'hijoputa',
  'malparido',
  'negrata',
]);

// Words a player can't use as if they were staff
const RESERVED = new Set([
  'admin',
  'administrator',
  'moderator',
  'mod',
  'support',
  'staff',
  'system',
  'official',
  'root',
  'owner',
  'pencil',
  'tictactoe',
  'help',
  'security',
]);

const LOOK_ALIKES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };

// "xX_Sh1tLord99_Xx" → ['xx', 'shit', 'lord', 'xx'] (and the whole name,
// look-alikes undone, for names that are nothing but a bad word)
export function usernameWords(name) {
  const undone = name.replace(/[0134578]/g, (d) => LOOK_ALIKES[d]);
  const words = undone
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
  return [...words, undone.replace(/_/g, '').toLowerCase()];
}

// null if the username is fine, otherwise why it isn't
export function usernameProblem(name) {
  const words = usernameWords(name);
  if (words.some((w) => OFFENSIVE.has(w))) return "That username isn't allowed. Try another.";
  if (words.some((w) => RESERVED.has(w))) return 'That username is reserved. Try another.';
  return null;
}

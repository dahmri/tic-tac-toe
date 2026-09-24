// Player avatars: a fixed list of silly faces, shared by the browser (the
// picker, and showing players) and the server (checking the choice).
// Only the id is stored; add new ones at the end, never rename an id.

export const AVATARS = [
  { id: 'dino', emoji: '🦖', name: 'Tiny T-Rex' },
  { id: 'sloth', emoji: '🦥', name: 'Speedy Sloth' },
  { id: 'avocado', emoji: '🥑', name: 'Avocado Toast' },
  { id: 'llama', emoji: '🦙', name: 'Drama Llama' },
  { id: 'potato', emoji: '🥔', name: 'Couch Potato' },
  { id: 'octopus', emoji: '🐙', name: 'Octo-Hugger' },
  { id: 'raccoon', emoji: '🦝', name: 'Trash Panda' },
  { id: 'unicorn', emoji: '🦄', name: 'Sparkle Unicorn' },
  { id: 'alien', emoji: '👽', name: 'Lost Alien' },
  { id: 'robot', emoji: '🤖', name: 'Beep Boop' },
  { id: 'clown', emoji: '🤡', name: 'Class Clown' },
  { id: 'banana', emoji: '🍌', name: 'Top Banana' },
  { id: 'frog', emoji: '🐸', name: 'Grumpy Frog' },
  { id: 'chicken', emoji: '🐔', name: 'Panicky Chicken' },
  { id: 'cat', emoji: '😼', name: 'Smug Cat' },
  { id: 'nerd', emoji: '🤓', name: 'Big Brain' },
  { id: 'cowboy', emoji: '🤠', name: 'Yeehaw' },
  { id: 'penguin', emoji: '🐧', name: 'Tuxedo Penguin' },
  { id: 'taco', emoji: '🌮', name: 'Taco Tuesday' },
  { id: 'donut', emoji: '🍩', name: 'Donut Worry' },
  { id: 'cactus', emoji: '🌵', name: 'Hug Me Cactus' },
  { id: 'hotdog', emoji: '🌭', name: 'Hot Diggity Dog' },
  { id: 'pig', emoji: '🐷', name: 'Piggy Bank' },
  { id: 'shark', emoji: '🦈', name: 'Baby Shark' },
  { id: 'owl', emoji: '🦉', name: 'Night Owl' },
  { id: 'hedgehog', emoji: '🦔', name: 'Spiky Hugger' },
  { id: 'flamingo', emoji: '🦩', name: 'Fancy Flamingo' },
  { id: 'goat', emoji: '🐐', name: 'The GOAT' },
  { id: 'zombie', emoji: '🧟', name: 'Sleepy Zombie' },
  { id: 'ninja', emoji: '🥷', name: 'Sneaky Ninja' },
  { id: 'wizard', emoji: '🧙', name: 'Pocket Wizard' },
  { id: 'parrot', emoji: '🦜', name: 'Pirate Parrot' },
  { id: 'moai', emoji: '🗿', name: 'Stone Face' },
  { id: 'cheese', emoji: '🧀', name: 'Big Cheese' },
  { id: 'snail', emoji: '🐌', name: 'Turbo Snail' },
  { id: 'crab', emoji: '🦀', name: 'Crabby Pants' },
  { id: 'dragon', emoji: '🐉', name: 'Tiny Dragon' },
  { id: 'monkey', emoji: '🙈', name: 'Cheeky Monkey' },
];

// Guests don't choose: they all get this one, which isn't on the list
export const GUEST_AVATAR = { id: 'guest', emoji: '👻', name: 'Mystery Guest' };

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

export const isAvatar = (id) => typeof id === 'string' && BY_ID.has(id);

// The emoji for an avatar id; unknown ids (an older page, a newer server)
// fall back to a plain face rather than nothing
export const avatarEmoji = (id) => BY_ID.get(id)?.emoji ?? (id === 'guest' ? '👻' : '🙂');
export const avatarName = (id) => BY_ID.get(id)?.name ?? '';

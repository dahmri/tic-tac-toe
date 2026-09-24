// Achievements: badges earned from what a player has done. Worked out by
// the server from the data it already keeps (server/achievements.js), so
// there's nothing to store and older games count too. Add new ones at
// the end; `goal` makes a progress count ("37 / 100").

export const ACHIEVEMENTS = [
  { id: 'first_win', emoji: '🏆', name: 'First win', about: 'Win a game.' },
  { id: 'online_win', emoji: '🌐', name: 'Online winner', about: 'Win a game online.' },
  { id: 'streak_3', emoji: '🔥', name: 'On fire', about: 'Win 3 online games in a row.', goal: 3 },
  {
    id: 'streak_10',
    emoji: '☄️',
    name: 'Unstoppable',
    about: 'Win 10 online games in a row.',
    goal: 10,
  },
  { id: 'games_100', emoji: '💯', name: 'Hundred club', about: 'Play 100 games.', goal: 100 },
  {
    id: 'unbeatable_draw',
    emoji: '🛡️',
    name: 'Held the line',
    about: 'Hold Unbeatable to a draw.',
  },
  {
    id: 'vanish_hard_win',
    emoji: '🌫️',
    name: 'Vanishing act',
    about: 'Beat the computer on Hard with 3-mark rules.',
  },
  { id: 'puzzle_first', emoji: '🧩', name: 'Puzzler', about: 'Solve a daily puzzle.' },
  {
    id: 'puzzle_7',
    emoji: '📅',
    name: 'Week of puzzles',
    about: 'Solve the daily puzzle 7 days in a row.',
    goal: 7,
  },
  { id: 'friends_5', emoji: '🤝', name: 'Social butterfly', about: 'Have 5 friends.', goal: 5 },
  { id: 'rating_1400', emoji: '📈', name: 'Rising star', about: 'Reach a rating of 1400.' },
  {
    id: 'podium',
    emoji: '🥇',
    name: 'On the podium',
    about: 'Finish a monthly season in the top 3.',
  },
];

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id);

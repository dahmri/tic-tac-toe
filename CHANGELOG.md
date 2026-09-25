# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **A wider layout on computers.** On wide screens the game choices and the
  online lobby sit beside the board, and the board sizes itself so the
  buttons under it stay in view.
- **Light or dark, your choice.** A switch next to the language menu: automatic
  (follows your device), light or dark. The choice is remembered.
- **A welcome for new visitors.** A short intro above the log-in form, with
  the guest button up front.

### Changed

- On phones, the account links (Leaderboard, Stats, Profile…) fold behind
  a Menu button, and long usernames no longer push the bar onto two lines.
- Lists show placeholders while they load (Stats, Leaderboard, arena
  standings), and empty lists read as a friendly note.
- The arena box in the lobby is a soft card instead of a second dashed box.

## [1.10.0] - 2026-09-25

### Added

- **Where you're logged in.** Your profile lists the devices you're logged
  in on ("Firefox on Windows", last active...), so you can log one out, or
  everywhere else at once. No IP addresses are kept.
- **A sign-up check without a CAPTCHA.** While you fill in the sign-up
  form, your browser quietly solves a small puzzle (about a second of
  work); bots signing up by the thousand pay that each time. Nothing is
  sent to another company and there are no pictures to click.
- **Backup restore drill.** `scripts/restore-drill.sh` restores the newest
  backup into a scratch database and checks it can really be used
  (migrations, tables, personal data opens with the server's key). See
  docs/DEPLOYMENT.md.
- **Admin page.** For whoever runs the site: open reports, renaming
  players with offensive names, suspending (1, 7 or 30 days, or until
  further notice) or deleting accounts, and a log of every admin action.
  A suspended player is logged out at once. Make someone an admin with
  `npm run make-admin -- <username>`.
- **Usage numbers.** In the admin page: players active each day, sign-ups,
  and games by kind over the last 30 days. Counts only: which players were
  active isn't kept (Redis HyperLogLog), and nothing goes to an analytics
  company.
- **A rating for each set of rules.** Classic, 3 marks and Ultimate each
  have their own rating, monthly seasons, leaderboard and podium. Quick
  match pairs you by your rating in the rules you chose, and your Stats
  show all three. Ratings so far become the classic ones.
- **How to play, step by step.** Choosing 3 marks or Ultimate shows a "How
  to play" button: a short guide on a practice board where you make the
  key moves yourself (a mark vanishing, being sent to another board, a
  free move).
- **Notifications.** Turn them on in your profile, per device, to hear
  about an invitation or your turn in an online game while the game isn't
  on screen, including the installed app. Nothing is sent while the game
  is in front of you. Needs the server's VAPID keys (see
  docs/DEPLOYMENT.md).
- **Weekend arena.** Every Saturday, 18:00 to 20:00 UTC, join the arena
  from the online lobby and you're paired again and again with players
  close to your score, one classic game at a time: 2 points for a win, 1
  for a draw. Pause whenever you like; the standings show the top players
  and last week's podium.

## [1.9.0] - 2026-09-25

### Added

- **Ultimate tic-tac-toe.** A third set of rules, next to Classic and 3
  marks: nine small boards in a big one. The square you play sends your
  opponent to the matching small board; win three small boards in a row
  to win. Play it against the computer (Casual, Medium or Hard), on the
  same screen, or online (invitations and quick match), with hints,
  replays and stats. The board you must play in is highlighted, and the
  number keys play in it.
- **Load test** (`npm run load-test`): many players playing online at
  once, with how fast moves are answered. One server handled 4,000
  players (2,000 matches) with 99% of moves answered within 10 ms on a
  laptop; see docs/DEPLOYMENT.md.
- **Watch live games.** Players in a game have a Watch button in the
  lobby (and in your friends list): you see their board move by move, with
  their reactions, until you stop or the game ends. The players see how
  many are watching. Players who blocked you can't be watched.
- **Privacy policy and terms of use**, linked at the bottom of every page
  and from the sign-up form (also at `/#privacy` and `/#terms`), in all
  three languages. They're drafts: the site owner's name, contact email,
  country and backup period are placeholders to fill in before launch.
- **Block and report.** The ⋯ next to a player (in the lobby, your
  friends, your last opponent, or the player you're facing) lets you
  block or report them. Blocked players can't invite you or be matched
  with you, and you don't see each other online; they aren't told.
  Reports say what's wrong (username, cheating, harassment, something
  else) and go to whoever runs the site. Unblock anyone from your profile.
- **Username filter.** New usernames (and renames) can't contain
  offensive words in English, French or Spanish, even written with
  look-alike digits, or pretend to be staff ("admin", "support"...).
- **Why did I lose?** After losing a classic game against the computer or
  online, one tap shows the move that cost you the game, and the move
  that would have saved it. In any replay, **Show my mistake** does the
  same (a perfect computer checks every move you made).

### Changed

- **New accounts need you to be 16** (was 13): the age of digital consent
  everywhere in the EU. Accounts created before keep working.
- **Fonts are served by the site itself** instead of Google Fonts, so
  visitors' IP addresses no longer go to Google. The site now loads
  nothing from other companies.

## [1.8.0] - 2026-09-24

### Fixed

- French and Spanish read better: a proofreading pass fixed grammar around
  country and month names, clearer terms (French "cote" for the rating),
  and one consistent Spanish.
- Grey text (on buttons, badges and help text) is a little darker in the
  light theme, so it's readable by everyone (it was just under the WCAG
  contrast minimum).

### Added

- **Monitoring.** A GitHub workflow checks the live site every 15 minutes
  and fails (so GitHub emails you) when it's down. Errors in players'
  browsers are reported to the server's log. `/api/health` now includes
  the running version, and server logs rotate so they can't fill the disk.
- **Achievements.** 12 badges to earn: First win 🏆, Online winner 🌐,
  On fire 🔥 (3 online wins in a row), Unstoppable ☄️ (10), Hundred club
  💯, Held the line 🛡️ (draw against Unbeatable), Vanishing act 🌫️ (beat
  Hard at 3 marks), Puzzler 🧩, Week of puzzles 📅, Social butterfly 🤝
  (5 friends), Rising star 📈 (rating 1400) and On the podium 🥇. They're
  in your Stats, with progress towards the ones with a goal, and a toast
  pops up when you earn one. Games you played before count too.
- **Monthly seasons.** The leaderboard now runs by month: on the 1st,
  everyone starts again at 1200, so anyone can reach the top. The
  leaderboard shows the season and how many days are left, and last
  month's podium 🥇🥈🥉. Your Stats show your rating this season and your
  best ever.
- **Daily puzzle.** 🧩 Puzzle, next to the other modes: every day a new
  position where you can win in 2 moves, the same for everyone. Find the
  move that makes two threats at once. Your first try each day counts
  toward your streak (kept on your account, or in your browser as a
  guest); after that you can practise as much as you like.
- **Reset your password by email.** "Forgot your password?" now sends a
  link to your confirmed email address (it works once, for an hour, and
  stops working if your password changes). Recovery codes still work:
  choose "Use a recovery code instead".
- **Friends.** Tap the ☆ next to any player (in the lobby, or your last
  opponent) or add them by username. Your friends show at the top of the
  Online lobby, online ones first, with an Invite button when they're
  free. Friends are one way, like bookmarks: adding someone asks nothing
  of them.

## [1.7.0] - 2026-09-24

### Added

- **20 more avatars**, 38 in all: Taco Tuesday 🌮, Donut Worry 🍩, Hug Me
  Cactus 🌵, Hot Diggity Dog 🌭, Piggy Bank 🐷, Baby Shark 🦈, Night Owl 🦉,
  Spiky Hugger 🦔, Fancy Flamingo 🦩, The GOAT 🐐, Sleepy Zombie 🧟, Sneaky
  Ninja 🥷, Pocket Wizard 🧙, Pirate Parrot 🦜, Stone Face 🗿, Big Cheese 🧀,
  Turbo Snail 🐌, Crabby Pants 🦀, Tiny Dragon 🐉 and Cheeky Monkey 🙈.
- **Français and Español.** The whole site is now also in French and
  Spanish: pick the language in the menu at the top right. Your choice is
  remembered, and on a first visit the site follows your browser's
  language. Everything is translated, including messages from the server,
  country names and dates, and the confirmation email.

## [1.6.0] - 2026-09-24

### Added

- **Email confirmation.** Creating an account now asks for your email
  address, and we send you a link to confirm it. Until you click it you
  can play the computer and on the same screen, but online games, your
  rating and the leaderboard wait; a banner offers to send the email
  again. Changing your email in your profile means confirming the new
  one. Players who signed up before today are asked to add an email.
  Other players never see your address, and it's stored encrypted with
  your other personal details.

### Changed

- The server needs `SITE_URL` (the site's public address, for links in
  emails) and SMTP settings for sending them. See `docs/DEPLOYMENT.md`.

## [1.5.0] - 2026-09-24

### Added

- **3 marks rules.** A new rule set for every mode (vs Computer, Same
  screen and Online): each player keeps only their last three marks, and
  a fourth makes the oldest one vanish. The mark about to go is drawn
  faded. The board never fills up, so games rarely end in a draw. Pick
  **Classic** or **3 marks** above the board; invitations and quick match
  use your choice, and quick match only pairs players who picked the same
  rules. Against the computer the top level is called **Hard** here: it
  looks seven moves ahead, but it isn't unbeatable.
- **Medium computer.** Between Casual and Unbeatable: it always takes a
  win and blocks yours, and plays well most of the time, but slips now
  and then.
- **Hints.** The **Hint** button (or <kbd>H</kbd>) highlights a good square
  to play, against the computer or on the same screen. Not available
  online.
- **Replays.** Every game in your Stats history has a **Replay** button:
  watch it play back move by move, or step through it with the controls.
- **Move clock online.** Each player has 30 seconds per move in an online
  match, shown as a countdown under the status (red for the last 10).
  Running out of time loses the round, so nobody can stall a game.
- **Reactions online.** Send a quick 👍 👏 😂 😮 😱 🔥 🤝 😅 during a match.
  It floats up over the board for both players. Only these emoji can be
  sent, and at most one every 1.5 seconds.
- **Forgot your password?** You get a recovery code when you sign up;
  with it, **Forgot your password?** on the log-in screen sets a new
  password. Using it logs out your other devices and gives you a fresh
  code. Make a new code any time in your profile (players who signed up
  before today can make their first one there).
- **Download your data** from your profile: your profile, stats and every
  game, as a JSON file.
- **Delete your account** from your profile, with your password. Your
  stats and games against the computer go with it; your online games stay
  in your opponents' histories as "Deleted player".
- **Public leaderboard.** Guests can open the leaderboard too.
- **Guest games carry over.** Games a guest plays against the computer
  are added to their stats when they create an account.
- **Install it, play offline.** The game can be installed as an app
  (Add to Home Screen, or the install button in the address bar) and
  keeps working without a connection after one visit: play the computer
  or a friend as a guest. Updates still arrive as soon as you're online.

## [1.4.0] - 2026-09-24

### Added

- **Play as a guest.** No account needed: click **Play as a guest** to play
  the computer or a friend on the same screen straight away. Guests get the
  👻 Mystery Guest avatar. Online games, stats, the leaderboard and the
  profile need a free account; picking **Online** as a guest explains this,
  with a button to sign up. Guest games aren't recorded anywhere.
- **Avatars.** Pick a funny avatar when you create an account: Tiny T-Rex,
  Speedy Sloth, Avocado Toast, Drama Llama, Couch Potato, Trash Panda, Beep
  Boop and 11 more. It shows next to your name, in the lobby, in
  invitations, in your match, on the leaderboard and in stats. Change it any
  time in your profile. Players who signed up earlier get the Tiny T-Rex.

## [1.3.0] - 2026-09-24

### Added

- **Sound.** A pencil scratch for every mark (yours and your opponent's),
  a short tune when you win, a lower one when you lose, two notes for a
  draw, a ding for an invitation and a chime when an online match starts.
  The sounds are made in the browser, so there is nothing to download. The
  🔊 button next to your name turns sound off and on; the choice is saved
  in your browser.
- **Win celebration.** When you win, your winning marks give a little hop
  and pencil stars and spirals pop out around the board. Nothing pops when
  the computer or your opponent wins, and it is skipped when your device
  asks for reduced motion.

## [1.2.0] - 2026-09-24

### Added

- **Player accounts.** Sign up with first name, last name, username, date of
  birth, country, optional phone number and password; log in and out; edit
  your profile and change your password at any time. You must be logged in
  to play. Other players only see your username and country.
- Game server (Node.js + Fastify) with PostgreSQL for accounts and Redis
  for sessions and rate limits. Built to run as many identical instances
  behind nginx.
- Security: passwords hashed with Argon2id; names, birth dates and phone
  numbers encrypted in the database with AES-256-GCM; HttpOnly session
  cookies; login and sign-up rate limits; cross-site request checks.
- Docker Compose stack (nginx, game server, PostgreSQL, Redis) used by CI,
  deployments and local runs. Integration tests against real databases.
- docs/ARCHITECTURE.md: how the game is built and how it scales.
- **Online lobby:** see which players are online, filter them by country,
  and invite one to play. Invitations reach players in any mode and last
  60 seconds; they can be accepted, declined or cancelled.
- **Stats:** online record and win rate, current and best win streak, win
  rate as X and as O, fastest win, wins by forfeit, most played opponents
  with your record against each, results against the computer, and your
  game history. Online results are recorded by the server; games against
  the computer are replayed and checked before they count.
- **Online matches run on the game server,** which checks every move, so
  nobody can move out of turn or fake a result. Reloading the page rejoins
  the match; leaving (or staying away for 20 seconds) forfeits a round in
  progress.
- **Ratings and leaderboard:** every player has a skill rating (Elo),
  starting at 1200. Each online round moves both players' ratings; beating a
  stronger player earns more. The result shows the points won or lost, and
  ratings appear next to names in the lobby and in matches. A new
  Leaderboard ranks players worldwide or by country, and Stats shows your
  rating, rank and best rating.
- **Quick match:** "Find me an opponent" pairs you with a waiting player
  near your rating; the rating gap allowed grows the longer you wait, so
  nobody waits forever. The search survives a page reload.
- **Invite again:** after a match ends, the lobby offers to invite the same
  player again.

### Fixed

- A player who reloaded the page, or opened a second tab, at the moment
  another closed could vanish from the online list while still connected.

### Changed

- Online play no longer uses game codes and a direct browser-to-browser
  connection (PeerJS); the page loads no third-party scripts any more, and
  its Content-Security-Policy only allows this site.

- CD: merging into `main` now deploys to production automatically, with no
  manual approval step.
- Docker build image updated from Node 24 to Node 25.

## [1.1.0] - 2026-09-23

### Added

- **Online mode:** play a friend on another computer. Start a game to get a
  6-character code or invite link; your friend joins with either. Moves travel
  over a direct browser-to-browser connection (WebRTC via PeerJS), with the
  host's browser validating every move.
- Detects when the other player disconnects, and the host can keep the same
  code so a friend can rejoin.
- `/version.json` on every build shows which version and commit is live.
- Content-Security-Policy and security headers for production.

### Changed

- "2 Players" mode is now called "Same screen", to set it apart from Online.

### Fixed

- The game failed to load after online mode was added (a startup error).
- Switching modes while the computer was thinking could place its move on
  the next board.

### Project

- Branching model `feature/* → dev → test → main` with protected branches.
- ESLint, Prettier and Playwright browser tests (including real online games).
- CI on every pull request; tests run against the production Docker image.
- CD: `test` deploys to staging, `main` deploys to production after approval
  and creates a tagged GitHub release.
- Contributing guide, deployment guide, PR and issue templates, Dependabot.

## [1.0.0] - 2026-09-23

### Added

- Hand-drawn graph-paper board with animated pencil marks and win line.
- Play against the computer (Casual or Unbeatable) or a second player.
- Scoreboard shown as tally marks, saved in the browser.
- Keyboard controls: `1`–`9` (keypad layout) to play, `N` for a new round.
- Light and dark themes; phone-friendly layout.
- Unit tests for game rules and the computer opponent, run in CI.

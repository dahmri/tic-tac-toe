# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

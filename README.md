# Pencil Tic-Tac-Toe

[![CI](https://github.com/dahmri/tic-tac-toe/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/dahmri/tic-tac-toe/actions/workflows/ci.yml)
[![Deploy](https://github.com/dahmri/tic-tac-toe/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/dahmri/tic-tac-toe/actions/workflows/deploy.yml)

A hand-drawn tic-tac-toe game for the browser. Play the computer, pass the
device to a friend, or invite any player who is online. Players have
accounts; a Node.js game server with PostgreSQL and Redis runs it all.

## Features

- **Play as a guest:** no account needed to play the computer or a friend on the same
  screen. Guests get the 👻 avatar; online games, stats and the leaderboard need an account.
- **Player accounts:** sign up with your name, username, a funny avatar (🦖 🦥 🥑 🦙 and
  more), date of birth, country and an optional phone number; edit your profile, avatar or
  password at any time. Other players only see your username, avatar and country, and
  personal details are stored encrypted.
- **Three modes:** vs Computer, Same screen (two players, one device), and Online.
- **Online lobby:** see who is online, filter players by country, and invite one to play.
  They can accept or decline; invitations reach them whatever mode they're in.
- **Quick match:** one click pairs you with a waiting player near your rating. After a
  match, invite the same player again in one click.
- **Ratings and leaderboard:** a skill rating (Elo, starting at 1200) that every online
  round moves; the leaderboard ranks players worldwide or by country.
- **Stats:** your online record (played, won, lost, drawn, win rate), win streaks, win
  rate as X and as O, fastest win, the opponents you've played most and your record
  against each, your results against the computer, and your full game history.
- **Two difficulty levels:** _Casual_ can be beaten; _Unbeatable_ uses minimax and never loses.
- **Tally-mark scoreboard**, saved in your browser between visits.
- **Keyboard play:** `1`–`9` place a mark (keypad layout, `7` is top-left), `N` starts a new round.
- **Sound:** a pencil scratch for every mark, short tunes for a win, loss or draw, and a
  ding for invitations. Made in the browser, no audio files; the 🔊 button mutes it and
  your choice is remembered.
- **Win celebration:** your winning marks hop and pencil stars pop around the board
  (skipped when your device asks for reduced motion).
- **3 marks rules:** each player keeps only their last three marks, so games rarely draw.
- **Medium computer and hints**, **replays** of any game in your history.
- **Online move clock** (30 s a move) and **emoji reactions**.
- **Confirmed emails:** sign-up asks for an email address and sends a confirmation link;
  online play opens once it's confirmed.
- **Recovery codes** for forgotten passwords, **download your data**, **delete your account**.
- **Installable**, and playable offline as a guest.
- Light and dark themes, works on phones.

## Playing online

1. Pick **Online**. Click **Find me an opponent** to be paired with a waiting player
   near your rating, or pick someone yourself: you see the players who are online now, most recently active
   first, with their country. Use the country list to show only one country.
2. Click **Invite** next to a player. They get the invitation wherever they are in
   the game and have 60 seconds to **Accept** or **Decline**. You can cancel it.
3. Once they accept, the match starts. You (the inviter) play X and open the first
   round; after that, players take turns opening. Either player can start a new
   round, and **Leave** ends the match.

**How it works:** the game server runs every match. Players only send the square they
want; the server checks it's their turn and the square is free, then sends the new
board to both. Nobody can move out of turn or fake a result. Reloading the page puts
you back into your match. Closing it for more than 20 seconds, or clicking **Leave**,
ends the match, and a round in progress counts as a win for the other player.

## Getting started

Requires [Node.js](https://nodejs.org/) 24.7 or newer (`.nvmrc` pins the version CI uses),
[PostgreSQL](https://www.postgresql.org/) and [Redis](https://redis.io/). On macOS:

```sh
brew install postgresql@18 redis
brew services start postgresql@18 && brew services start redis
createdb tictactoe                                  # the game's database
createdb tictactoe_test && createdb tictactoe_e2e  # for the tests
```

Then:

```sh
npm install                      # server libraries and dev tools
npx playwright install chromium  # once, for browser tests
npm run dev                      # http://localhost:8000, restarts on changes
```

`npm run dev` creates the tables on first start. Settings come from environment
variables (`DATABASE_URL`, `REDIS_URL`, `PORT`, ...): see
[`server/config.js`](server/config.js). The defaults suit the setup above.

Or run the whole production stack with Docker instead: see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#running-it-by-hand).

To let a second computer on the **same Wi-Fi** load the game from your machine:

```sh
HOST=0.0.0.0 npm run dev
ipconfig getifaddr en0   # macOS: prints your local IP, e.g. 192.168.1.20
```

The other computer then opens `http://<that-ip>:8000`.

## Scripts

| Command                    | What it does                                                   |
| -------------------------- | -------------------------------------------------------------- |
| `npm run dev`              | Game server + site at http://localhost:8000, with auto-restart |
| `npm start`                | Game server only (production: nginx serves the site)           |
| `npm run migrate`          | Apply database changes                                         |
| `npm run build`            | Build the deployable site into `dist/`                         |
| `npm run preview`          | Build, then serve `dist/` with the game server                 |
| `npm test`                 | Unit tests (no database needed)                                |
| `npm run test:integration` | API tests against the `tictactoe_test` database and Redis      |
| `npm run test:e2e`         | Browser tests (Playwright), including real online games        |
| `npm run lint`             | ESLint                                                         |
| `npm run format`           | Format everything with Prettier                                |
| `npm run check`            | Lint + formatting + unit tests, the quick pre-push check       |

Unit tests cover win and draw detection, prove the Unbeatable computer never
loses against every possible sequence of moves, and check the account rules,
password hashing, encryption and the rules of online matches. Integration tests
drive the API and the live connection against real databases: sign-up, login,
sessions, profile edits, rate limits, encrypted personal data, who's online,
invitations, full matches including two moves racing for the same turn, and
the statistics those games produce.
Browser tests play real games, including online matches between two browsers.

## Project structure

```
index.html            Page markup and Content-Security-Policy
css/styles.css        Styles and light/dark theme tokens
js/rules.js           Board rules: win/draw detection, helpers
js/ai.js              Computer opponent (casual + minimax)
js/account.js         Log in, sign up, profile dialog
js/lobby.js           Online players, country filter, invitations
js/live.js            Live connection to the game server (WebSocket)
js/stats.js           Stats dialog, recording games against the computer
js/sound.js           Sound effects (Web Audio API) and the mute setting
js/validation.js      Account rules, shared by browser and server
js/avatars.js         The avatars players pick from, and the guest's
js/countries.js       Country codes, names and flags
js/api.js             Calls to the game server
js/main.js            UI: rendering, input, scoring, online matches
server/               Game server: API, live connection, presence, matches
server/migrations/    Database schema changes, in order
tests/unit/           Unit tests (node --test)
tests/integration/    API tests against PostgreSQL and Redis
tests/e2e/            Browser tests (Playwright)
scripts/              Build, deploy
deploy/nginx.conf     Production web server config
Dockerfile            Production images: web (nginx) and api (Node)
compose.yaml          The full stack: web, api, PostgreSQL, Redis
.github/workflows/    CI and deployment pipelines
docs/                 Architecture and deployment guides
```

## Workflow

Work happens on feature branches merged into `dev`, promoted to `test`
(staging) and then `main` (production). All changes go through pull
requests with passing CI. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
branching model, commit conventions and release process, and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for setting up servers.

Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)

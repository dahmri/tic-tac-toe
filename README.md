# Pencil Tic-Tac-Toe

[![CI](https://github.com/dahmri/tic-tac-toe/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/dahmri/tic-tac-toe/actions/workflows/ci.yml)
[![Deploy](https://github.com/dahmri/tic-tac-toe/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/dahmri/tic-tac-toe/actions/workflows/deploy.yml)

A hand-drawn tic-tac-toe game for the browser. Play the computer, pass the
device to a friend, or play a friend on another computer. No build step.

## Features

- **Three modes:** vs Computer, Same screen (two players, one device), and Online (two computers).
- **Two difficulty levels:** _Casual_ can be beaten; _Unbeatable_ uses minimax and never loses.
- **Tally-mark scoreboard**, saved in your browser between visits.
- **Keyboard play:** `1`–`9` place a mark (keypad layout, `7` is top-left), `N` starts a new round.
- Light and dark themes, works on phones.

## Playing online

1. One player picks **Online → Start a game** and gets a 6-character code (like `K7PQ2M`).
2. They send the code, or the invite link, to a friend.
3. The friend picks **Online**, types the code and clicks **Join**, or just opens the invite link.

The host plays X and opens the first round; after that, players alternate who starts.

**How it works:** the two browsers connect directly to each other (WebRTC) through
[PeerJS](https://peerjs.com/). PeerJS's free public server is used only to introduce the
two browsers; the moves themselves travel directly between the two players. The host's
browser is the referee: it checks every move and sends the full game state back to the
other player, so the two screens can't get out of sync. Both computers need an internet
connection. A few very strict networks (some offices and schools) block direct
connections; if joining times out, try another network.

**Where your friend opens the game:** each player needs the game page open on their own
computer. That can be a copy served on your local network (see below) or a deployed
copy (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). The two players don't need to use the same copy.

## Getting started

Requires [Node.js](https://nodejs.org/) 22 or newer (`.nvmrc` pins the version CI uses).

```sh
npm install                      # dev tools: ESLint, Prettier, Playwright
npx playwright install chromium  # once, for browser tests
npm start                        # http://localhost:8000
```

To let a second computer on the **same Wi-Fi** load the game from your machine:

```sh
HOST=0.0.0.0 npm start
ipconfig getifaddr en0   # macOS: prints your local IP, e.g. 192.168.1.20
```

The other computer then opens `http://<that-ip>:8000`.

## Scripts

| Command            | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `npm start`        | Serve the source folder at http://localhost:8000         |
| `npm run build`    | Build the deployable site into `dist/`                   |
| `npm run preview`  | Build, then serve `dist/`                                |
| `npm test`         | Unit tests                                               |
| `npm run test:e2e` | Browser tests (Playwright), including real online games  |
| `npm run lint`     | ESLint                                                   |
| `npm run format`   | Format everything with Prettier                          |
| `npm run check`    | Lint + formatting + unit tests, the quick pre-push check |

Unit tests cover win and draw detection, prove the Unbeatable computer never
loses against every possible sequence of moves, and check room codes and the
validation of online messages. Browser tests play real games, including an
online game between two separate browsers.

## Project structure

```
index.html            Page markup and Content-Security-Policy
css/styles.css        Styles and light/dark theme tokens
js/rules.js           Board rules: win/draw detection, helpers
js/ai.js              Computer opponent (casual + minimax)
js/room.js            Online room codes and invite links
js/protocol.js        Online messages and their validation
js/net.js             Online connection (PeerJS / WebRTC)
js/main.js            UI: rendering, input, scoring, online sessions
tests/unit/           Unit tests (node --test)
tests/e2e/            Browser tests (Playwright)
scripts/              Dev server, build, deploy
deploy/nginx.conf     Production web server config
Dockerfile            Production image (nginx)
.github/workflows/    CI and deployment pipelines
docs/DEPLOYMENT.md    How to deploy to staging and production
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

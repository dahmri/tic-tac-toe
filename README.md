# Pencil Tic-Tac-Toe

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
computer. That can be a copy served on your local network (see below) or any public
hosting of this repo, such as GitHub Pages. The two players don't need to use the same copy.

## Getting started

The game uses ES modules, so serve it over HTTP instead of opening the file directly:

```sh
# any static server works
python3 -m http.server 8000
# or, with Node installed
npm start
```

Then open <http://localhost:8000>.

To let a second computer on the **same Wi-Fi** load the game from your machine, bind the
server to all interfaces and share your local IP address:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
ipconfig getifaddr en0   # macOS: prints your local IP, e.g. 192.168.1.20
```

The other computer then opens `http://<that-ip>:8000`.

## Running tests

Tests use Node's built-in test runner (Node 18+):

```sh
npm test
```

They cover win and draw detection, check that the Unbeatable computer never
loses against every possible sequence of moves, and check room codes and the
validation of online messages.

## Project structure

```
index.html          Page markup
css/styles.css      Styles and light/dark theme tokens
js/rules.js         Board rules: win/draw detection, helpers
js/ai.js            Computer opponent (casual + minimax)
js/room.js          Online room codes and invite links
js/protocol.js      Online messages and their validation
js/net.js           Online connection (PeerJS / WebRTC)
js/main.js          UI: rendering, input, scoring, online sessions
tests/              Unit tests (node --test)
.github/workflows/  CI: runs tests on every push and pull request
```

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`).
Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)

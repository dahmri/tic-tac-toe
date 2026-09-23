# Pencil Tic-Tac-Toe

A hand-drawn tic-tac-toe game for the browser. Play the computer or pass the
device to a friend. No build step and no dependencies.

## Features

- **Two modes:** vs Computer or 2 Players on one device.
- **Two difficulty levels:** *Casual* can be beaten; *Unbeatable* uses minimax and never loses.
- **Tally-mark scoreboard**, saved in your browser between visits.
- **Keyboard play:** `1`–`9` place a mark (keypad layout, `7` is top-left), `N` starts a new round.
- Light and dark themes, works on phones.

## Getting started

The game uses ES modules, so serve it over HTTP instead of opening the file directly:

```sh
# any static server works
python3 -m http.server 8000
# or, with Node installed
npm start
```

Then open <http://localhost:8000>.

## Running tests

Tests use Node's built-in test runner (Node 18+):

```sh
npm test
```

They cover win and draw detection and check that the Unbeatable computer
never loses against every possible sequence of moves.

## Project structure

```
index.html          Page markup
css/styles.css      Styles and light/dark theme tokens
js/rules.js         Board rules: win/draw detection, helpers
js/ai.js            Computer opponent (casual + minimax)
js/main.js          UI: rendering, input, scoring
tests/              Unit tests (node --test)
.github/workflows/  CI: runs tests on every push and pull request
```

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`).
Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)

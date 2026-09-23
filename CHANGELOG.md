# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

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

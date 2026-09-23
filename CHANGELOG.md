# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Online mode:** play a friend on another computer. Start a game to get a
  6-character code or invite link; your friend joins with either. Moves travel
  over a direct browser-to-browser connection (WebRTC via PeerJS), with the
  host's browser validating every move.
- Detects when the other player disconnects, and the host can keep the same
  code so a friend can rejoin.

### Changed

- "2 Players" mode is now called "Same screen", to set it apart from Online.

### Fixed

- Switching modes while the computer was thinking could place its move on
  the next board.

## [1.0.0] - 2026-09-23

### Added

- Hand-drawn graph-paper board with animated pencil marks and win line.
- Play against the computer (Casual or Unbeatable) or a second player.
- Scoreboard shown as tally marks, saved in the browser.
- Keyboard controls: `1`–`9` (keypad layout) to play, `N` for a new round.
- Light and dark themes; phone-friendly layout.
- Unit tests for game rules and the computer opponent, run in CI.

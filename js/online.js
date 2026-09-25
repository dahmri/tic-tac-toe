// Online play: the live connection to the game server, the match exactly as
// the server last sent it (the server is the referee), ratings, the move
// clock, reactions, and watching other players' games. main.js draws the
// page; this module tells it when.

import { other, replay } from './rules.js';
import { replayUltimate } from './ultimate.js';
import { connectLive } from './live.js';
import { avatarEmoji } from './avatars.js';
import { countryFlag } from './countries.js';
import { canPlayOnline, currentUser } from './account.js';
import { handleLobbyMessage, lobbyError, resetLobby, setLastOpponent, setLobby } from './lobby.js';
import { signed } from './stats.js';
import { sound } from './sound.js';
import { REACTIONS } from './reactions.js';
import { checkAchievements } from './achievements-ui.js';
import { menuButton } from './player-menu.js';
import { t } from './i18n.js';
import { celebrate, drawWin, isWon, syncMarks } from './board.js';
import { game, saveSettings, settings, zeroScores } from './game.js';

// Any element by id, typed loosely: the pages hold forms, dialogs and inputs
const $ = (id) => /** @type {any} */ (document.getElementById(id));

let live = null;
let liveStatus = 'offline'; // 'connecting' | 'online' | 'offline'
let me = null;
let match = null;
// Latest known ratings, by player id, and the points each player won or
// lost in the round that just ended ({ match, round, change: { id: n } })
const ratings = new Map();
let lastRound = null;
// When the player to move runs out of time (local clock), or null
let turnEndsAt = null;
// A match this player is watching (read-only), and how many watch theirs
let watched = null;
let spectators = 0;

// What main.js does when the match changes: redraw, or clear the board
let hooks = { render() {}, resetBoard() {} };

export const online = () => settings.mode === 'online';
// Guests, and players who haven't confirmed their email, can pick Online
// but only see what they need to do first
export const onlineLocked = () => online() && !canPlayOnline();
export const inMatch = () => !!match && !match.ended;
export const watching = () => !inMatch() && !!watched && !watched.ended;
// The match on the board: this player's own, or the one they're watching
const onBoard = () => (inMatch() ? match : watching() ? watched : null);
export const isConnected = () => liveStatus === 'online';
export const mySymbol = () => (match && match.players.O.id === me?.id ? 'O' : 'X');
export const opponent = () => (match ? match.players[other(mySymbol())] : null);
export const matchMoves = () => onBoard()?.moves.length ?? 0;
export const onBoardMoves = () => onBoard()?.moves ?? [];
const ratingOf = (p) => ratings.get(p.id) ?? p.rating;
// The rules on the board: an online match's own, otherwise the player's choice
// (the daily puzzle is always classic)
export const variant = () =>
  online() && onBoard()
    ? (onBoard().variant ?? 'classic')
    : settings.mode === 'puzzle'
      ? 'classic'
      : settings.variant;

// The round just lost on the board (for "Why did I lose?"), or null.
// Losses by leaving or by the clock have no mistake to show.
export function lostRound() {
  if (!inMatch() || !game.over || (match.variant ?? 'classic') !== 'classic') return null;
  if (match.forfeit || match.result === 'D' || match.result === mySymbol()) return null;
  return { squares: match.moves, starter: match.starter, symbol: mySymbol(), variant: 'classic' };
}

// The player whose turn it is may move, if the connection is up
export const canMove = () => inMatch() && isConnected() && game.turn === mySymbol();

/* ---------- Sending ---------- */

export function sendMove(square) {
  // The server checks the move and sends everyone the new board
  game.busy = live.send({ t: 'move', match: match.id, square });
}

export function askNextRound() {
  if (inMatch() && game.over) live.send({ t: 'next-round', match: match.id });
}

export function leaveMatch() {
  if (inMatch()) live.send({ t: 'leave', match: match.id });
}

// Leaves at once, e.g. when switching mode (the server is told)
export function abandonMatch() {
  leaveMatch();
  match = null;
}

export const sendToLobby = (msg) => live?.send(msg);

// Watching: the server sends the match now and after every move
export function watchPlayer(userId) {
  live?.send({ t: 'watch', user: userId });
}

export function stopWatching() {
  if (!watched) return;
  watched = null;
  live?.send({ t: 'unwatch' });
  setNetMessage('');
  hooks.resetBoard();
  hooks.render();
}

/* ---------- What the page shows ---------- */

// The status line during an online match, or null to let main.js decide
export function onlineStatus(w, tag) {
  if (onlineLocked()) return '';
  if (watching()) return watchedStatus();
  if (!inMatch())
    return isConnected() ? t('Find an opponent, or invite a player.') : t('Connecting…');
  const rival = opponent().username;
  if (game.over) {
    const change = roundChange();
    const points = change === null ? '' : ` ${deltaHTML(change)}`;
    if (match.timeout) {
      return match.result === mySymbol()
        ? t('<mark>You win!</mark> {name} ran out of time.', { name: rival }) + points
        : t('<mark>Out of time.</mark> {name} wins the round.', { name: rival }) + points;
    }
    if (match.forfeit) {
      return match.result === mySymbol()
        ? t('<mark>You win!</mark> {name} left.', { name: rival }) + points
        : t('<mark>{name} wins.</mark>', { name: rival }) + points;
    }
    if (w && w.p === 'D') return t("<mark>Cat's game.</mark> Nobody wins.") + points;
    if (w) {
      return w.p === mySymbol()
        ? t('<mark>You win!</mark> Nice line.') + points
        : t('<mark>{name} wins.</mark> Go again?', { name: rival }) + points;
    }
  }
  if (!isConnected()) return t('Reconnecting…');
  return game.turn === mySymbol()
    ? t('Your move, {mark}', { mark: tag(game.turn) })
    : t('{name} is thinking…', { name: rival });
}

// What a spectator reads: whose move it is, or how the round ended
function watchedStatus() {
  const name = (p) => watched.players[p].username;
  if (watched.over) {
    if (watched.result === 'D') return t("<mark>Cat's game.</mark> Nobody wins.");
    return t('<mark>{name} wins.</mark>', { name: name(watched.result) });
  }
  return t('{name} is thinking…', { name: name(watched.turn) });
}

export function playerLabel(p) {
  if (watching()) return `${watched.players[p].username} · ${p}`;
  if (!inMatch()) return t('Player {mark}', { mark: p });
  return p === mySymbol() ? t('You · {mark}', { mark: p }) : `${match.players[p].username} · ${p}`;
}

// My rating points for the round on the board, once the server has sent them
function roundChange() {
  if (!lastRound || lastRound.match !== match?.id || lastRound.round !== match.round) return null;
  return lastRound.change[me.id] ?? null;
}

function deltaHTML(n) {
  const cls = n > 0 ? 'delta up' : n < 0 ? 'delta down' : 'delta';
  return `<span class="${cls}" title="${t('Rating points')}">${signed(n)}</span>`;
}

// The match panel, the player's rating chip, the locked panel and the clock
export function renderOnline() {
  renderLocked();
  $('onlinePanel').hidden = !online() || onlineLocked();
  $('lobby').hidden = inMatch() || watching();
  $('roomInfo').hidden = !inMatch();
  $('watchInfo').hidden = !watching();
  if (watching()) {
    const { X, O } = watched.players;
    $('watchNames').textContent = t('{x} vs {o}', {
      x: `${avatarEmoji(X.avatar)} ${X.username}`,
      o: `${avatarEmoji(O.avatar)} ${O.username}`,
    });
  }
  $('spectators').hidden = !inMatch() || spectators === 0;
  $('spectators').textContent = t('👀 {n} watching', { n: spectators });
  if (inMatch()) {
    const rival = opponent();
    $('opponentName').textContent =
      `${avatarEmoji(rival.avatar)} ${countryFlag(rival.country)} ${rival.username}`;
    const chip = document.createElement('span');
    chip.className = 'rating-chip';
    chip.title = t('Rating');
    chip.textContent = String(ratingOf(rival));
    $('opponentName').append(' ', chip);
    // Rebuilt only for a new opponent, so it doesn't lose focus
    if ($('opponentMore').dataset.id !== String(rival.id)) {
      $('opponentMore').dataset.id = String(rival.id);
      $('opponentMore').replaceChildren(menuButton(rival));
    }
    const role = mySymbol() === 'X' ? t('You are X and open the first round.') : t('You are O.');
    const rules = { vanish: t('3-mark rules.'), ultimate: t('Ultimate rules.') }[variant()];
    $('roomRole').textContent = rules ? `${role} ${rules}` : role;
  }
  // The lobby refreshes its list only while it's on screen
  setLobby({
    visible: online() && !onlineLocked() && !watching() && !$('gameView').hidden,
    inMatch: inMatch(),
  });
  const chip = $('meRating');
  const rating = me ? ratingOf(me) : null;
  chip.hidden = !rating;
  chip.textContent = rating ? String(rating) : '';
  renderClock();
}

// What stands between the player and online games
function renderLocked() {
  $('guestLocked').hidden = !onlineLocked();
  if (!onlineLocked()) return;
  const user = currentUser();
  const [title, text, button] = !user
    ? [
        t('🔒 Online games need a free account'),
        t(
          'With an account you can play people around the world, get a rating, climb the leaderboard, keep your stats, and pick a funny avatar.',
        ),
        t('Create a free account'),
      ]
    : !user.email
      ? [
          t('✉️ Add your email to play online'),
          t('We ask every player for a confirmed email address before they play online.'),
          t('Add my email'),
        ]
      : [
          t('✉️ Confirm your email to play online'),
          t(
            "Click the link we sent to {email}. Can't find it? Check the spam folder, or send it again.",
            { email: user.email },
          ),
          t('Send it again'),
        ];
  $('lockedTitle').textContent = title;
  $('lockedText').textContent = text;
  $('guestJoin').textContent = button;
}

export function setNetMessage(text) {
  $('netMsg').textContent = text || '';
}

/* ---------- The match, as the server sends it ---------- */

// Draws a match on the board, from `before` (what was shown) to `next`.
// Returns how many new marks there are (1 for a move played live).
function drawMatch(before, next) {
  const newRound = !before || before.id !== next.id || before.round !== next.round;
  const fresh = newRound ? next.moves.length : next.moves.length - before.moves.length;
  if (newRound) hooks.resetBoard();
  turnEndsAt =
    next.turnLeft === null || next.turnLeft === undefined ? null : Date.now() + next.turnLeft;
  if (next.variant === 'ultimate') {
    game.upos = replayUltimate(next.moves, next.starter);
    game.board = game.upos.cells;
    game.marks = { X: [], O: [] };
  } else {
    game.upos = null;
    game.board = next.board.slice();
    game.marks = replay(next.moves, next.starter, next.variant ?? 'classic').marks;
  }
  game.turn = next.turn;
  game.over = next.over;
  game.busy = false;
  settings.scores = { ...next.score };
  if (next.variant !== 'ultimate') {
    syncMarks(game.board);
    if (next.line && !isWon()) drawWin(next.line);
  }
  if (fresh === 1) sound.mark(next.board[next.moves.at(-1)]);
  return fresh;
}

// A watched match, as the server sends it: read-only, and quiet
function showWatched(next) {
  if (next.ended) {
    watched = null;
    setNetMessage(t('That game has ended.'));
    hooks.resetBoard();
    return;
  }
  const before = watched;
  watched = next;
  drawMatch(before, next);
}

function showMatch(next) {
  if (watched) stopWatching(); // a game of their own comes first
  const newMatch = !match || match.id !== next.id;
  const wasOver = !newMatch && match.round === next.round && game.over;
  if (newMatch && next.round === 1 && next.moves.length === 0) sound.matchFound();
  if (newMatch) spectators = 0;
  const before = match;
  match = next;
  if (!online()) {
    settings.mode = 'online';
    saveSettings();
  }
  const fresh = drawMatch(before, next);
  if (next.over && !wasOver && fresh <= 1) {
    if (next.result === 'D') sound.draw();
    else if (next.result === mySymbol()) {
      sound.win();
      celebrate();
    } else sound.lose();
  }
}

function onMatch(next) {
  if (next.ended) {
    const mine = next.players.O.id === me.id ? 'O' : 'X';
    const rival = next.players[other(mine)].username;
    if (match?.id === next.id || !match) {
      setNetMessage(
        next.leftBy === mine
          ? ''
          : next.forfeit
            ? t('{name} left the game. You win the round.', { name: rival })
            : t('{name} left the game.', { name: rival }),
      );
      match = null;
      settings.scores = zeroScores();
      hooks.resetBoard();
      setLastOpponent(next.players[other(mine)]);
    }
  } else {
    if (!match || match.id !== next.id) setNetMessage('');
    showMatch(next);
  }
  hooks.render();
}

function onLiveMessage(msg) {
  switch (msg.t) {
    case 'hello':
      // After a reconnect the server has forgotten what this page watched
      if (watched) live.send({ t: 'watch', user: watched.players.X.id });
      me = msg.me;
      ratings.set(me.id, me.rating);
      if (msg.match && !msg.match.ended) showMatch(msg.match);
      else if (match) {
        match = null; // it ended while we were away
        hooks.resetBoard();
      }
      handleLobbyMessage(msg); // pending invitations
      break;
    case 'match':
      onMatch(msg.match);
      return;
    case 'reaction':
      if (msg.match === match?.id || msg.match === watched?.id) showReaction(msg);
      return;
    case 'watching':
      watched = null;
      setNetMessage('');
      showWatched(msg.match);
      break;
    case 'watched':
      if (msg.match.id !== watched?.id) return;
      showWatched(msg.match);
      break;
    case 'watchers':
      if (msg.match === match?.id) spectators = msg.count;
      break;
    case 'ratings': {
      const change = {};
      for (const [id, r] of Object.entries(msg.ratings)) {
        ratings.set(Number(id), r.rating);
        change[id] = r.change;
      }
      lastRound = { match: msg.match, round: msg.round, change };
      checkAchievements(); // a finished round may have earned one
      break;
    }
    case 'error':
      game.busy = false;
      setNetMessage(msg.message);
      if (msg.re?.startsWith('invite') || msg.re?.startsWith('queue')) lobbyError();
      break;
    default:
      handleLobbyMessage(msg);
      return;
  }
  hooks.render();
}

export function goOnline() {
  live?.close();
  live = connectLive({
    onMessage: onLiveMessage,
    onStatus: (status) => {
      liveStatus = status;
      hooks.render();
    },
  });
}

export function goOffline() {
  live?.close();
  live = null;
  liveStatus = 'offline';
  me = null;
  match = null;
  watched = null;
  spectators = 0;
  ratings.clear();
  lastRound = null;
  resetLobby();
}

/* ---------- Move clock and reactions ---------- */

// Seconds left for the move, shown under the status; the server decides
// when time is up, this is only the countdown
function renderClock() {
  const el = $('turnClock');
  const running = !!onBoard() && !game.over && turnEndsAt !== null && isConnected();
  el.hidden = !running;
  if (!running) return;
  const secs = Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000));
  el.textContent = watching()
    ? t("⏱ {name}'s time: {secs}s", { name: watched.players[game.turn].username, secs })
    : game.turn === mySymbol()
      ? t('⏱ Your time: {secs}s', { secs })
      : t("⏱ {name}'s time: {secs}s", { name: opponent().username, secs });
  el.classList.toggle('low', secs <= 10);
}

function showReaction({ from, emoji }) {
  // Spectators see X's reactions on the left and O's on the right
  const mine = watching() ? from === watched.players.X.id : from === me?.id;
  const bubble = document.createElement('span');
  bubble.className = `bubble ${mine ? 'mine' : 'theirs'}`;
  bubble.textContent = emoji;
  $('reactionFeed').append(bubble);
  setTimeout(() => bubble.remove(), 2400);
  const who = watching()
    ? (watched.players.X.id === from ? watched.players.X : watched.players.O).username
    : mine
      ? t('You')
      : opponent()?.username;
  $('reactionSaid').textContent = `${who}: ${emoji}`;
}

export function renderReactions() {
  $('reactions').replaceChildren(
    ...REACTIONS.map((emoji) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ghostbtn react';
      b.textContent = emoji;
      b.setAttribute('aria-label', t('React {emoji}', { emoji }));
      b.addEventListener('click', () => {
        if (inMatch()) live.send({ t: 'react', match: match.id, emoji });
      });
      return b;
    }),
  );
}

export function initOnline(callbacks) {
  hooks = { ...hooks, ...callbacks };
  renderReactions();
  setInterval(() => {
    if (!$('turnClock').hidden) renderClock();
  }, 250);
  $('leave').addEventListener('click', leaveMatch);
  $('stopWatching').addEventListener('click', stopWatching);
}

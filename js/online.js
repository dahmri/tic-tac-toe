// Online play: the live connection to the game server, the match exactly as
// the server last sent it (the server is the referee), ratings, the move
// clock and reactions. main.js draws the page; this module tells it when.

import { other, replay } from './rules.js';
import { connectLive } from './live.js';
import { avatarEmoji } from './avatars.js';
import { countryFlag } from './countries.js';
import { canPlayOnline, currentUser } from './account.js';
import { handleLobbyMessage, lobbyError, resetLobby, setLastOpponent, setLobby } from './lobby.js';
import { signed } from './stats.js';
import { sound } from './sound.js';
import { REACTIONS } from './reactions.js';
import { t } from './i18n.js';
import { celebrate, drawWin, isWon, syncMarks } from './board.js';
import { game, saveSettings, settings, zeroScores } from './game.js';

const $ = (id) => document.getElementById(id);

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

// What main.js does when the match changes: redraw, or clear the board
let hooks = { render() {}, resetBoard() {} };

export const online = () => settings.mode === 'online';
// Guests, and players who haven't confirmed their email, can pick Online
// but only see what they need to do first
export const onlineLocked = () => online() && !canPlayOnline();
export const inMatch = () => !!match && !match.ended;
export const isConnected = () => liveStatus === 'online';
export const mySymbol = () => (match && match.players.O.id === me?.id ? 'O' : 'X');
export const opponent = () => (match ? match.players[other(mySymbol())] : null);
export const matchMoves = () => match?.moves.length ?? 0;
const ratingOf = (p) => ratings.get(p.id) ?? p.rating;
// The rules on the board: an online match's own, otherwise the player's choice
// (the daily puzzle is always classic)
export const variant = () =>
  online() && match
    ? (match.variant ?? 'classic')
    : settings.mode === 'puzzle'
      ? 'classic'
      : settings.variant;

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

/* ---------- What the page shows ---------- */

// The status line during an online match, or null to let main.js decide
export function onlineStatus(w, tag) {
  if (onlineLocked()) return '';
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

export function playerLabel(p) {
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
  $('lobby').hidden = inMatch();
  $('roomInfo').hidden = !inMatch();
  if (inMatch()) {
    const rival = opponent();
    $('opponentName').textContent =
      `${avatarEmoji(rival.avatar)} ${countryFlag(rival.country)} ${rival.username}`;
    const chip = document.createElement('span');
    chip.className = 'rating-chip';
    chip.title = t('Rating');
    chip.textContent = String(ratingOf(rival));
    $('opponentName').append(' ', chip);
    const role = mySymbol() === 'X' ? t('You are X and open the first round.') : t('You are O.');
    $('roomRole').textContent = variant() === 'vanish' ? `${role} ${t('3-mark rules.')}` : role;
  }
  // The lobby refreshes its list only while it's on screen
  setLobby({ visible: online() && !onlineLocked() && !$('gameView').hidden, inMatch: inMatch() });
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

function showMatch(next) {
  const newMatch = !match || match.id !== next.id;
  const newRound = newMatch || match.round !== next.round;
  const wasOver = !newRound && game.over;
  // A single new mark is a move played live (a reload redraws them all)
  const fresh = newRound ? next.moves.length : next.moves.length - match.moves.length;
  if (newMatch && next.round === 1 && next.moves.length === 0) sound.matchFound();
  match = next;
  if (!online()) {
    settings.mode = 'online';
    saveSettings();
  }
  if (newRound) hooks.resetBoard();
  turnEndsAt =
    next.turnLeft === null || next.turnLeft === undefined ? null : Date.now() + next.turnLeft;
  game.board = next.board.slice();
  game.marks = replay(next.moves, next.starter, next.variant ?? 'classic').marks;
  game.turn = next.turn;
  game.over = next.over;
  game.busy = false;
  settings.scores = { ...next.score };
  syncMarks(game.board);
  if (next.line && !isWon()) drawWin(next.line);
  if (fresh === 1) sound.mark(next.board[next.moves.at(-1)]);
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
      if (msg.match === match?.id) showReaction(msg);
      return;
    case 'ratings': {
      const change = {};
      for (const [id, r] of Object.entries(msg.ratings)) {
        ratings.set(Number(id), r.rating);
        change[id] = r.change;
      }
      lastRound = { match: msg.match, round: msg.round, change };
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
  ratings.clear();
  lastRound = null;
  resetLobby();
}

/* ---------- Move clock and reactions ---------- */

// Seconds left for the move, shown under the status; the server decides
// when time is up, this is only the countdown
function renderClock() {
  const el = $('turnClock');
  const running = inMatch() && !game.over && turnEndsAt !== null && isConnected();
  el.hidden = !running;
  if (!running) return;
  const secs = Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000));
  el.textContent =
    game.turn === mySymbol()
      ? t('⏱ Your time: {secs}s', { secs })
      : t("⏱ {name}'s time: {secs}s", { name: opponent().username, secs });
  el.classList.toggle('low', secs <= 10);
}

function showReaction({ from, emoji }) {
  const mine = from === me?.id;
  const bubble = document.createElement('span');
  bubble.className = `bubble ${mine ? 'mine' : 'theirs'}`;
  bubble.textContent = emoji;
  $('reactionFeed').append(bubble);
  setTimeout(() => bubble.remove(), 2400);
  $('reactionSaid').textContent = `${mine ? t('You') : opponent()?.username}: ${emoji}`;
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
}

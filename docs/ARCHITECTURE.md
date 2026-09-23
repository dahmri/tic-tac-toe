# Architecture

How the game is built, and how it grows from one server to millions of players.

## Overview

```
 browser ──https──▶ nginx (web) ──▶ game server (api) ×N ──▶ PostgreSQL
                    static files        stateless          accounts, history
                                          │
                                          └──────────────▶ Redis
                                                           sessions, rate limits,
                                                           presence, live games
```

| Part                   | Technology            | Holds                                                    |
| ---------------------- | --------------------- | -------------------------------------------------------- |
| Site                   | HTML, CSS, vanilla JS | Rendering, input, the computer opponent                  |
| Web server             | nginx                 | Serves the site; forwards `/api` and `/ws` to the api    |
| Game server (`server`) | Node.js + Fastify     | Nothing between requests: every instance is identical    |
| Database               | PostgreSQL 18         | Accounts, game history, statistics                       |
| Cache and messaging    | Redis 8               | Sessions, rate limits, presence, invitations, live games |

## Why these choices

**PostgreSQL** for anything permanent. Accounts and game results need
transactions, unique constraints (usernames) and reliable backups. One
well-indexed PostgreSQL server handles tens of millions of player rows and
thousands of writes per second; beyond that it scales with read replicas,
a connection pooler (PgBouncer) and, for the game history, partitioning by
date.

**Redis** for everything short-lived and hot. Sessions are checked on every
request, so they live in memory rather than the database. Redis also lets
several game server instances share state and pass messages to each other,
which is what makes them interchangeable.

**Stateless game servers.** No instance keeps anything another instance
would need, so capacity grows by adding instances behind nginx
(`API_REPLICAS=4 docker compose up -d`) or a load balancer, with no sticky
sessions.

**Fastify** is one of the fastest Node.js web frameworks, with little
overhead per request. Node's single thread suits a game server that mostly
waits on the network; the expensive work (password hashing) runs on
Node's thread pool.

**No front-end framework.** The site stays small and fast to load; the only
code the browser downloads is the game's own.

## Accounts and personal data

- **Registration** asks for first name, last name, username, date of birth,
  country, optional phone number and password. The rules live in
  [`js/validation.js`](../js/validation.js) and run in both the browser
  (instant feedback) and the server (the check that counts). Players must be
  at least 13.
- **What others see:** only the username and country.
- **Encryption at rest:** first name, last name, date of birth and phone
  number are sealed together with AES-256-GCM before they reach the database
  (`users.pii`), with a key from `DATA_ENCRYPTION_KEY` that never touches the
  database. A leaked dump or backup exposes only usernames and countries.
  The username and country stay readable because the game looks players up
  by them.
- **Passwords** are hashed with Argon2id (19 MiB, 2 passes, the OWASP
  minimum), using Node's built-in implementation. Hashes are upgraded
  automatically at login if the settings are raised later.
- **Sessions** are 256-bit random tokens in an `HttpOnly`, `SameSite=Lax`
  cookie (`Secure` in production). Redis stores only their SHA-256, so
  reading Redis gives nobody a usable session. They expire after 30 days
  without use. Changing the password logs out every other device.
- **Guessing and spam:** logins are limited per account (10 per 15 minutes)
  and per IP address (30 per 15 minutes); sign-ups to 10 per IP per hour.
  A failed login takes the same time and gives the same message whether or
  not the username exists.
- **Cross-site requests:** requests that change something are refused
  unless they come from the site's own pages (`Origin` check), on top of
  the `SameSite` cookie.

## Online players, invitations and matches

While a player has the game open, their browser keeps a WebSocket
connection to `/ws` ([`server/routes/live.js`](../server/routes/live.js)).
It is refused before the handshake for anyone not logged in or for pages
on other sites.

- **Who's online** ([`server/presence.js`](../server/presence.js)): Redis
  sorted sets of user id → last seen, one for everyone and one per country,
  so the country filter is a single range read however many players are
  online. Each server instance refreshes its own players every 30 seconds;
  anyone not seen for 90 seconds (a crashed instance, a lost network) drops
  off. A connection counter keeps a player with two tabs online until both
  close. The lobby asks for one page at a time (`/api/players/online`) and
  refreshes every 10 seconds while it is on screen, rather than pushing
  every arrival to every player, which would not scale.
- **Messages between instances** ([`server/bus.js`](../server/bus.js)):
  every player has a Redis pub/sub channel. The instance holding their
  connection listens to it, so an invitation or a move handled by any
  instance reaches them.
- **Invitations** ([`server/invites.js`](../server/invites.js)) live for 60
  seconds in Redis. Accepting, declining and cancelling each start by
  deleting the invitation, and only the request that actually deleted it
  goes on, so an invitation can't be both accepted and cancelled.
- **Matches** ([`server/match.js`](../server/match.js) for the rules,
  [`server/matches.js`](../server/matches.js) for storage) are played on
  the server: browsers only send the square they want. The match is stored
  in Redis and every change is a compare-and-set, so two moves racing for
  the same turn can't both land. Starting a match claims both players
  atomically, so nobody ends up in two matches. After a disconnect a player
  has 20 seconds to come back (a reload rejoins the match); after that, or
  on **Leave**, a round in progress is won by the other player.

### Live messages

| Direction        | Message                                                           |
| ---------------- | ----------------------------------------------------------------- |
| browser → server | `invite {to}`, `invite-accept {id}`, `invite-decline {id}`        |
|                  | `invite-cancel {id}`, `move {match, square}`                      |
|                  | `next-round {match}`, `leave {match}`, `ping`                     |
| server → browser | `hello {me, match, invites}` on connect                           |
|                  | `match {match}` after every change, to both players               |
|                  | `invite {invite}`, `invite-sent {invite}`                         |
|                  | `invite-declined {id, by}`, `invite-gone {id}`, `error {message}` |

Every message from a browser is checked: its type, that the player is in
the match, that it's their turn and the square is free. Each connection may
send at most 60 messages per 10 seconds, and 4 KB per message.

## Game history and statistics

Every finished round is saved in PostgreSQL
([`server/stats.js`](../server/stats.js),
[`migrations/002_games.sql`](../server/migrations/002_games.sql)):

| Table          | Holds                                                              |
| -------------- | ------------------------------------------------------------------ |
| `games`        | One row per round: players, result, moves, start and end           |
| `player_games` | One row per player per round, keyed `(user_id, ended_at, game_id)` |
| `player_stats` | Running totals per player: record, streaks, X/O split, fastest win |
| `head_to_head` | Running totals per pair of players                                 |

The game and every total it changes are written in one transaction, so the
numbers always add up, and reading a player's stats is a single-row lookup
however many games they've played. History is paged by `(ended_at,
game_id)`, a straight walk down the primary key, never an `OFFSET`.
Players' rows are always locked in id order, so two games can't deadlock.

**Online rounds** are recorded by the server the moment they end, so their
results can be trusted. Each round is recorded once (a unique index on
`match_id, round`); if the database is briefly unreachable, the round waits
in Redis and is retried every 30 seconds.

**Games against the computer** run in the browser, so the server replays
the moves before counting them ([`server/cpu-game.js`](../server/cpu-game.js)):
they must be legal and finished, and the computer's moves must be ones it
could make. "Unbeatable" must play perfectly (so a win against it is
refused), "Casual" always takes a winning move. The server works out the
result itself. They are counted apart from online games.

## API

| Method   | Path                  | What it does                                         |
| -------- | --------------------- | ---------------------------------------------------- |
| `POST`   | `/api/account`        | Create an account and log in                         |
| `POST`   | `/api/session`        | Log in                                               |
| `DELETE` | `/api/session`        | Log out                                              |
| `GET`    | `/api/me`             | Your profile                                         |
| `PATCH`  | `/api/me`             | Change any profile fields                            |
| `PUT`    | `/api/me/password`    | Change password (logs out your other devices)        |
| `GET`    | `/api/players/online` | Online players: `?country=FR&offset=0&limit=30`      |
| `GET`    | `/api/me/stats`       | Your totals, streaks and most played opponents       |
| `GET`    | `/api/me/games`       | Your game history, newest first: `?cursor=&limit=20` |
| `POST`   | `/api/games/cpu`      | Record a finished game against the computer          |
| `GET`    | `/ws`                 | The live connection (WebSocket), see above           |
| `GET`    | `/api/health`         | `{ ok: true }` when PostgreSQL and Redis answer      |

Errors are JSON: `{ "error": "message", "fields": { "username": "message" } }`.

## Database changes

Schema changes are plain SQL files in
[`server/migrations/`](../server/migrations/), applied in order, each once,
by `npm run migrate` (the `migrate` service in Docker Compose). In
development the server applies them itself on start.

## Growing further

In rough order, as traffic grows:

1. More game server instances (`API_REPLICAS`), and a bigger database machine.
2. PgBouncer between the game servers and PostgreSQL; read replicas for
   read-heavy pages such as statistics.
3. A managed Redis with replicas (or Redis Cluster).
4. Several machines behind a load balancer, with the images published to a
   container registry and run by an orchestrator (e.g. Kubernetes).
5. Partition the game history table by month.

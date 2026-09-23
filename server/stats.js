// Game history and statistics in PostgreSQL (see migrations/002_games.sql).
// Recording a game writes the game, one history row per player, and the
// running totals, all in one transaction, so the numbers always add up.

const RETRY_KEY = 'stats:retry';

const outcomeFor = (symbol, result) => (result === 'D' ? 'D' : result === symbol ? 'W' : 'L');

// What one game adds to a player's totals
function deltas({ online, symbol, outcome, forfeit, moveCount, difficulty }) {
  const on = (cond) => (online && cond ? 1 : 0);
  const cpu = (cond) => (!online && cond ? 1 : 0);
  const W = outcome === 'W';
  const L = outcome === 'L';
  const D = outcome === 'D';
  return [
    on(true),
    on(W),
    on(L),
    on(D),
    on(symbol === 'X' && W),
    on(symbol === 'X'),
    on(symbol === 'O' && W),
    on(symbol === 'O'),
    on(W && forfeit),
    on(L && forfeit),
    on(W), // starting streak
    on(W),
    online && W && !forfeit ? moveCount : null, // fastest win (a real one, not a walkover)
    cpu(true),
    cpu(W),
    cpu(L),
    cpu(D),
    cpu(difficulty === 'hard'),
    cpu(difficulty === 'hard' && D),
  ];
}

const UPSERT_STATS = `
  INSERT INTO player_stats (user_id, played, won, lost, drawn, won_as_x, played_as_x,
    won_as_o, played_as_o, wins_by_forfeit, losses_by_forfeit, current_streak, best_streak,
    fastest_win, cpu_played, cpu_won, cpu_lost, cpu_drawn, hard_played, hard_drawn,
    first_played_at, last_played_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $21)
  ON CONFLICT (user_id) DO UPDATE SET
    played = player_stats.played + EXCLUDED.played,
    won = player_stats.won + EXCLUDED.won,
    lost = player_stats.lost + EXCLUDED.lost,
    drawn = player_stats.drawn + EXCLUDED.drawn,
    won_as_x = player_stats.won_as_x + EXCLUDED.won_as_x,
    played_as_x = player_stats.played_as_x + EXCLUDED.played_as_x,
    won_as_o = player_stats.won_as_o + EXCLUDED.won_as_o,
    played_as_o = player_stats.played_as_o + EXCLUDED.played_as_o,
    wins_by_forfeit = player_stats.wins_by_forfeit + EXCLUDED.wins_by_forfeit,
    losses_by_forfeit = player_stats.losses_by_forfeit + EXCLUDED.losses_by_forfeit,
    -- online wins in a row: +1 on a win, back to 0 on a loss or draw
    current_streak = CASE
      WHEN EXCLUDED.played = 0 THEN player_stats.current_streak
      WHEN EXCLUDED.won = 1 THEN player_stats.current_streak + 1
      ELSE 0 END,
    best_streak = GREATEST(player_stats.best_streak, CASE
      WHEN EXCLUDED.won = 1 THEN player_stats.current_streak + 1 ELSE 0 END),
    fastest_win = LEAST(player_stats.fastest_win, EXCLUDED.fastest_win),
    cpu_played = player_stats.cpu_played + EXCLUDED.cpu_played,
    cpu_won = player_stats.cpu_won + EXCLUDED.cpu_won,
    cpu_lost = player_stats.cpu_lost + EXCLUDED.cpu_lost,
    cpu_drawn = player_stats.cpu_drawn + EXCLUDED.cpu_drawn,
    hard_played = player_stats.hard_played + EXCLUDED.hard_played,
    hard_drawn = player_stats.hard_drawn + EXCLUDED.hard_drawn,
    first_played_at = LEAST(player_stats.first_played_at, EXCLUDED.first_played_at),
    last_played_at = GREATEST(player_stats.last_played_at, EXCLUDED.last_played_at)`;

const UPSERT_H2H = `
  INSERT INTO head_to_head (user_id, opponent_id, played, won, lost, drawn, last_played_at)
  VALUES ($1, $2, 1, $3, $4, $5, $6)
  ON CONFLICT (user_id, opponent_id) DO UPDATE SET
    played = head_to_head.played + 1,
    won = head_to_head.won + EXCLUDED.won,
    lost = head_to_head.lost + EXCLUDED.lost,
    drawn = head_to_head.drawn + EXCLUDED.drawn,
    last_played_at = GREATEST(head_to_head.last_played_at, EXCLUDED.last_played_at)`;

// History pages are addressed by the last game seen: "ended_at|game_id"
const encodeCursor = (row) =>
  Buffer.from(`${row.ended_at.toISOString()}|${row.game_id}`).toString('base64url');
function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length > 100) return null;
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const date = new Date(at);
  return Number.isNaN(date.getTime()) || !/^\d+$/.test(id || '') ? null : [date, Number(id)];
}

const rate = (won, played) => (played ? Math.round((won / played) * 100) : null);

export function createStats(db, redis, log = console) {
  // Saves one finished game. `game` = { mode, matchId?, round?, difficulty?,
  // xId, oId (null = computer), result, forfeit, moves, startedAt, endedAt }
  async function record(game) {
    const online = game.mode === 'online';
    const startedAt = new Date(game.startedAt);
    const endedAt = new Date(game.endedAt);
    return db.tx(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO games (mode, match_id, round, difficulty, x_id, o_id, result, forfeit,
           moves, started_at, ended_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (match_id, round) WHERE match_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          game.mode,
          game.matchId ?? null,
          game.round ?? null,
          game.difficulty ?? null,
          game.xId,
          game.oId ?? null,
          game.result,
          !!game.forfeit,
          game.moves,
          startedAt,
          endedAt,
        ],
      );
      if (!rows[0]) return null; // already recorded
      const gameId = rows[0].id;

      const players = [{ id: game.xId, symbol: 'X', opponent: game.oId ?? null }];
      if (online) players.push({ id: game.oId, symbol: 'O', opponent: game.xId });
      // Always lock players' rows in the same order, so two games can't deadlock
      players.sort((a, b) => a.id - b.id);

      for (const p of players) {
        const outcome = outcomeFor(p.symbol, game.result);
        await client.query(
          `INSERT INTO player_games (user_id, ended_at, game_id, mode, symbol, outcome, opponent_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [p.id, endedAt, gameId, game.mode, p.symbol, outcome, p.opponent],
        );
        const d = deltas({
          online,
          symbol: p.symbol,
          outcome,
          forfeit: game.forfeit,
          moveCount: game.moves.length,
          difficulty: game.difficulty,
        });
        await client.query(UPSERT_STATS, [p.id, ...d, endedAt]);
        if (online) {
          await client.query(UPSERT_H2H, [
            p.id,
            p.opponent,
            outcome === 'W' ? 1 : 0,
            outcome === 'L' ? 1 : 0,
            outcome === 'D' ? 1 : 0,
            endedAt,
          ]);
        }
      }
      return gameId;
    });
  }

  // A finished online round. If the database is unreachable, the round is
  // kept in Redis and retried, so no result is lost.
  async function recordRound(finished) {
    const game = {
      mode: 'online',
      matchId: finished.matchId,
      round: finished.round,
      xId: finished.xId,
      oId: finished.oId,
      result: finished.result,
      forfeit: finished.forfeit,
      moves: finished.moves,
      startedAt: finished.startedAt,
      endedAt: finished.endedAt,
    };
    try {
      await record(game);
    } catch (err) {
      log.error({ err }, 'Could not record a game; will retry');
      await redis.rpush(RETRY_KEY, JSON.stringify(game)).catch(() => {});
    }
  }

  // Retries rounds that couldn't be saved. Safe on every instance at once:
  // each round is popped by one of them, and saving twice is a no-op.
  async function retryPending(max = 100) {
    for (let i = 0; i < max; i++) {
      const raw = await redis.lpop(RETRY_KEY);
      if (!raw) return;
      try {
        await record(JSON.parse(raw));
      } catch (err) {
        await redis.rpush(RETRY_KEY, raw);
        throw err;
      }
    }
  }

  async function summary(userId) {
    const { rows } = await db.query('SELECT * FROM player_stats WHERE user_id = $1', [userId]);
    const s = rows[0];
    const z = (k) => s?.[k] ?? 0;
    return {
      online: {
        played: z('played'),
        won: z('won'),
        lost: z('lost'),
        drawn: z('drawn'),
        winRate: rate(z('won'), z('played')),
        asX: {
          played: z('played_as_x'),
          won: z('won_as_x'),
          winRate: rate(z('won_as_x'), z('played_as_x')),
        },
        asO: {
          played: z('played_as_o'),
          won: z('won_as_o'),
          winRate: rate(z('won_as_o'), z('played_as_o')),
        },
        winsByForfeit: z('wins_by_forfeit'),
        lossesByForfeit: z('losses_by_forfeit'),
        currentStreak: z('current_streak'),
        bestStreak: z('best_streak'),
        fastestWin: s?.fastest_win ?? null,
      },
      computer: {
        played: z('cpu_played'),
        won: z('cpu_won'),
        lost: z('cpu_lost'),
        drawn: z('cpu_drawn'),
        unbeatable: { played: z('hard_played'), drawn: z('hard_drawn') },
      },
      firstPlayedAt: s?.first_played_at ?? null,
      lastPlayedAt: s?.last_played_at ?? null,
    };
  }

  async function opponents(userId, limit = 10) {
    const [{ rows }, count] = await Promise.all([
      db.query(
        `SELECT h.opponent_id, u.username, u.country, h.played, h.won, h.lost, h.drawn,
                h.last_played_at
         FROM head_to_head h JOIN users u ON u.id = h.opponent_id
         WHERE h.user_id = $1
         ORDER BY h.played DESC, h.last_played_at DESC
         LIMIT $2`,
        [userId, limit],
      ),
      db.query('SELECT count(*)::int AS n FROM head_to_head WHERE user_id = $1', [userId]),
    ]);
    return {
      total: count.rows[0].n,
      top: rows.map((r) => ({
        id: r.opponent_id,
        username: r.username,
        country: r.country,
        played: r.played,
        won: r.won,
        lost: r.lost,
        drawn: r.drawn,
        lastPlayedAt: r.last_played_at,
      })),
    };
  }

  // One page of history, newest first
  async function history(userId, { cursor, limit = 20 } = {}) {
    const after = cursor ? decodeCursor(cursor) : null;
    // Two plain forms, so each is a straight walk down the primary key index
    const where = after
      ? 'pg.user_id = $1 AND (pg.ended_at, pg.game_id) < ($3, $4)'
      : 'pg.user_id = $1';
    const params = after ? [userId, limit + 1, after[0], after[1]] : [userId, limit + 1];
    const { rows } = await db.query(
      `SELECT pg.game_id, pg.ended_at, pg.mode, pg.symbol, pg.outcome, g.difficulty,
              g.forfeit, cardinality(g.moves) AS move_count, g.started_at,
              u.id AS opponent_id, u.username, u.country
       FROM player_games pg
       JOIN games g ON g.id = pg.game_id
       LEFT JOIN users u ON u.id = pg.opponent_id
       WHERE ${where}
       ORDER BY pg.ended_at DESC, pg.game_id DESC
       LIMIT $2`,
      params,
    );
    const page = rows.slice(0, limit);
    return {
      games: page.map((r) => ({
        id: r.game_id,
        mode: r.mode,
        endedAt: r.ended_at,
        seconds: Math.max(0, Math.round((r.ended_at - r.started_at) / 1000)),
        symbol: r.symbol,
        outcome: r.outcome,
        forfeit: r.forfeit,
        moves: r.move_count,
        difficulty: r.difficulty,
        opponent:
          r.mode === 'online'
            ? r.opponent_id
              ? { id: r.opponent_id, username: r.username, country: r.country }
              : { id: null, username: 'Deleted player', country: null }
            : null,
      })),
      next: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  return { record, recordRound, retryPending, summary, opponents, history };
}

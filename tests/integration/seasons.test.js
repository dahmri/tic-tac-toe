import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { player, setup } from './helpers.js';
import { previousSeason, seasonOf } from '../../js/seasons.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

// An online round X wins, recorded straight into the statistics
let round = 0;
const xWins = (x, o) =>
  t.app.ctx.stats.record({
    mode: 'online',
    matchId: '00000000-0000-4000-8000-' + String(++round).padStart(12, '0'),
    round: 1,
    xId: x.user.id,
    oId: o.user.id,
    result: 'X',
    forfeit: false,
    moves: [0, 3, 1, 4, 2],
    startedAt: Date.now() - 5000,
    endedAt: Date.now(),
  });

test('a new month starts everyone at 1200, and keeps last month’s podium', async () => {
  const { stats } = t.app.ctx;
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  const now = seasonOf();
  const last = previousSeason(now);

  // Last month: Ann beat Bob. (Played now, then moved back a month.)
  await xWins(ann, bob);
  await t.db.query('UPDATE player_ratings SET season = $1 WHERE user_id = ANY($2)', [
    last,
    [ann.user.id, bob.user.id],
  ]);

  const board = await stats.leaderboard({ userId: ann.user.id });
  assert.equal(board.season.id, now);
  assert.ok(new Date(board.season.endsAt) > new Date());
  assert.equal(board.me, null, 'not ranked this month yet');
  assert.ok(!board.players.some((p) => p.id === ann.user.id));
  assert.deepEqual(
    board.lastSeason.podium
      .filter((p) => [ann.user.id, bob.user.id].includes(p.id))
      .map((p) => [p.username, p.rating]),
    [
      [ann.user.username, 1216],
      [bob.user.username, 1184],
    ],
  );
  assert.equal(await stats.rating(ann.user.id), 1200, 'matchmaking starts her at 1200');

  // This month: Ann's first game archives last month and starts from 1200
  const saved = await xWins(ann, cat);
  assert.equal(saved.players[ann.user.id].rating, 1216);
  const { rows } = await t.db.query('SELECT * FROM season_results WHERE user_id = $1', [
    ann.user.id,
  ]);
  assert.deepEqual(
    rows.map((r) => [r.season, r.variant, r.rating, r.played, r.won]),
    [[last, 'classic', 1216, 1, 1]],
  );
  const summary = await stats.summary(ann.user.id);
  assert.equal(summary.ratings[0].variant, 'classic');
  assert.equal(summary.ratings[0].rating, 1216);
  assert.equal(summary.ratings[0].peakRating, 1216, 'the best ever stays');
  assert.equal(summary.peakRating, 1216);
  assert.equal(summary.online.played, 2, 'lifetime totals keep counting');

  // Bob hasn't played since: his row still holds last month, and counts in its podium
  const podium = await stats.podium(last);
  assert.deepEqual(
    podium.filter((p) => [ann.user.id, bob.user.id].includes(p.id)).map((p) => p.username),
    [ann.user.username, bob.user.username],
  );
  const medals = await stats.medals(ann.user.id);
  assert.ok(
    medals.some((m) => m.season === last && m.variant === 'classic' && m.rank >= 1 && m.rank <= 3),
  );
});

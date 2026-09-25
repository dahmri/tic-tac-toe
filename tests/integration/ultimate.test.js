import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { live, player, setup } from './helpers.js';
import { emptyUltimate, pickUltimateMove, playUltimate } from '../../js/ultimate.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('an Ultimate match online: invited with its rules, refereed by the server', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);
  a.send({ t: 'invite', to: bob.user.id, variant: 'ultimate' });
  const { invite } = await b.next('invite');
  assert.equal(invite.variant, 'ultimate');
  b.send({ t: 'invite-accept', id: invite.id });
  const { match } = await a.next('match');
  await b.next('match');
  assert.equal(match.variant, 'ultimate');
  assert.equal(match.board.length, 81);

  a.send({ t: 'move', match: match.id, square: 40 }); // centre of centre: O goes to board 4
  await Promise.all([a.next('match'), b.next('match')]);
  b.send({ t: 'move', match: match.id, square: 0 });
  assert.equal((await b.next('error')).message, 'Play in the highlighted board.');
  b.send({ t: 'move', match: match.id, square: 36 });
  const [{ match: after }] = await Promise.all([a.next('match'), b.next('match')]);
  assert.equal(after.board[36], 'O');
  a.send({ t: 'leave', match: match.id });
  await Promise.all([a.close(), b.close()]);
});

test('Ultimate games against the computer are checked and saved with their rules', async () => {
  const ann = await player(t.app);
  let pos = emptyUltimate('X');
  const moves = [];
  while (!pos.result) {
    const m = pickUltimateMove(pos, 'casual');
    pos = playUltimate(pos, m);
    moves.push(m);
  }
  const res = await ann.post('/api/games/cpu', {
    difficulty: 'casual',
    variant: 'ultimate',
    starter: 'X',
    moves,
    seconds: 60,
  });
  assert.equal(res.status, 201);
  const { games } = (await ann.get('/api/me/games')).body;
  assert.equal(games[0].variant, 'ultimate');
  assert.deepEqual(games[0].squares, moves);
});

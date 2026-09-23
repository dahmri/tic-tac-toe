import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, player, setup, wait } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

const onlineList = async (c, query = '') => (await c.get(`/api/players/online${query}`)).body;

test('the live connection needs a session, from this site', async () => {
  await assert.rejects(t.app.injectWS('/ws', {}), /401/);
  const ann = await player(t.app);
  await assert.rejects(
    t.app.injectWS('/ws', { headers: { cookie: ann.cookie, origin: 'https://evil.example' } }),
    /403/,
  );
});

test('connected players are listed as online, filtered by country, without yourself', async () => {
  const fr = await player(t.app, { country: 'FR' });
  const ma = await player(t.app, { country: 'MA' });
  const viewer = await player(t.app, { country: 'FR' });
  const a = await live(t.app, fr);
  const b = await live(t.app, ma);
  const v = await live(t.app, viewer);
  assert.equal(a.hello.me.username, fr.user.username);
  assert.equal(a.hello.me.firstName, undefined, 'no personal data over the wire');

  const all = await onlineList(viewer);
  const names = all.players.map((p) => p.username);
  assert.ok(names.includes(fr.user.username) && names.includes(ma.user.username));
  assert.ok(!names.includes(viewer.user.username));
  assert.deepEqual(Object.keys(all.players[0]).sort(), [
    'country',
    'id',
    'playing',
    'rating',
    'username',
  ]);

  const france = await onlineList(viewer, '?country=fr');
  assert.ok(france.players.every((p) => p.country === 'FR'));
  assert.ok(france.players.some((p) => p.username === fr.user.username));
  assert.ok(!france.players.some((p) => p.username === ma.user.username));

  assert.equal((await viewer.get('/api/players/online?country=ZZ')).status, 400);
  assert.equal((await client(t.app).get('/api/players/online')).status, 401);

  // Closing the last connection takes the player off the list
  await a.close();
  await wait(100);
  const after = await onlineList(viewer);
  assert.ok(!after.players.some((p) => p.username === fr.user.username));
  await Promise.all([b.close(), v.close()]);
});

test('a player with two tabs stays online until both are closed', async () => {
  const ann = await player(t.app);
  const viewer = await player(t.app);
  const tab1 = await live(t.app, ann);
  const tab2 = await live(t.app, ann);
  await tab1.close();
  await wait(100);
  assert.ok((await onlineList(viewer)).players.some((p) => p.id === ann.user.id));
  await tab2.close();
  await wait(100);
  assert.ok(!(await onlineList(viewer)).players.some((p) => p.id === ann.user.id));
});

test('changing country moves you between country lists', async () => {
  const ann = await player(t.app, { country: 'FR' });
  const viewer = await player(t.app);
  const a = await live(t.app, ann);
  await ann.patch('/api/me', { country: 'JP' });
  const jp = await onlineList(viewer, '?country=JP');
  const fr = await onlineList(viewer, '?country=FR');
  assert.ok(jp.players.some((p) => p.id === ann.user.id && p.country === 'JP'));
  assert.ok(!fr.players.some((p) => p.id === ann.user.id));
  await a.close();
});

test('invite, decline, and invite again', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);

  a.send({ t: 'invite', to: bob.user.id });
  const sent = await a.next('invite-sent');
  const got = await b.next('invite');
  assert.equal(got.invite.from.username, ann.user.username);
  assert.equal(got.invite.id, sent.invite.id);
  assert.equal(got.invite.expiresIn, 60_000);

  a.send({ t: 'invite', to: bob.user.id });
  assert.match((await a.next('error')).message, /already invited/);

  b.send({ t: 'invite-decline', id: got.invite.id });
  const declined = await a.next('invite-declined');
  assert.equal(declined.by, bob.user.username);
  await b.next('invite-gone');

  // Declining is final: accepting the same invitation now fails
  b.send({ t: 'invite-accept', id: got.invite.id });
  assert.match((await b.next('error')).message, /expired/);

  a.send({ t: 'invite', to: bob.user.id });
  await b.next('invite');
  await Promise.all([a.close(), b.close()]);
});

test('an inviter can cancel; pending invitations survive a reload', async () => {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);
  a.send({ t: 'invite', to: bob.user.id });
  const { invite } = await b.next('invite');

  await b.close();
  const b2 = await live(t.app, bob);
  assert.deepEqual(
    b2.hello.invites.map((i) => i.id),
    [invite.id],
  );
  assert.ok(b2.hello.invites[0].expiresIn > 50_000 && b2.hello.invites[0].expiresIn <= 60_000);

  a.send({ t: 'invite-cancel', id: invite.id });
  assert.equal((await b2.next('invite-gone')).id, invite.id);
  b2.send({ t: 'invite-accept', id: invite.id });
  assert.match((await b2.next('error')).message, /expired/);
  await Promise.all([a.close(), b2.close()]);
});

test('you cannot invite yourself, or someone offline', async () => {
  const ann = await player(t.app);
  const offline = await player(t.app);
  const a = await live(t.app, ann);
  a.send({ t: 'invite', to: ann.user.id });
  assert.match((await a.next('error')).message, /another player/);
  a.send({ t: 'invite', to: offline.user.id });
  assert.match((await a.next('error')).message, /no longer online/);
  a.send({ t: 'invite', to: 'nobody' });
  assert.ok((await a.next('error')).message);
  await a.close();
});

async function startMatch() {
  const ann = await player(t.app);
  const bob = await player(t.app);
  const a = await live(t.app, ann);
  const b = await live(t.app, bob);
  a.send({ t: 'invite', to: bob.user.id });
  const { invite } = await b.next('invite');
  b.send({ t: 'invite-accept', id: invite.id });
  const [ma, mb] = await Promise.all([a.next('match'), b.next('match')]);
  assert.deepEqual(ma.match, mb.match);
  return { ann, bob, a, b, id: ma.match.id, match: ma.match };
}

// X plays at x, then waits for both players to see it; same for O
async function move(p, other, id, square) {
  p.send({ t: 'move', match: id, square });
  const [mine] = await Promise.all([p.next('match'), other.next('match')]);
  return mine.match;
}

test('accepting starts a match: the inviter is X, both see every move', async () => {
  const { ann, bob, a, b, id, match } = await startMatch();
  assert.equal(match.players.X.id, ann.user.id);
  assert.equal(match.players.O.id, bob.user.id);
  assert.equal(match.turn, 'X');

  // Both now show as playing, and can't be invited
  const viewer = await player(t.app);
  const v = await live(t.app, viewer);
  const list = await onlineList(viewer);
  assert.equal(list.players.find((p) => p.id === ann.user.id).playing, true);
  v.send({ t: 'invite', to: bob.user.id });
  assert.match((await v.next('error')).message, /already playing/);

  b.send({ t: 'move', match: id, square: 4 });
  assert.match((await b.next('error')).message, /not your turn/);

  await move(a, b, id, 0);
  a.send({ t: 'move', match: id, square: 1 });
  assert.match((await a.next('error')).message, /not your turn/);
  await move(b, a, id, 3);
  b.send({ t: 'move', match: id, square: 0 });
  assert.match((await b.next('error')).message, /not your turn/);
  await move(a, b, id, 1);
  await move(b, a, id, 4);
  const done = await move(a, b, id, 2);
  assert.equal(done.over, true);
  assert.equal(done.result, 'X');
  assert.deepEqual(done.score, { X: 1, O: 0, D: 0 });

  // O opens round two
  b.send({ t: 'next-round', match: id });
  const [r2] = await Promise.all([b.next('match'), a.next('match')]);
  assert.equal(r2.match.round, 2);
  assert.equal(r2.match.turn, 'O');

  await Promise.all([a.close(), b.close(), v.close()]);
});

test('a reload rejoins the match in progress', async () => {
  const { bob, a, b, id } = await startMatch();
  await move(a, b, id, 4);
  await b.close();
  const b2 = await live(t.app, bob);
  assert.equal(b2.hello.match.id, id);
  assert.equal(b2.hello.match.board[4], 'X');
  await move(b2, a, id, 0);
  await Promise.all([a.close(), b2.close()]);
});

test('leaving mid-round forfeits it and frees both players', async () => {
  const { ann, bob, a, b, id } = await startMatch();
  await move(a, b, id, 4);
  a.send({ t: 'leave', match: id });
  const [end] = await Promise.all([b.next('match'), a.next('match')]);
  assert.equal(end.match.ended, true);
  assert.equal(end.match.result, 'O');
  assert.equal(end.match.forfeit, true);

  // Both can play again
  b.send({ t: 'invite', to: ann.user.id });
  await a.next('invite');
  assert.equal(await t.redis.exists(`ingame:${bob.user.id}`), 0);
  await Promise.all([a.close(), b.close()]);
});

test('messages are checked: unknown types, bad JSON, strangers', async () => {
  const { a, b, id } = await startMatch();
  const stranger = await live(t.app, await player(t.app));
  stranger.send({ t: 'move', match: id, square: 0 });
  assert.match((await stranger.next('error')).message, /not in this game/);
  stranger.ws.send('not json');
  assert.match((await stranger.next('error')).message, /Invalid/);
  stranger.send({ t: 'launch-missiles' });
  assert.match((await stranger.next('error')).message, /Unknown/);
  stranger.send({ t: 'ping' });
  await stranger.next('pong');
  await Promise.all([a.close(), b.close(), stranger.close()]);
});

test('two moves racing for the same turn: only one lands', async () => {
  const { ann, a, b, id } = await startMatch();
  // A second tab for X sends a different square at the same time
  const a2 = await live(t.app, ann);
  a.send({ t: 'move', match: id, square: 0 });
  a2.send({ t: 'move', match: id, square: 8 });
  const [ok, refused] = await Promise.all([
    b.next('match'),
    Promise.any([a.next('error'), a2.next('error')]),
  ]);
  assert.match(refused.message, /not your turn|taken/);
  const board = ok.match.board;
  assert.equal(board.filter(Boolean).length, 1);
  await wait(100);
  const stored = JSON.parse(await t.redis.get(`match:${id}`));
  assert.equal(stored.board.filter(Boolean).length, 1);
  await Promise.all([a.close(), a2.close(), b.close()]);
});

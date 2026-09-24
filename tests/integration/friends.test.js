import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, live, player, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('add friends by username or id, see who is online, remove them', async () => {
  const [ann, bob, cat] = await Promise.all([player(t.app), player(t.app), player(t.app)]);
  assert.equal(
    (await ann.post('/api/friends', { username: bob.user.username.toUpperCase() })).status,
    201,
  );
  assert.equal((await ann.post('/api/friends', { id: cat.user.id })).status, 201);
  assert.equal((await ann.post('/api/friends', { id: cat.user.id })).status, 201, 'twice is fine');

  const b = await live(t.app, bob);
  const { friends } = (await ann.get('/api/friends')).body;
  assert.deepEqual(
    friends.map((f) => [f.username, f.online, f.playing]),
    [
      [bob.user.username, true, false],
      [cat.user.username, false, false],
    ],
    'online first',
  );
  assert.deepEqual(Object.keys(friends[0]).sort(), [
    'avatar',
    'country',
    'id',
    'online',
    'playing',
    'rating',
    'username',
  ]);
  assert.equal((await bob.get('/api/friends')).body.friends.length, 0, 'one way');

  assert.equal((await ann.request('DELETE', `/api/friends/${cat.user.id}`)).status, 204);
  assert.equal((await ann.get('/api/friends')).body.friends.length, 1);
  await b.close();
});

test('refused: unknown players, yourself, and without a session', async () => {
  const ann = await player(t.app);
  const unknown = await ann.post('/api/friends', { username: 'no_such_player' });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, 'No player has that username.');
  assert.equal((await ann.post('/api/friends', { id: ann.user.id })).body.error, "That's you!");
  assert.equal((await client(t.app).get('/api/friends')).status, 401);
});

test('deleting an account removes it from friends lists', async () => {
  const [ann, bob] = await Promise.all([player(t.app), player(t.app)]);
  await ann.post('/api/friends', { id: bob.user.id });
  await bob.request('DELETE', '/api/me', { password: 'a good long password' });
  assert.equal((await ann.get('/api/friends')).body.friends.length, 0);
});

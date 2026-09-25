import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRestore } from '../../server/restore-check.js';
import { player, setup } from './helpers.js';

let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('a good copy passes; the wrong key or a missing migration fails', async () => {
  await player(t.app);
  await player(t.app);
  const good = await checkRestore(t.db, t.config.dataKey);
  assert.deepEqual(good.problems, []);
  assert.equal(good.ok, true);
  assert.equal(good.counts.users, 2);

  const wrongKey = await checkRestore(t.db, Buffer.alloc(32, 9));
  assert.equal(wrongKey.ok, false);
  assert.match(wrongKey.problems[0], /2 of 2 players/);

  await t.db.query("DELETE FROM schema_migrations WHERE name = '012_ultimate.sql'");
  try {
    const old = await checkRestore(t.db, t.config.dataKey);
    assert.match(old.problems.join(), /Migrations missing: 012_ultimate\.sql/);
  } finally {
    await t.db.query("INSERT INTO schema_migrations (name) VALUES ('012_ultimate.sql')");
  }
});

// PostgreSQL connection pool. Queries elsewhere use `db.query(sql, params)`
// with $1-style parameters only, never string-built SQL.

import pg from 'pg';

// Return bigint ids and counts as JS numbers: they stay far below 2^53
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// Keep DATE columns as 'YYYY-MM-DD' strings instead of shifting them into
// the server's time zone
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export function createDb(config) {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: 'tic-tac-toe',
  });

  return {
    pool,
    query: (text, params) => pool.query(text, params),
    // Runs fn(client) in a transaction, rolling back if it throws
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

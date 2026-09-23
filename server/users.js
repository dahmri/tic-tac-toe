// Reading and writing player accounts. Personal fields are sealed before
// they reach the database and opened only to show players their own profile.

import { openPII, sealPII } from './security.js';

const PII_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone'];

export class UsernameTakenError extends Error {}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));

function isUniqueViolation(err) {
  return err?.code === '23505';
}

export function createUsers(db, dataKey) {
  // The full profile, only ever returned to its owner
  function toProfile(row) {
    return {
      id: row.id,
      username: row.username,
      country: row.country,
      ...openPII(row.pii, dataKey),
      createdAt: row.created_at,
    };
  }

  return {
    async create(fields, passwordHash) {
      try {
        const { rows } = await db.query(
          `INSERT INTO users (username, country, pii, password_hash)
           VALUES ($1, $2, $3, $4)
           RETURNING id, username, country, pii, created_at`,
          [
            fields.username,
            fields.country,
            sealPII(pick(fields, PII_FIELDS), dataKey),
            passwordHash,
          ],
        );
        return toProfile(rows[0]);
      } catch (err) {
        if (isUniqueViolation(err)) throw new UsernameTakenError();
        throw err;
      }
    },

    async findLogin(username) {
      const { rows } = await db.query(
        'SELECT id, password_hash FROM users WHERE lower(username) = lower($1)',
        [username],
      );
      return rows[0] || null;
    },

    async profile(id) {
      const { rows } = await db.query(
        'SELECT id, username, country, pii, created_at FROM users WHERE id = $1',
        [id],
      );
      return rows[0] ? toProfile(rows[0]) : null;
    },

    // What other players may see: never the personal fields
    async publicProfile(id) {
      const { rows } = await db.query('SELECT id, username, country FROM users WHERE id = $1', [
        id,
      ]);
      return rows[0] || null;
    },

    async passwordHash(id) {
      const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [id]);
      return rows[0]?.password_hash ?? null;
    },

    // Applies a validated partial profile. The sealed personal data is
    // rewritten as a whole, inside a transaction so two edits can't mix.
    async update(id, changes) {
      try {
        return await db.tx(async (client) => {
          const { rows } = await client.query(
            'SELECT id, username, country, pii, created_at FROM users WHERE id = $1 FOR UPDATE',
            [id],
          );
          if (!rows[0]) return null;
          const next = { ...toProfile(rows[0]), ...changes };
          const { rows: updated } = await client.query(
            `UPDATE users SET username = $2, country = $3, pii = $4, updated_at = now()
             WHERE id = $1
             RETURNING id, username, country, pii, created_at`,
            [id, next.username, next.country, sealPII(pick(next, PII_FIELDS), dataKey)],
          );
          return toProfile(updated[0]);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw new UsernameTakenError();
        throw err;
      }
    },

    async setPasswordHash(id, passwordHash) {
      await db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
        id,
        passwordHash,
      ]);
    },
  };
}

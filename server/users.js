// Reading and writing player accounts. Personal fields are sealed before
// they reach the database and opened only to show players their own profile.
// The email address is one of them; `email_hash` keeps addresses unique.

import { emailHash, openPII, sealPII } from './security.js';
import { START_RATING } from './rating.js';

const PII_FIELDS = ['firstName', 'lastName', 'birthDate', 'phone', 'email'];
const COLUMNS = 'id, username, country, avatar, pii, email_verified_at, created_at';

export class UsernameTakenError extends Error {}
export class EmailTakenError extends Error {}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));

// A unique index said no: which one?
function takenError(err) {
  if (err?.code !== '23505') return err;
  return err.constraint === 'users_email_hash_key'
    ? new EmailTakenError()
    : new UsernameTakenError();
}

export function createUsers(db, dataKey) {
  // The full profile, only ever returned to its owner
  function toProfile(row) {
    return {
      id: row.id,
      username: row.username,
      country: row.country,
      avatar: row.avatar,
      email: null, // accounts from before emails existed
      ...openPII(row.pii, dataKey),
      emailVerified: !!row.email_verified_at,
      createdAt: row.created_at,
    };
  }

  return {
    async create(fields, passwordHash, recoveryHash = null) {
      try {
        const { rows } = await db.query(
          `INSERT INTO users (username, country, avatar, pii, password_hash, recovery_hash,
             email_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${COLUMNS}`,
          [
            fields.username,
            fields.country,
            fields.avatar,
            sealPII(pick(fields, PII_FIELDS), dataKey),
            passwordHash,
            recoveryHash,
            emailHash(fields.email, dataKey),
          ],
        );
        return toProfile(rows[0]);
      } catch (err) {
        throw takenError(err);
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
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
      return rows[0] ? toProfile(rows[0]) : null;
    },

    // What other players may see: never the personal fields. `verified`
    // (email confirmed) is for the server's own checks.
    async publicProfile(id) {
      const { rows } = await db.query(
        `SELECT u.id, u.username, u.country, u.avatar, coalesce(s.rating, ${START_RATING}) AS rating,
                u.email_verified_at IS NOT NULL AS verified
         FROM users u LEFT JOIN player_stats s ON s.user_id = u.id WHERE u.id = $1`,
        [id],
      );
      return rows[0] || null;
    },

    async passwordHash(id) {
      const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [id]);
      return rows[0]?.password_hash ?? null;
    },

    // Applies a validated partial profile. The sealed personal data is
    // rewritten as a whole, inside a transaction so two edits can't mix.
    // A new email address has to be confirmed again.
    // Returns { user, emailChanged }, or null if the account is gone.
    async update(id, changes) {
      try {
        return await db.tx(async (client) => {
          const { rows } = await client.query(
            `SELECT ${COLUMNS}, email_hash FROM users WHERE id = $1 FOR UPDATE`,
            [id],
          );
          if (!rows[0]) return null;
          const before = toProfile(rows[0]);
          const next = { ...before, ...changes };
          const emailChanged = !!next.email && next.email !== before.email;
          const { rows: updated } = await client.query(
            `UPDATE users SET username = $2, country = $3, avatar = $4, pii = $5,
               email_hash = $6,
               email_verified_at = CASE WHEN $7 THEN NULL ELSE email_verified_at END,
               updated_at = now()
             WHERE id = $1
             RETURNING ${COLUMNS}`,
            [
              id,
              next.username,
              next.country,
              next.avatar,
              sealPII(pick(next, PII_FIELDS), dataKey),
              next.email ? emailHash(next.email, dataKey) : rows[0].email_hash,
              emailChanged,
            ],
          );
          return { user: toProfile(updated[0]), emailChanged };
        });
      } catch (err) {
        throw takenError(err);
      }
    },

    // Confirms the address, if it is still the one the link was sent to
    async confirmEmail(id, hash) {
      const { rowCount } = await db.query(
        `UPDATE users SET email_verified_at = coalesce(email_verified_at, now())
         WHERE id = $1 AND email_hash = $2`,
        [id, hash],
      );
      return rowCount === 1;
    },

    emailHash: (email) => emailHash(email, dataKey),

    // For a reset by email: the account with this username or email
    // address, if its address is confirmed
    async findConfirmed(login) {
      const hash = login.includes('@') ? emailHash(login, dataKey) : null;
      const { rows } = await db.query(
        `SELECT ${COLUMNS}, password_hash FROM users
         WHERE email_verified_at IS NOT NULL
           AND (lower(username) = lower($1) OR email_hash = $2)
         LIMIT 1`,
        [login, hash],
      );
      return rows[0] ? { ...toProfile(rows[0]), passwordHash: rows[0].password_hash } : null;
    },

    // For a password reset: the account and its recovery code's hash
    async findRecovery(username) {
      const { rows } = await db.query(
        'SELECT id, username, recovery_hash FROM users WHERE lower(username) = lower($1)',
        [username],
      );
      return rows[0] || null;
    },

    async setRecoveryHash(id, hash) {
      await db.query('UPDATE users SET recovery_hash = $2, updated_at = now() WHERE id = $1', [
        id,
        hash,
      ]);
    },

    // Deletes the account and everything that is only about this player.
    // Online games stay in opponents' histories (see migration 006).
    async remove(id) {
      await db.tx(async (client) => {
        await client.query(`DELETE FROM games WHERE mode = 'cpu' AND x_id = $1`, [id]);
        await client.query('DELETE FROM users WHERE id = $1', [id]);
      });
    },

    async setPasswordHash(id, passwordHash) {
      await db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
        id,
        passwordHash,
      ]);
    },
  };
}

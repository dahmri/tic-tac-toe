// For whoever runs the site (players with role 'admin'; see make-admin.js).
//
//   GET    /api/admin/reports                  open reports, oldest first
//   POST   /api/admin/reports/:id/dismiss      nothing to do about it
//   GET    /api/admin/players?q=ann            players whose name starts so
//   POST   /api/admin/players/:id/rename       { username? } (Player<id> if none)
//   POST   /api/admin/players/:id/suspend      { days: 1 | 7 | 30 | null (until further notice) }
//   POST   /api/admin/players/:id/unsuspend
//   DELETE /api/admin/players/:id              delete the account
//   GET    /api/admin/log                      what admins did lately
//   GET    /api/admin/usage                    usage numbers, last 30 days

import { AdminError } from '../admin.js';
import { UsernameTakenError } from '../users.js';
import { checkUsername } from '../../js/validation.js';

const SUSPENSIONS = [1, 7, 30, null];

export default async function adminRoutes(app) {
  const { admin } = app.ctx;

  // Anyone else gets "not found", as if there were nothing here
  const requireAdmin = async (req, reply) => {
    if (!(await admin.isAdmin(req.userId))) return reply.code(404).send({ error: 'Not found.' });
  };
  const opts = { preHandler: requireAdmin };
  const idOf = (req) => Number.parseInt(req.params.id, 10);

  // Runs an action on a player, turning its refusals into 400s
  const act = (fn) => async (req, reply) => {
    const id = idOf(req);
    if (!Number.isInteger(id) || id === req.userId) {
      return reply.code(400).send({ error: 'Invalid request.' });
    }
    try {
      return (await fn(req, id)) ?? reply.code(204).send();
    } catch (err) {
      if (err instanceof AdminError) return reply.code(400).send({ error: err.message });
      if (err instanceof UsernameTakenError) {
        return reply.code(400).send({ error: 'That username is taken.' });
      }
      throw err;
    }
  };

  app.get('/api/admin/reports', opts, async () => ({ reports: await admin.reports() }));

  app.post('/api/admin/reports/:id/dismiss', opts, async (req, reply) => {
    const id = idOf(req);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid request.' });
    await admin.dismiss(req.userId, id);
    return reply.code(204).send();
  });

  app.get('/api/admin/players', opts, async (req) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 20) : '';
    return { players: await admin.search(q) };
  });

  app.post(
    '/api/admin/players/:id/rename',
    opts,
    act(async (req, id) => {
      let name = req.body?.username;
      if (name) {
        const [value, problem] = checkUsername(name);
        if (problem) throw new AdminError(problem);
        name = value;
      }
      return { username: await admin.rename(req.userId, id, name) };
    }),
  );

  app.post(
    '/api/admin/players/:id/suspend',
    opts,
    act(async (req, id) => {
      const days = req.body?.days ?? null;
      if (!SUSPENSIONS.includes(days)) throw new AdminError('Invalid request.');
      return { until: await admin.suspend(req.userId, id, days) };
    }),
  );

  app.post(
    '/api/admin/players/:id/unsuspend',
    opts,
    act((req, id) => admin.unsuspend(req.userId, id)),
  );

  app.delete(
    '/api/admin/players/:id',
    opts,
    act((req, id) => admin.remove(req.userId, id)),
  );

  app.get('/api/admin/log', opts, async () => ({ log: await admin.history() }));

  app.get('/api/admin/usage', opts, async () => admin.usage());
}

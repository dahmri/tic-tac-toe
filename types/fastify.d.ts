// What server/app.js adds to Fastify, so the type check knows about it.

import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    /** Everything the routes share: config, db, redis and the stores */
    ctx: any;
    /** preHandler that answers 401 without a session */
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
  interface FastifyRequest {
    /** The signed-in player, from the session cookie, or null */
    userId: number | null;
    /** The page's language, from Accept-Language */
    lang: string;
    /** The live connection's profile (routes/live.js) */
    profile?: any;
  }
}

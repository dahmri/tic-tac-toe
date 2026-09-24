// Server settings, read once from environment variables.
// See .env.example for what each one does.

const DEV_DATA_KEY = Buffer.alloc(32, 7).toString('base64'); // never used in production

function parseTrustProxy(value) {
  if (!value || value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value.split(',').map((s) => s.trim());
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const dataKey = env.DATA_ENCRYPTION_KEY || (production ? '' : DEV_DATA_KEY);
  const key = Buffer.from(dataKey, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'DATA_ENCRYPTION_KEY must be 32 random bytes in base64. Generate one with: openssl rand -base64 32',
    );
  }

  return {
    production,
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT) || 8000,
    databaseUrl: env.DATABASE_URL || 'postgres://localhost/tictactoe',
    dbPoolSize: Number(env.DB_POOL_SIZE) || 20,
    redisUrl: env.REDIS_URL || 'redis://127.0.0.1:6379',
    dataKey: key,
    // Serve the site's files from this folder too (development and tests);
    // in production nginx serves them and forwards /api and /ws here
    staticDir: env.STATIC_DIR || '',
    // Behind nginx: how many proxies to trust for the client's IP and
    // protocol (X-Forwarded-*). A number of hops, or a list of addresses.
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    // Session cookies are HTTPS-only in production. Only the CI stack, which
    // runs production images over plain http, turns this off.
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    // Browser origins allowed to call the API. Same-origin is always allowed.
    allowedOrigins: (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // How long a player whose last connection closed (a reload, a network
    // blip) has to come back before they leave their match and the
    // quick-match queue. Tests shorten it.
    leaveGraceMs: Number(env.LEAVE_GRACE_MS) || 20_000,
    // Time each player has for a move in online matches. Tests shorten it.
    turnMs: Number(env.TURN_MS) || 30_000,
    // Browser tests sign up many players from one IP, so they turn this off
    rateLimits: env.RATE_LIMITS !== 'off',
    logLevel: env.LOG_LEVEL || (production ? 'info' : 'warn'),
  };
}

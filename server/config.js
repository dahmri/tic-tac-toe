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

  // Links in emails point here. Never taken from the request in
  // production: a forged Host header could otherwise aim them elsewhere.
  const siteUrl = (env.SITE_URL || '').replace(/\/+$/, '');
  if (production && !/^https?:\/\//.test(siteUrl)) {
    throw new Error('SITE_URL must be set in production, e.g. https://tictactoe.example.com');
  }
  const mailOutbox = env.MAIL_OUTBOX === 'on';
  if (mailOutbox && env.SMTP_HOST) {
    throw new Error('MAIL_OUTBOX is for tests only: turn it off when SMTP_HOST is set');
  }

  return {
    production,
    siteUrl,
    // Email (see server/mailer.js)
    smtp: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT) || 587,
      // true for port 465 (TLS from the start); 587 upgrades with STARTTLS
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : Number(env.SMTP_PORT) === 465,
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
    },
    mailFrom: env.MAIL_FROM || 'Pencil Tic-Tac-Toe <no-reply@localhost>',
    // Web push (server/push.js): the VAPID key pair (npx web-push
    // generate-vapid-keys) and a contact for push services. Without the
    // keys, notifications are off.
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
      subject:
        env.VAPID_SUBJECT || (siteUrl.startsWith('https:') ? siteUrl : 'mailto:admin@localhost'),
    },
    mailOutbox,
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
    // Tests only: the weekly arena (js/arena.js) runs all day, every day
    arenaAlways: env.ARENA_ALWAYS === 'on',
    // The breather between arena games (ms); tests shorten it
    arenaRestMs: env.ARENA_REST_MS ? Number(env.ARENA_REST_MS) : 5000,
    // How often the arena pairs players (ms); 0 stops it (API tests run it
    // by hand)
    arenaSweepMs: env.ARENA_SWEEP_MS ? Number(env.ARENA_SWEEP_MS) : 2000,
    // The sign-up check (server/challenge.js): how hard the puzzle is, and
    // how soon after it's issued an answer is believable. Tests lower both.
    challengeBits: Number(env.SIGNUP_CHALLENGE_BITS) || 18,
    challengeMinMs: env.SIGNUP_CHALLENGE_MIN_MS ? Number(env.SIGNUP_CHALLENGE_MIN_MS) : 1000,
    // Time each player has for a move in online matches. Tests shorten it.
    turnMs: Number(env.TURN_MS) || 30_000,
    // Browser tests sign up many players from one IP, so they turn this off
    rateLimits: env.RATE_LIMITS !== 'off',
    logLevel: env.LOG_LEVEL || (production ? 'info' : 'warn'),
  };
}

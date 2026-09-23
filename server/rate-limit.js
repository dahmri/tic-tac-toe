// Fixed-window rate limits in Redis, shared by all server instances.
// Used to slow down password guessing and sign-up spam.

export function createRateLimiter(redis, enabled = true) {
  // Counts one attempt against `key`. Returns { ok, retryAfter } where
  // retryAfter is the number of seconds until the window resets.
  return async function hit(key, limit, windowSeconds) {
    if (!enabled) return { ok: true, retryAfter: 0 };
    const k = `rl:${key}`;
    const [[, count], , [, ttl]] = await redis
      .multi()
      .incr(k)
      .expire(k, windowSeconds, 'NX')
      .ttl(k)
      .exec();
    return { ok: count <= limit, retryAfter: Math.max(ttl, 1) };
  };
}

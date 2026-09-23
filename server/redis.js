// Redis holds everything short-lived and shared between server instances:
// sessions, rate limits and (later) presence, invitations and live games.

import { Redis } from 'ioredis';

export function createRedis(config) {
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true,
  });
}

// Delivers messages to a player wherever they are connected. Each player
// has a Redis channel (u:<id>); the instance holding their connection
// subscribes to it, so any instance can reach any player.

export function createBus(redis) {
  const sub = redis.duplicate();
  const listeners = new Map(); // user id -> Set of callbacks on this instance

  sub.on('message', (channel, raw) => {
    const set = listeners.get(Number(channel.slice(2)));
    if (!set) return;
    const msg = JSON.parse(raw);
    for (const fn of set) fn(msg);
  });

  return {
    // Calls fn(msg) for every message sent to the player. Returns a
    // function that stops listening.
    async listen(userId, fn) {
      let set = listeners.get(userId);
      if (!set) {
        set = new Set();
        listeners.set(userId, set);
        await sub.subscribe(`u:${userId}`);
      }
      set.add(fn);
      return async () => {
        set.delete(fn);
        if (set.size === 0 && listeners.get(userId) === set) {
          listeners.delete(userId);
          await sub.unsubscribe(`u:${userId}`);
        }
      };
    },

    send(userId, msg) {
      return redis.publish(`u:${userId}`, JSON.stringify(msg));
    },

    close() {
      return sub.quit();
    },
  };
}

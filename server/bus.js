// Delivers messages wherever the listener is connected, through Redis
// pub/sub, so any instance can reach any connection:
//
//   u:<id>        a player's own channel (the instance holding their
//                 connection subscribes to it)
//   m:<match id>  a match's channel, for spectators

export function createBus(redis) {
  const sub = redis.duplicate();
  const listeners = new Map(); // channel -> Set of callbacks on this instance

  sub.on('message', (channel, raw) => {
    const set = listeners.get(channel);
    if (!set) return;
    const msg = JSON.parse(raw);
    for (const fn of set) fn(msg);
  });

  // Calls fn(msg) for every message on the channel; returns a function
  // that stops listening
  async function listenTo(channel, fn) {
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
      await sub.subscribe(channel);
    }
    set.add(fn);
    return async () => {
      set.delete(fn);
      if (set.size === 0 && listeners.get(channel) === set) {
        listeners.delete(channel);
        await sub.unsubscribe(channel);
      }
    };
  }

  const publish = (channel, msg) => redis.publish(channel, JSON.stringify(msg));

  return {
    listen: (userId, fn) => listenTo(`u:${userId}`, fn),
    send: (userId, msg) => publish(`u:${userId}`, msg),
    // A match's spectators
    watch: (matchId, fn) => listenTo(`m:${matchId}`, fn),
    toWatchers: (matchId, msg) => publish(`m:${matchId}`, msg),
    close: () => sub.quit(),
  };
}

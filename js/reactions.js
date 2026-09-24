// Quick emoji reactions players can send during an online match. The
// server only relays emoji from this list, so nobody can send free text.

export const REACTIONS = ['👍', '👏', '😂', '😮', '😱', '🔥', '🤝', '😅'];

export const isReaction = (e) => REACTIONS.includes(e);

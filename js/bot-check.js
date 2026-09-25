// The sign-up check (server/challenge.js): the page fetches a puzzle as
// soon as the sign-up form opens and solves it in a background thread
// (pow-worker.js) while the form is filled in.

import { api } from './api.js';

let pending = null;

// Starts solving a fresh puzzle (again, if one was used or went stale)
export function prepareCheck() {
  pending = (async () => {
    const { challenge, bits } = await api('GET', '/api/challenge');
    return new Promise((resolve, reject) => {
      const worker = new Worker('js/pow-worker.js');
      worker.onmessage = ({ data }) => {
        worker.terminate();
        resolve(data);
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage({ challenge, bits });
    });
  })();
  pending.catch(() => {}); // reported when the answer is asked for
  return pending;
}

// The answer to send with the sign-up: { challenge, nonce }
export async function checkAnswer() {
  const answer = await (pending ?? prepareCheck());
  pending = null; // each answer works once
  return answer;
}

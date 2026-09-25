// Sounds, made on the fly with the Web Audio API: no files to download.
// A pencil scratch for each mark, a little tune for a win, a lower one for
// a loss, and a ding for invitations. Muting is remembered per browser.
//
// Browsers only allow sound after the player has clicked or pressed a key
// on the page, so nothing plays before that.

const STORAGE_KEY = 'pencil-ttt-sound';

let ctx = null;
let on = true;
try {
  on = localStorage.getItem(STORAGE_KEY) !== 'off';
} catch {
  /* storage unavailable: sound on */
}

function audio() {
  if (!on) return null;
  if (!ctx) {
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx.state === 'running' ? ctx : null;
}

// A short note: frequency (Hz), start delay and length (s), wave shape
function tone(ac, freq, at, length, { type = 'triangle', volume = 0.18 } = {}) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

// Pencil on paper: a burst of filtered noise, a little different each time
function scratch(ac, at = 0, length = 0.09) {
  const t = ac.currentTime + at;
  const frames = Math.ceil(ac.sampleRate * length);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2500 + Math.random() * 1500;
  filter.Q.value = 0.9;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

const play = (fn) => () => {
  const ac = audio();
  if (ac) fn(ac);
};

export const sound = {
  // One mark: an X is two strokes, an O one
  mark: (p) =>
    play((ac) => {
      scratch(ac, 0, p === 'O' ? 0.16 : 0.08);
      if (p === 'X') scratch(ac, 0.14, 0.08);
    })(),
  win: play((ac) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, 0.25 + i * 0.09, 0.3));
  }),
  lose: play((ac) => {
    [392, 330, 262].forEach((f, i) => tone(ac, f, 0.25 + i * 0.13, 0.35, { volume: 0.14 }));
  }),
  draw: play((ac) => {
    tone(ac, 440, 0.25, 0.2, { volume: 0.12 });
    tone(ac, 440, 0.45, 0.25, { volume: 0.12 });
  }),
  invite: play((ac) => {
    tone(ac, 988, 0, 0.5, { type: 'sine', volume: 0.2 });
    tone(ac, 1319, 0.12, 0.6, { type: 'sine', volume: 0.16 });
  }),
  matchFound: play((ac) => {
    tone(ac, 659, 0, 0.18, { type: 'sine' });
    tone(ac, 988, 0.12, 0.3, { type: 'sine' });
  }),
};

export const soundOn = () => on;

// Opponents' moves arrive without a click, so get the audio ready at the
// player's first click or key press
for (const type of ['pointerdown', 'keydown']) {
  document.addEventListener(type, () => audio(), { once: true, capture: true });
}

export function setSound(value) {
  on = value;
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  if (on) sound.mark('X'); // a sample, so players hear it's back
}

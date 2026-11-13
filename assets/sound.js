// Eenvoudige geluidjes voor het grote scherm, zonder geluidsbestanden.
// Browsers staan geluid pas toe na een klik: gebruik de knop "Geluid aan".
let ctx = null;
const state = { on: false };

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', vol = 0.2 } = {}) {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(start, dur, vol) {
  const c = ac();
  const buf = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 900;
  src.buffer = buf; g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export const sound = {
  get on() { return state.on; },
  toggle() {
    state.on = !state.on;
    if (state.on) { ac(); tone(880, 0, 0.15); }
  },
  tick() { if (state.on) tone(1400, 0, 0.05, { type: 'square', vol: 0.06 }); },
  buzz() { if (state.on) tone(160, 0, 0.5, { type: 'sawtooth', vol: 0.12 }); },
  ding() { if (!state.on) return; tone(988, 0, 0.35); tone(1319, 0.12, 0.5); },
  drumroll(sec = 3) {
    if (!state.on) return;
    const n = Math.floor(sec * 22);
    for (let i = 0; i < n; i++) noise(i / 22, 0.06, 0.15 + (i / n) * 0.35);
  },
  fanfare(short = false) {
    if (!state.on) return;
    const notes = short ? [523, 659, 784] : [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, i) => tone(f, i * 0.14, i === notes.length - 1 ? 0.9 : 0.22, { type: 'triangle', vol: 0.22 }));
  },
};

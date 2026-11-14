// Kerst- en wintersportgeluiden voor het grote scherm, zonder geluidsbestanden:
// arrenbelletjes, een Alpenkoebel, een glockenspiel, een ski-swoosh en Jingle Bells.
// Browsers staan geluid pas toe na een klik: gebruik de knop "Geluid aan".
let ctx = null, master = null;
const state = { on: false };

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const now = () => ac().currentTime;

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Glockenspiel: heldere toon met metalige boventonen */
function bell(freq, t, dur = 1.2, vol = 0.22) {
  const c = ac();
  [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([mult, v]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq * mult;
    env(g, t, vol * v, 0.004, dur / mult ** 0.5);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.1);
  });
}

let noiseBuf = null;
function noise() {
  const c = ac();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

/** Arrenbelletjes: een korte schud met kleine belletjes */
function sleigh(t, hits = 7, vol = 0.12) {
  const c = ac();
  for (let i = 0; i < hits; i++) {
    const ht = t + i * 0.018 + Math.random() * 0.012;
    [2350, 3480, 4920].forEach((f, k) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f * (0.97 + Math.random() * 0.06);
      env(g, ht, vol * (k ? 0.5 : 1), 0.002, 0.09 + Math.random() * 0.06);
      o.connect(g).connect(master); o.start(ht); o.stop(ht + 0.25);
    });
    const n = noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 6500;
    env(g, ht, vol * 0.6, 0.001, 0.05);
    n.connect(f).connect(g).connect(master); n.start(ht); n.stop(ht + 0.08);
  }
}

/** Alpenkoebel (de 'tijd is om'-klonk) */
function cowbell(t, vol = 0.25) {
  const c = ac();
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.frequency.value = 760; f.Q.value = 1.2;
  [562, 845].forEach((fr) => {
    const o = c.createOscillator();
    o.type = 'square'; o.frequency.value = fr;
    o.connect(f); o.start(t); o.stop(t + 0.9);
  });
  env(g, t, vol, 0.003, 0.7);
  f.connect(g).connect(master);
}

/** Ski-swoosh: ruis die langs je heen schiet */
function swoosh(t, vol = 0.22) {
  const c = ac();
  const n = noise(), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.Q.value = 2.2;
  f.frequency.setValueAtTime(380, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.28);
  f.frequency.exponentialRampToValueAtTime(700, t + 0.6);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
  n.connect(f).connect(g).connect(master);
  n.start(t); n.stop(t + 0.7);
}

function snare(t, vol) {
  const c = ac();
  const n = noise(), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
  env(g, t, vol, 0.002, 0.07);
  n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + 0.1);
}

// Jingle Bells (James Lord Pierpont, 1857), melodie in C
const N = { C: 523.25, D: 587.33, E: 659.25, F: 698.46, G: 783.99, A: 880, C6: 1046.5 };
const JINGLE = [['E', 1], ['E', 1], ['E', 2], ['E', 1], ['E', 1], ['E', 2], ['E', 1], ['G', 1], ['C', 1.5], ['D', 0.5], ['E', 4]];
const JINGLE_2 = [['F', 1], ['F', 1], ['F', 1.5], ['F', 0.5], ['F', 1], ['E', 1], ['E', 1], ['E', 0.5], ['E', 0.5], ['E', 1], ['D', 1], ['D', 1], ['E', 1], ['D', 2], ['G', 2]];

function melody(notes, t, beat = 0.24, vol = 0.24) {
  let x = t;
  notes.forEach(([n, len], i) => {
    bell(N[n], x, Math.max(0.5, len * beat * 2.2), vol);
    if (i % 2 === 0) sleigh(x, 4, 0.05);
    x += len * beat;
  });
  return x;
}

export const sound = {
  get on() { return state.on; },
  toggle() {
    state.on = !state.on;
    if (state.on) { ac(); sleigh(now() + 0.02, 8, 0.12); bell(N.G * 2, now() + 0.12, 0.8, 0.15); }
  },
  /** laatste vijf seconden van een vraag */
  tick() { if (state.on) sleigh(now(), 4, 0.07); },
  /** tijd is om */
  buzz() { if (!state.on) return; const t = now(); cowbell(t); cowbell(t + 0.28, 0.18); },
  /** nieuwe vraag in beeld */
  whoosh() { if (state.on) swoosh(now()); },
  /** antwoord onthuld */
  ding() { if (!state.on) return; const t = now(); bell(N.G * 2, t, 1.1, 0.2); bell(N.C6 * 2, t + 0.13, 1.4, 0.18); },
  /** iemand op het podium */
  podiumStep() { if (!state.on) return; const t = now(); bell(N.C * 2, t, 0.9, 0.18); bell(N.E * 2, t + 0.1, 0.9, 0.16); bell(N.G * 2, t + 0.2, 1.2, 0.16); },
  drumroll(sec = 3) {
    if (!state.on) return;
    const t = now(), n = Math.floor(sec * 24);
    for (let i = 0; i < n; i++) {
      snare(t + i / 24, 0.08 + (i / n) * 0.3);
      if (i % 3 === 0) sleigh(t + i / 24, 2, 0.02 + (i / n) * 0.06);
    }
  },
  /** het verborgen woord */
  reveal() {
    if (!state.on) return;
    const t = now();
    ['C', 'E', 'G', 'C6'].forEach((n, i) => bell(N[n] * (n === 'C6' ? 1 : 2), t + i * 0.09, 1.4, 0.17));
    sleigh(t, 10, 0.1);
  },
  /** winnaar */
  fanfare() { if (state.on) melody(JINGLE, now() + 0.05, 0.2); },
  /** de grote onthulling */
  jingle() {
    if (!state.on) return;
    const t = now() + 0.05;
    const t2 = melody(JINGLE, t, 0.22);
    melody(JINGLE_2, t2, 0.22);
  },
};

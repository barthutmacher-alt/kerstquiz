import { configured, rpc, stateLoop, el, SHAPES, fmt, stripes, timeLeft, setupMissing, reducedMotion, store } from './core.js';
import { sound } from './sound.js';

const app = document.getElementById('app');
if (!configured) { setupMissing(app); throw new Error('config ontbreekt'); }

const joinUrl = new URL('.', location.href).href;
const joinShort = joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
let S = null, viewKey = '', raf = 0, timers = [], lastTickSec = null;

stateLoop({
  fetch: () => rpc('get_state', { p_token: null, p_screen: true }),
  onState: (s, err) => {
    if (!s) return;
    S = s;
    render();
  },
  intervalFor: (s) => (!s ? 3000 : s.kind === 'question' || s.kind === 'lobby' ? 1000 : s.kind === 'signup' ? 2000 : 3000),
});

/* ---------- opbouw ---------- */
const qrSvg = (url) => {
  const q = window.qrcode(0, 'M');
  q.addData(url);
  q.make();
  const box = el('div', { class: 'qr', role: 'img', 'aria-label': `QR-code naar ${url}` });
  box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  return box;
};

function frame(main, { foot = true } = {}) {
  const s = S;
  const meta = el('div', { class: 'meta' },
    s.q && !s.q.practice && (s.kind === 'question' || s.kind === 'answer') ? el('span', {}, 'Vraag ', el('b', { text: s.q.num }), ` van ${s.q.total}`) : null,
    el('span', {}, el('b', { 'data-bind': 'players', text: s.players }), ' spelers'));
  app.replaceChildren(
    el('header', { class: 'sc-top' }, el('span', { class: 'brand', text: 'Kerstquiz' }), stripes(), meta),
    el('main', { class: 'sc-main' }, main),
    el('footer', { class: 'sc-foot' },
      foot ? el('span', {}, 'Later binnen? Doe mee via ', el('b', { text: joinShort })) : el('span'),
      el('button', { class: 'sound', type: 'button', onclick: toggleSound, text: sound.on ? 'Geluid uit' : 'Geluid aan' })));
}

function toggleSound(e) {
  sound.toggle();
  e.currentTarget.textContent = sound.on ? 'Geluid uit' : 'Geluid aan';
}

function later(ms, fn) { timers.push(setTimeout(fn, Math.max(0, ms))); }

function keyFor(s) {
  return `${s.kind}:${s.step}`;
}

function render() {
  const key = keyFor(S);
  if (key !== viewKey) {
    viewKey = key;
    timers.forEach(clearTimeout); timers = [];
    cancelAnimationFrame(raf);
    document.querySelector('.confetti')?.remove();
    draw();
  } else update();
}

function update() {
  app.querySelectorAll('[data-bind="players"]').forEach((n) => (n.textContent = S.players));
  app.querySelectorAll('[data-bind="answered"]').forEach((n) => (n.textContent = S.answered ?? 0));
  if (S.kind === 'lobby') fillChips(app.querySelector('.chips'), S.names || [], 60);
  if (S.kind === 'signup') updateSignup();
}

function draw() {
  const s = S;
  switch (s.kind) {
    case 'lobby': return drawLobby(s);
    case 'round_intro': return frame(el('div', { class: 'sc-fill intro' }, el('h1', { text: s.label }), stripes(), el('p', { text: s.sub || '' })));
    case 'question': return drawQuestion(s);
    case 'answer': return drawAnswer(s);
    case 'leaderboard': return drawBoard(s);
    case 'acrostic': return drawAcrostic(s);
    case 'podium': return drawPodium(s);
    case 'announce': return drawAnnounce(s);
    case 'signup': return drawSignup(s);
    default: return frame(el('div', { class: 'sc-fill' }, el('h1', { text: 'Even geduld…' })));
  }
}

/* ---------- lobby ---------- */
function fillChips(box, names, max) {
  if (!box) return;
  const have = new Set([...box.children].map((c) => c.dataset.k));
  const list = names.slice(0, max);
  const keys = list.map((n, i) => `${n}#${list.length - i}`);
  if (keys.length === have.size && keys.every((k) => have.has(k))) return;
  box.replaceChildren(...list.map((n, i) => el('span', { dataset: { k: keys[i] }, text: n })));
}

function drawLobby(s) {
  const chips = el('div', { class: 'chips', 'aria-live': 'polite' });
  frame(el('div', { class: 'lobby' },
    el('div', {}, qrSvg(joinUrl), el('p', { class: 'url', text: joinShort })),
    el('div', { class: 'count' },
      el('span', { class: 'big-num', 'data-bind': 'players', text: s.players }),
      el('p', { text: "collega's doen mee. Scan de code en kies een naam." }),
      chips)), { foot: false });
  fillChips(chips, s.names || [], 60);
}

/* ---------- vraag ---------- */
function clock(s) {
  const R = 46, C = 2 * Math.PI * R;
  const ring = el('div', { class: 'clock' });
  ring.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" stroke="#26326F" stroke-width="8"/><circle data-ring cx="50" cy="50" r="${R}" fill="none" stroke="#FFC93C" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`;
  ring.append(el('span', { class: 'big-num', 'data-bind': 'sec', text: Math.ceil(timeLeft(s)) }),
    el('span', { class: 'lbl' }, el('b', { 'data-bind': 'answered', text: s.answered ?? 0 }), ` / `, el('span', { 'data-bind': 'players', text: s.players }), ' geantwoord'));
  ring._C = C;
  return ring;
}

function qHead(s, image, withClock) {
  const q = s.q;
  return el('div', { class: `qhead${image ? ' has-img' : ''}` },
    el('p', { class: 'qt' }, q.practice ? el('small', { text: 'Oefenvraag, telt niet mee' }) : null, q.text),
    image ? el('div', { class: 'qimg' }, el('img', { src: image, alt: '' })) : null,
    withClock ? clock(s) : el('div'));
}

function tiles(q, reveal) {
  const max = reveal ? Math.max(1, ...reveal.dist) : 1;
  return el('div', { class: `tiles${reveal ? ' revealed' : ''}` }, q.options.map((o, i) => {
    const right = reveal && reveal.correct.includes(i);
    const t = el('div', { class: `tile c${i}${reveal ? (right ? ' right' : ' wrong') : ''}` },
      el('span', { class: 'shape', 'aria-hidden': 'true', text: SHAPES[i] }),
      el('span', { text: o }),
      reveal ? el('span', { class: 'cnt', text: reveal.dist[i] }) : el('span'),
      reveal ? el('span', { class: 'bar' }) : null);
    if (reveal) requestAnimationFrame(() => requestAnimationFrame(() => { t.querySelector('.bar').style.width = `${(reveal.dist[i] / max) * 100}%`; }));
    return t;
  }));
}

function drawQuestion(s) {
  const q = s.q;
  const body = q.kind === 'estimate'
    ? el('p', { class: 'est-wait', text: `Typ je schatting op je telefoon${q.unit ? ` (in ${q.unit})` : ''}. Wie er het dichtst bij zit, krijgt de meeste punten.` })
    : tiles(q, null);
  frame(el('div', { class: `qwrap${q.image ? ' has-img' : ''}` }, qHead(s, q.image, true), body));
  lastTickSec = null;
  const ring = app.querySelector('.clock');
  const circle = app.querySelector('[data-ring]');
  const step = () => {
    if (!S || S.kind !== 'question') return;
    const left = timeLeft(S);
    const sec = Math.ceil(left);
    const secEl = app.querySelector('[data-bind="sec"]');
    if (secEl) secEl.textContent = sec;
    if (circle) circle.setAttribute('stroke-dashoffset', String(ring._C * (1 - left / S.q.duration)));
    ring?.classList.toggle('done', left <= 0);
    if (sec !== lastTickSec) {
      if (sec <= 5 && sec > 0) sound.tick();
      if (sec === 0 && lastTickSec !== null) sound.buzz();
      lastTickSec = sec;
    }
    raf = requestAnimationFrame(step);
  };
  step();
}

function drawAnswer(s) {
  const q = s.q, r = s.reveal;
  const image = r.image || q.image;
  let body;
  if (q.kind === 'estimate') {
    body = el('div', { class: 'est' },
      el('div', {}, el('div', { class: 'ans', text: `${q.unit ? q.unit + ' ' : ''}${fmt(r.correct_num)}` })),
      el('div', {},
        el('p', { class: 'muted', text: 'Het dichtst bij:' }),
        el('ol', {}, r.closest.map((c, i) => el('li', {}, el('b', { text: `${i + 1}.` }), `${c.name}: ${q.unit ? q.unit + ' ' : ''}${fmt(c.value)}`))),
        r.avg !== null ? el('p', { class: 'avg', text: `Gemiddelde schatting: ${q.unit ? q.unit + ' ' : ''}${fmt(r.avg)}` }) : null,
        r.explanation ? el('p', { class: 'explain-sc', text: r.explanation }) : null));
  } else {
    body = el('div', {}, tiles(q, r), r.explanation ? el('p', { class: 'explain-sc', text: r.explanation }) : null);
  }
  frame(el('div', { class: `qwrap${image ? ' has-img' : ''}` }, qHead(s, image, false), body));
  sound.ding();
}

/* ---------- stand ---------- */
function drawBoard(s) {
  frame(el('div', { class: 'sc-fill' }, el('div', { class: 'board' },
    el('h2', { text: s.label }),
    s.top.slice(0, 5).map((t) => el('div', { class: 'row' },
      el('span', { class: 'n', text: t.rank }), el('span', { class: 'nm', text: t.name }), el('span', { class: 's', text: fmt(t.score) }))),
    s.top.length === 0 ? el('p', { class: 'muted', text: 'Nog niemand heeft punten.' }) : null)));
}

/* ---------- verborgen woord ---------- */
function drawAcrostic(s) {
  const words = s.words;
  const per = 0.45;
  const listDone = 0.4 + words.length * per;
  frame(el('div', { class: 'acro-sc' },
    el('ol', { class: 'acro-list' }, words.map((w, i) => el('li', { style: `animation-delay:${0.4 + i * per}s` }, el('b', { text: w[0] }), w.slice(1)))),
    el('div', {},
      el('p', { class: 'acro-q', style: `animation-delay:${listDone}s`, text: 'Zag je het al? Lees de eerste letters…' }),
      el('div', { class: 'acro-word', 'aria-label': words.map((w) => w[0]).join('') },
        words.map((w, i) => el('span', { style: `animation-delay:${listDone + 1 + i * 0.18}s`, text: w[0].toUpperCase() }))))));
  later((listDone + 1 + words.length * 0.18) * 1000, () => sound.fanfare(true));
}

/* ---------- podium ---------- */
function drawPodium(s) {
  const [a, b, c] = s.top;
  const pod = (p, cls, n) => el('div', { class: `pod ${cls}` },
    el('span', { class: 'nm', text: p ? p.name : '—' }),
    el('span', { class: 'sc', text: p ? `${fmt(p.score)} punten` : '' }),
    el('div', { class: 'block', text: n }));
  const p1 = pod(a, 'p1', 1), p2 = pod(b, 'p2', 2), p3 = pod(c, 'p3', 3);
  const drum = el('p', { class: 'drum', text: 'En de winnaar van de kerstquiz is…' });
  frame(el('div', { class: 'sc-fill', style: 'position:relative' }, drum, el('div', { class: 'podium' }, p2, p1, p3)), { foot: false });
  const t0 = (s.elapsed || 0) * 1000;
  later(1500 - t0, () => { p3.classList.add('show'); sound.ding(); });
  later(3500 - t0, () => { p2.classList.add('show'); sound.ding(); });
  later(4200 - t0, () => sound.drumroll(3));
  later(7300 - t0, () => { p1.classList.add('show'); drum.textContent = 'Gefeliciteerd!'; sound.fanfare(); confetti(); });
}

/* ---------- onthulling ---------- */
function drawAnnounce(s) {
  const a = s.announce;
  const canvas = el('canvas', { 'aria-hidden': 'true' });
  const poster = el('div', { class: 'poster' },
    el('div', { class: 'kicker', 'aria-label': a.kicker }, [...a.kicker].map((ch, i) => el('span', { style: `animation-delay:${0.2 + i * 0.09}s`, text: ch }))),
    el('div', { class: 'row2' }, el('span', { class: 'yr', text: a.year }), stripes()),
    el('div', { class: 'details' },
      el('p', { class: 'dates', text: a.dates }),
      el('ul', {}, a.lines.map((l) => el('li', { text: l })))),
    el('p', { class: 'cta', text: a.cta }));
  app.replaceChildren(el('div', { class: 'reveal-sc' }, canvas, poster),
    el('button', { class: 'sound', type: 'button', style: 'position:fixed;right:3vw;bottom:1.4vw;background:none;border:0;color:#A9B8F5;text-decoration:underline;cursor:pointer;font-size:1.1vw', onclick: toggleSound, text: sound.on ? 'Geluid uit' : 'Geluid aan' }));
  snow(canvas);
  later(1300, () => sound.fanfare());
}

function snow(canvas) {
  if (reducedMotion()) return;
  const ctx = canvas.getContext('2d');
  const fit = () => { canvas.width = canvas.clientWidth * devicePixelRatio; canvas.height = canvas.clientHeight * devicePixelRatio; };
  fit(); addEventListener('resize', fit);
  const flakes = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.4, v: 0.0006 + Math.random() * 0.0016, w: Math.random() * Math.PI * 2 }));
  const step = () => {
    if (!canvas.isConnected) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(243,246,255,.8)';
    for (const f of flakes) {
      f.y += f.v; f.w += 0.01;
      if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
      ctx.beginPath();
      ctx.arc((f.x + Math.sin(f.w) * 0.01) * W, f.y * H, f.r * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(step);
  };
  step();
}

/* ---------- inschrijving ---------- */
function drawSignup(s) {
  const a = s.announce;
  frame(el('div', { class: 'signup-sc' },
    el('div', {}, qrSvg(joinUrl), el('p', { class: 'url', text: joinShort })),
    el('div', { class: 'left' },
      el('h2', { text: `${a.kicker} ${a.year}` }),
      el('p', { class: 'sub', text: a.dates }),
      el('div', { style: 'display:flex;align-items:baseline;gap:2vw;margin-top:1.4vw' },
        el('span', { class: 'big-num', 'data-bind': 'left', text: '' }),
        el('span', { class: 'sub', 'data-bind': 'leftlbl', text: '' })),
      el('div', { class: 'seatbar', style: `--max:${s.spots.max}` }, Array.from({ length: s.spots.max }, () => el('i'))),
      el('div', { class: 'chips' }),
      el('p', { class: 'wl', 'data-bind': 'wl' }))), { foot: false });
  updateSignup();
}

function updateSignup() {
  const s = S;
  const left = Math.max(0, s.spots.max - s.spots.taken);
  const big = app.querySelector('[data-bind="left"]');
  if (!big) return;
  big.textContent = left === 0 ? 'Vol!' : left;
  big.classList.toggle('full', left === 0);
  app.querySelector('[data-bind="leftlbl"]').textContent = left === 0 ? 'De wachtlijst is open.' : left === 1 ? 'plek over' : 'plekken over';
  app.querySelectorAll('.seatbar i').forEach((n, i) => n.classList.toggle('on', i < s.spots.taken));
  const inNames = (s.signups || []).slice(0, s.spots.max);
  fillChips(app.querySelector('.chips'), inNames.slice().reverse(), 40);
  const wl = Math.max(0, s.spots.taken - s.spots.max);
  app.querySelector('[data-bind="wl"]').textContent = wl ? `${wl} op de wachtlijst` : '';
}

/* ---------- confetti ---------- */
function confetti() {
  if (reducedMotion()) return;
  const c = el('canvas', { class: 'confetti', 'aria-hidden': 'true' });
  document.body.append(c);
  const ctx = c.getContext('2d');
  c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
  const colors = ['#FF3D8B', '#11C5C6', '#FFC93C', '#FF6A2B', '#F3F6FF'];
  const parts = Array.from({ length: 220 }, () => ({
    x: c.width / 2, y: c.height * 0.55, vx: (Math.random() - 0.5) * 26, vy: -10 - Math.random() * 22,
    s: 6 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, col: colors[(Math.random() * colors.length) | 0],
  }));
  let t = 0;
  const step = () => {
    if (!c.isConnected) return;
    t++;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.5; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (t < 400) requestAnimationFrame(step); else c.remove();
  };
  step();
}

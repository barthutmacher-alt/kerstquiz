import { configured, rpc, stateLoop, el, icon, fmt, stripes, timeLeft, setupMissing, reducedMotion } from './core.js';
import { sound } from './sound.js';
import { mountDecor, snowCanvas } from './decor.js';
import { confettiShow } from './confetti.js';

const app = document.getElementById('app');
if (!configured) { setupMissing(app); throw new Error('config ontbreekt'); }

const joinUrl = new URL('.', location.href).href;
const joinShort = joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
let S = null, viewKey = '', raf = 0, timers = [], lastTickSec = null, stopConfetti = null;

mountDecor();
const soundBtn = el('button', { class: 'sound-btn', type: 'button', onclick: () => { sound.toggle(); soundBtn.textContent = sound.on ? 'Geluid uit' : 'Geluid aan'; }, text: 'Geluid aan' });
document.body.append(soundBtn);

stateLoop({
  fetch: () => rpc('get_state', { p_token: null, p_screen: true }),
  onState: (s) => {
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
const joinMini = (cls = 'join-mini') => el('div', { class: cls },
  el('p', {}, el('b', { text: 'Later binnen?' }), 'Scan en doe mee'), qrSvg(joinUrl));

function frame(main, { qr = true } = {}) {
  const s = S;
  const meta = el('div', { class: 'meta' },
    s.q && !s.q.practice && (s.kind === 'question' || s.kind === 'answer') ? el('span', {}, 'Vraag ', el('b', { text: s.q.num }), ` van ${s.q.total}`) : null,
    s.conn && s.conn.open ? el('span', {}, el('b', { 'data-bind': 'guesses', text: s.conn.guesses }), ' gokken op de connectie') : null,
    el('span', {}, el('b', { 'data-bind': 'players', text: s.players }), ' spelers'));
  app.replaceChildren(
    el('header', { class: 'sc-top' }, el('span', { class: 'brand', text: 'Kerstquiz' }), stripes(), meta, qr ? joinMini() : null),
    el('main', { class: 'sc-main' }, main));
}

function later(ms, fn) { timers.push(setTimeout(fn, Math.max(0, ms))); }

function render() {
  const key = `${S.kind}:${S.step}`;
  if (key !== viewKey) {
    viewKey = key;
    timers.forEach(clearTimeout); timers = [];
    cancelAnimationFrame(raf);
    if (stopConfetti) { stopConfetti(); stopConfetti = null; }
    document.querySelector('.searchlights')?.remove();
    snowCanvas.density = S.kind === 'announce' || S.kind === 'signup' ? 220 : S.kind === 'podium' ? 120 : 70;
    draw();
  } else update();
}

function update() {
  app.querySelectorAll('[data-bind="players"]').forEach((n) => (n.textContent = S.players));
  app.querySelectorAll('[data-bind="answered"]').forEach((n) => (n.textContent = S.answered ?? 0));
  app.querySelectorAll('[data-bind="guesses"]').forEach((n) => (n.textContent = S.conn?.guesses ?? 0));
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
    case 'connection': return drawConnCloud(s);
    case 'connection_reveal': return drawConnReveal(s);
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
      chips)), { qr: false });
  fillChips(chips, s.names || [], 60);
}

/* ---------- vraag ---------- */
function clock(s) {
  const R = 46, C = 2 * Math.PI * R;
  const ring = el('div', { class: 'clock' });
  ring.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" stroke="#22525B" stroke-width="8"/><circle data-ring cx="50" cy="50" r="${R}" fill="none" stroke="#F6C445" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`;
  ring.append(el('span', { class: 'big-num', 'data-bind': 'sec', text: Math.ceil(timeLeft(s)) }),
    el('span', { class: 'lbl' }, el('b', { 'data-bind': 'answered', text: s.answered ?? 0 }), ` / `, el('span', { 'data-bind': 'players', text: s.players }), ' geantwoord'));
  ring._C = C;
  return ring;
}

function qHead(s, media, withClock) {
  const q = s.q;
  return el('div', { class: `qhead${media ? ' has-img' : ''}` },
    el('p', { class: 'qt' }, q.practice ? el('small', { text: 'Oefenvraag, telt niet mee' }) : null, q.text),
    media ? el('div', { class: 'qimg' }, media) : null,
    withClock ? clock(s) : el('div'));
}

/* Beeld bij de vraag: foto, of een filmpje dat tijdens de vraag bevriest en bij het antwoord doorspeelt */
function media(s, phase) {
  const q = s.q;
  if (q.video) return videoEl(q, phase, s);
  const image = phase === 'answer' ? (s.reveal.image || q.image) : q.image;
  return image ? el('img', { src: image, alt: '' }) : null;
}

function videoEl(q, phase, s) {
  const poster = q.video.replace(/=m\d+$/, '=w1600-h1200');
  const at = Number(q.video_at || 0);
  const v = el('video', { playsinline: true, preload: 'auto', poster });
  v.muted = !sound.on;
  v.addEventListener('error', () => v.replaceWith(el('img', { src: poster, alt: '' })), { once: true });
  const play = () => v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  v.addEventListener('loadedmetadata', () => {
    if (phase === 'question') {
      // Scherm net herladen midden in de vraag? Dan meteen het bevroren beeld.
      if ((s.elapsed || 0) > at + 1.5) { v.currentTime = at; return; }
      play();
      const watch = () => {
        if (!v.isConnected) return;
        if (v.currentTime >= at) { v.pause(); v.currentTime = at; return; }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    } else {
      v.addEventListener('seeked', play, { once: true });
      v.currentTime = at;
    }
  }, { once: true });
  v.src = q.video;
  return v;
}

function tiles(q, reveal) {
  const max = reveal ? Math.max(1, ...reveal.dist) : 1;
  return el('div', { class: `tiles${reveal ? ' revealed' : ''}` }, q.options.map((o, i) => {
    const right = reveal && reveal.correct.includes(i);
    const t = el('div', { class: `tile c${i}${reveal ? (right ? ' right' : ' wrong') : ''}` },
      icon(i),
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
  const m = media(s, 'question');
  frame(el('div', { class: `qwrap${m ? ' has-img' : ''}` }, qHead(s, m, true), body));
  if ((s.elapsed || 0) < 2) sound.whoosh();
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
  const m = media(s, 'answer');
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
  frame(el('div', { class: `qwrap${m ? ' has-img' : ''}` }, qHead(s, m, false), body));
  sound.ding();
}

/* ---------- stand ---------- */
function drawBoard(s) {
  frame(el('div', { class: 'sc-fill' }, el('div', { class: 'board' },
    el('h2', { text: s.label }),
    s.top.slice(0, 5).map((t) => el('div', { class: 'row' },
      el('span', { class: 'n', text: t.rank }), el('span', { class: 'nm', text: t.name }), el('span', { class: 's', text: fmt(t.score) }))),
    s.top.length === 0 ? el('p', { class: 'muted', text: 'Nog niemand heeft punten.' }) : null)));
  sound.podiumStep();
}

/* ---------- de connectie van ronde 1 ---------- */
// Vaste plekken rond het midden (x%, y%). De langste woorden krijgen de plekken boven en onder.
const SPOTS = [[50, 11], [50, 80], [19, 13], [81, 13], [21, 79], [79, 79], [11, 37], [89, 37], [11, 59], [89, 59]];
const TILT = [-1.5, 1, 1.5, -1, -.8, 1.8, .8, -1.8, 1.2, -.8];
const SIZE = [1.08, 1, .96, 1.05, .98, 1.02, .95, 1, 1.06, .97];

function placeWords(words) {
  const order = words.map((w, i) => i).sort((a, b) => words[b].word.length - words[a].word.length);
  const spotOf = [];
  order.forEach((wi, k) => { spotOf[wi] = SPOTS[k]; });
  return words.map((w, i) => ({ ...w, i, x: spotOf[i][0], y: spotOf[i][1] }));
}

function drawConnCloud(s) {
  const placed = placeWords(s.words);
  frame(el('div', { class: 'conn-sc' },
    placed.map((w) => el('div', { class: 'cw', style: `left:${w.x}%;top:${w.y}%;--tilt:${TILT[w.i]}deg;--sz:${SIZE[w.i]};animation-delay:${0.3 + w.i * 0.32}s` },
      el('span', { class: 'word', text: w.word }))),
    el('div', { class: 'conn-mid ask' },
      el('p', { class: 'q', text: 'Wat verbindt deze tien antwoorden?' }),
      el('p', { class: 'sub' }, 'Laatste kans op je telefoon, nog 100 punten. ', el('b', { 'data-bind': 'guesses', text: s.conn ? s.conn.guesses : 0 }), ' gokken tot nu toe.'))));
  sound.whoosh();
}

function drawConnReveal(s) {
  const placed = placeWords(s.words);
  const step = reducedMotion() ? 0.05 : 0.7;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'conn-lines');
  svg.setAttribute('aria-hidden', 'true');
  placed.forEach((w, k) => {
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', w.x); ln.setAttribute('y1', w.y); ln.setAttribute('x2', 50); ln.setAttribute('y2', 50);
    ln.setAttribute('pathLength', '1');
    ln.setAttribute('style', `animation-delay:${0.4 + k * step}s`);
    svg.append(ln);
  });
  const ans = (s.answer || '').toUpperCase();
  const done = 0.4 + placed.length * step + 0.3;      // trap 1: het woord valt
  const stage2 = done + 3.6;                          // trap 2: de snelste drie vallen in
  const cs = s.conn_stats || {};
  const top = cs.top || [];
  const when = (q) => (q === 0 ? 'nog vóór vraag 1' : q > 10 ? 'bij de woordwolk' : `bij vraag ${q}`);
  const board = el('section', { class: 'conn-top', 'aria-live': 'polite' },
    el('h2', { text: top.length ? 'Het snelst gezien' : 'Niemand zag het' }),
    top.length
      ? el('ol', {}, top.map((t, i) => el('li', { class: `r${i + 1}`, style: `animation-delay:${0.5 + (top.length - 1 - i) * 0.55}s` },
          el('span', { class: 'n', text: i + 1 }),
          el('span', { class: 'nm', text: t.name }),
          el('span', { class: 'at', text: when(t.at_q) }),
          el('span', { class: 'b', text: `+${fmt(t.bonus)}` }))))
      : el('p', { class: 'none', text: 'Dan was het een goede ronde.' }),
    el('p', { class: 'foot', text: `${cs.right || 0} van de ${cs.guessed || 0} gokkers hadden het goed.` }));
  const sc = el('div', { class: 'conn-sc reveal' }, svg,
    placed.map((w, k) => el('div', { class: 'cw shown', style: `left:${w.x}%;top:${w.y}%;--tilt:${TILT[w.i]}deg;--sz:${SIZE[w.i]}` },
      el('span', { class: 'word', text: w.word }),
      w.link ? el('span', { class: 'link', style: `animation-delay:${0.6 + k * step}s`, text: w.link }) : null)),
    el('div', { class: 'conn-mid' },
      el('div', { class: 'conn-word', 'aria-label': ans }, [...ans].map((ch, i) => el('span', { style: `animation-delay:${done + i * 0.08}s`, text: ch })))),
    board);
  frame(sc, { qr: false });
  const t0 = (s.elapsed || 0) * 1000;
  placed.forEach((w, k) => later((0.6 + k * step) * 1000 - t0, () => sound.tick()));
  later(done * 1000 - t0, () => { sound.reveal(); searchlights(); });
  later(stage2 * 1000 - t0, () => { sc.classList.add('stage2'); sound.whoosh(); });
  top.forEach((t, i) => later((stage2 + 0.5 + (top.length - 1 - i) * 0.55) * 1000 - t0, () => sound.podiumStep()));
}

/* Zoeklichten die vanachter de bergen de lucht in zwaaien (in plaats van confetti) */
function searchlights() {
  if (document.querySelector('.searchlights')) return;
  const box = el('div', { class: 'searchlights', 'aria-hidden': 'true' },
    [12, 33, 67, 88].map((x, i) => el('i', { style: `left:${x}%;--d:${6 + i * 1.3}s;--from:${i % 2 ? 24 : -24}deg;--to:${i % 2 ? -14 : 14}deg;animation-delay:${i * -1.7}s` })));
  const hills = document.querySelector('.mountains');
  if (hills) hills.before(box); else document.body.prepend(box);
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
  frame(el('div', { class: 'sc-fill', style: 'position:relative' }, drum, el('div', { class: 'podium' }, p2, p1, p3)), { qr: false });
  const t0 = (s.elapsed || 0) * 1000;
  later(1500 - t0, () => { p3.classList.add('show'); sound.podiumStep(); });
  later(3500 - t0, () => { p2.classList.add('show'); sound.podiumStep(); });
  later(4200 - t0, () => sound.drumroll(3));
  later(7300 - t0, () => {
    p1.classList.add('show');
    drum.textContent = 'Gefeliciteerd!';
    sound.fanfare();
    stopConfetti = confettiShow({ duration: 5000, bursts: [0, 700, 1500], amount: 0.65 });
  });
}

/* ---------- de grote onthulling ---------- */
function drawAnnounce(s) {
  const a = s.announce;
  const poster = el('div', { class: 'poster' },
    el('div', { class: 'kicker', 'aria-label': a.kicker }, [...a.kicker].map((ch, i) => el('span', { style: `animation-delay:${0.2 + i * 0.09}s`, text: ch }))),
    el('div', { class: 'row2' }, el('span', { class: 'yr', text: a.year }), stripes(), a.edition ? el('span', { class: 'ed', text: a.edition }) : null),
    el('div', { class: 'details' },
      el('p', { class: 'dates', text: a.dates }),
      el('ul', {}, a.lines.map((l) => el('li', { text: l })))),
    el('div', { class: 'cta-row' }, el('p', { class: 'cta', text: a.cta }), el('div', { class: 'sticker tape full', text: a.full_sticker || 'Vol = vol!' })),
    el('div', { class: 'sticker round spots' }, el('small', { text: 'max.' }), el('b', { text: s.spots ? s.spots.max : 29 }), el('small', { text: 'plekken' })));
  app.replaceChildren(el('div', { class: 'reveal-sc' }, poster), joinMini('corner-qr'));
  const t0 = (s.elapsed || 0) * 1000;
  later(1300 - t0, () => { sound.jingle(); stopConfetti = confettiShow({ duration: 5000, bursts: [0, 800, 1700], amount: 0.65 }); });
  later(3600 - t0, () => sound.podiumStep());
  later(4300 - t0, () => sound.podiumStep());
}

/* ---------- inschrijving ---------- */
function drawSignup(s) {
  const a = s.announce;
  frame(el('div', { class: 'signup-sc' },
    el('div', { class: 'qcol' }, qrSvg(joinUrl), el('p', { class: 'scan', text: 'Scan voor inschrijving!' })),
    el('div', { class: 'left' },
      el('h2', { text: `${a.kicker} ${a.year}` }),
      el('p', { class: 'sub', text: a.dates }),
      el('p', { class: 'rule', text: 'Je plek is definitief zodra je de aanbetaling hebt betaald.' }),

      el('div', { class: 'leftrow' },
        el('span', { class: 'big-num', 'data-bind': 'left', text: '' }),
        el('span', { class: 'sub', 'data-bind': 'leftlbl', text: '' })),
      el('div', { class: 'seatbar', style: `--max:${s.spots.max}` }, Array.from({ length: s.spots.max }, () => el('i'))),
      el('div', { class: 'chips' }),
      el('p', { class: 'wl', 'data-bind': 'wl' })),
    el('div', { class: 'slidecol' }, slideshow(),
      a.deposit ? el('div', { class: 'sticker tape deposit' }, el('small', { text: 'Aanbetaling' }), el('b', { text: a.deposit })) : null)), { qr: false });
  updateSignup();
}

/* Diavoorstelling met alle foto's uit het album, in willekeurige volgorde */
let slideList = null;
async function loadSlides() {
  if (slideList) return slideList;
  try {
    const list = await rpc('get_slides');
    slideList = list.map((t) => `https://lh3.googleusercontent.com/pw/${t}=w1280-h960`);
    for (let i = slideList.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [slideList[i], slideList[j]] = [slideList[j], slideList[i]]; }
  } catch { slideList = []; }
  return slideList;
}
function slideshow() {
  const a = el('img', { alt: '' }), b = el('img', { alt: '' });
  const box = el('figure', { class: 'slides' }, el('div', { class: 'frame' }, a, b),
    el('figcaption', { text: 'Uit het archief: Winterberg 2019 tot 2026' }));
  let n = 0, front = a, back = b, misses = 0;
  const next = (list) => {
    if (!box.isConnected || !list.length || misses > 8) return;
    const url = list[n++ % list.length];
    back.onload = () => {
      misses = 0;
      back.classList.add('on'); front.classList.remove('on');
      [front, back] = [back, front];
      later(5200, () => next(list));
    };
    back.onerror = () => { misses++; later(200, () => next(list)); };
    back.src = url;
  };
  loadSlides().then((list) => { box.hidden = !list.length; next(list); });
  return box;
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

import { configured, rpc, stateLoop, el, SHAPES, icon, fmt, imgSize, stripes, store, timeLeft, setupMissing } from './core.js';

const app = document.getElementById('app');
if (!configured) { setupMissing(app); throw new Error('config ontbreekt'); }

let token = store('wb.token');
let S = null;              // laatste stand
let viewKey = '';
let local = null;          // { q, choice?, value? } antwoord dat net verstuurd is
let timeUpShown = false;
let goneNote = false;
let payNote = false;       // "betalen lukte nog niet" net aangetikt
let raf = 0;

const loop = stateLoop({
  fetch: () => rpc('get_state', { p_token: token || null }),
  onState: (s, err) => {
    if (err && !s) return renderOffline();
    S = s;
    render();
  },
  intervalFor: (s) => {
    if (!s) return 3000;
    if (s.kind === 'question') return 3000;
    return 4000;
  },
});

/* ---------- helpers ---------- */
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast', role: 'status', text: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 3800);
}
function top(s) {
  const me = s?.me;
  return [
    el('header', { class: 'ph-top' },
      el('span', { class: 'who', text: me ? me.name : 'Kerstquiz' }),
      me ? el('span', { class: 'pts', 'data-bind': 'score', text: `${fmt(me.score)} pt` }) : null),
    stripes(),
  ];
}
function screen(s, ...main) {
  app.replaceChildren(...top(s), el('main', { class: 'ph-main' }, ...main));
}
const center = (...kids) => el('div', { class: 'ph-center' }, ...kids);
const playersText = (n) => (n === 1 ? '1 collega doet mee' : `${n} collega's doen mee`);
const playersLine = (s) => el('p', { class: 'muted', 'data-bind': 'players', text: playersText(s.players) });

function keyFor(s) {
  if (!token) return `join:${s?.kind === 'signup' ? 'signup' : 'quiz'}`;
  if (!s.me) return 'gone';
  const k = s.kind;
  if (k === 'question') {
    const answered = !!s.me.answer || (local && local.q === s.q.idx);
    return `q:${s.step}:${answered ? 1 : 0}`;
  }
  if (k === 'signup') {
    const su = s.me.signup;
    return `s:${su ? su.status + su.pos + (su.paid ? 'p' : '') + (su.paid_self ? 'z' : '') : 'no'}:${s.spots.taken >= s.spots.max ? 'full' : 'open'}:${JSON.stringify(s.me.links || null)}:${store('wb.payclicked') || ''}${payNote ? 'n' : ''}`;
  }
  if (k === 'connection_reveal') return `cr:${s.step}:${JSON.stringify(s.me.conn || null)}`;
  return `${k}:${s.step}`;
}

/* ---------- render ---------- */
function render() {
  if (token && S && !S.me) {
    // speler bestaat niet meer (verwijderd of quiz opnieuw gestart)
    token = store('wb.token', null);
    goneNote = true;
  }
  const key = keyFor(S);
  if (key !== viewKey) {
    viewKey = key;
    timeUpShown = false;
    cancelAnimationFrame(raf);
    draw();
  } else update();
  updateConn();
}

function update() {
  if (!S) return;
  app.querySelectorAll('[data-bind="players"]').forEach((n) => (n.textContent = playersText(S.players)));
  if (S.me) app.querySelectorAll('[data-bind="score"]').forEach((n) => (n.textContent = `${fmt(S.me.score)} pt`));
  if (S.spots) {
    const left = Math.max(0, S.spots.max - S.spots.taken);
    app.querySelectorAll('[data-bind="left"]').forEach((n) => (n.textContent = left));
    app.querySelectorAll('.seatbar i').forEach((n, i) => n.classList.toggle('on', i < S.spots.taken));
  }
}

function draw() {
  const s = S;
  if (!token) return s?.kind === 'signup' ? drawSignup(s) : drawJoin(s);
  switch (s.kind) {
    case 'lobby': return screen(s, center(
      el('h1', { class: 'ph-title', text: 'Je doet mee!' }),
      el('p', { class: 'ph-lead', text: 'Kijk naar het grote scherm, we beginnen zo.' }),
      playersLine(s)));
    case 'round_intro': return screen(s, center(
      el('h1', { class: 'ph-title', text: s.label }),
      el('p', { class: 'ph-lead', text: s.sub || '' })));
    case 'question': return drawQuestion(s);
    case 'answer': return drawAnswer(s);
    case 'leaderboard': return drawBoard(s);
    case 'connection': return drawConnCloud(s);
    case 'connection_reveal': return drawConnReveal(s);
    case 'podium': return drawPodium(s);
    case 'announce': return drawAnnounce(s);
    case 'signup': return drawSignup(s);
    default: return screen(s, center(el('p', { text: 'Even geduld…' })));
  }
}

function renderOffline() {
  if (app.querySelector('[data-offline]')) return;
  app.replaceChildren(el('main', { class: 'ph-main', 'data-offline': '' }, center(
    el('h1', { class: 'ph-title', text: 'Verbinden…' }),
    el('p', { class: 'muted', text: 'Geen verbinding met de quiz. Controleer je wifi of 4G; dit scherm probeert het vanzelf opnieuw.' }))));
  viewKey = 'offline';
}

/* ---------- meedoen ---------- */
function drawJoin(s) {
  const input = el('input', { id: 'nm', name: 'nm', maxlength: 24, autocomplete: 'nickname', enterkeyhint: 'go', required: true, value: store('wb.name') || '' });
  const btn = el('button', { class: 'btn', type: 'submit', text: 'Doe mee' });
  const form = el('form', { class: 'field', onsubmit: async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return input.focus();
    btn.disabled = true;
    try {
      const r = await rpc('join_game', { p_name: name });
      token = store('wb.token', r.token);
      store('wb.name', name);
      goneNote = false;
      viewKey = '';
      loop.refresh();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  } }, el('label', { for: 'nm', text: 'Hoe heet je?' }), input, btn);

  app.replaceChildren(el('main', { class: 'ph-main' },
    el('div', { class: 'ph-hero' }, el('h1', { text: 'Kerstquiz' }), stripes()),
    goneNote ? el('p', { text: 'Je speelt niet meer mee: de quiz is opnieuw gestart of je naam is weggehaald. Kies een (nieuwe) naam om mee te doen.' }) : null,
    el('p', { class: 'ph-lead', text: 'Twintig vragen, één winnaar. Hoe sneller je het goede antwoord geeft, hoe meer punten.' }),
    form,
    el('p', { class: 'muted', text: 'Een bijnaam mag. De quizmaster kan namen weghalen.' })));
  if (!input.value) setTimeout(() => input.focus(), 200);
}

/* ---------- vraag ---------- */
function drawQuestion(s) {
  const q = s.q;
  const mine = s.me.answer || (local && local.q === q.idx ? local : null);
  const meta = el('div', { class: 'q-meta' },
    el('span', { text: q.practice ? 'Oefenvraag' : `Vraag ${q.num} van ${q.total}` }),
    el('span', { class: 'sec', 'data-bind': 'sec', text: Math.ceil(timeLeft(s)) }));
  const bar = el('div', { class: 'timebar' }, el('div', { 'data-bind': 'bar' }));
  const kids = [meta, bar, el('p', { class: 'q-text', text: q.text })];
  if (q.image) kids.push(el('img', { class: 'q-img', src: imgSize(q.image, 900), alt: '', loading: 'eager' }));
  if (q.video) kids.push(el('p', { class: 'look-up', text: 'Kijk naar het filmpje op het grote scherm.' }));

  if (q.kind === 'estimate') {
    if (mine) kids.push(waitBox(`Jouw schatting: ${q.unit ? q.unit + ' ' : ''}${fmt(mine.value)}`));
    else {
      const inp = el('input', { id: 'est', type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder: '0', required: true });
      const btn = el('button', { class: 'btn', type: 'submit', text: 'Verstuur schatting' });
      kids.push(el('form', { class: 'field', 'data-answer': '', onsubmit: (e) => {
        e.preventDefault();
        const v = parseFloat(String(inp.value).replace(',', '.'));
        if (!Number.isFinite(v)) return inp.focus();
        send(q.idx, { value: v });
      } }, el('label', { for: 'est', text: 'Jouw schatting' }),
        el('div', { class: 'estimate' }, q.unit ? el('span', { class: 'unit', text: q.unit }) : null, inp), btn));
    }
  } else {
    const opts = el('div', { class: `opts${mine ? ' locked' : ''}`, 'data-answer': '' },
      q.options.map((o, i) => el('button', {
        class: `opt c${i}${mine && mine.choice === i ? ' chosen' : ''}`, type: 'button', disabled: !!mine,
        'aria-label': `${SHAPES[i]}: ${o}`,
        onclick: () => send(q.idx, { choice: i }),
      }, icon(i), el('span', { text: o }))));
    kids.push(opts);
    if (mine) kids.push(waitBox('Antwoord binnen. Wacht op de rest…'));
  }
  screen(s, ...kids);
  tick();
}

function waitBox(text) {
  return el('p', { class: 'waiting', role: 'status' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), text);
}

function tick() {
  cancelAnimationFrame(raf);
  const step = () => {
    if (!S || S.kind !== 'question') return;
    const left = timeLeft(S);
    const sec = app.querySelector('[data-bind="sec"]');
    const bar = app.querySelector('[data-bind="bar"]');
    if (sec) sec.textContent = Math.ceil(left);
    if (bar) bar.style.transform = `scaleX(${S.q.duration ? left / S.q.duration : 0})`;
    const answered = !!S.me?.answer || (local && local.q === S.q.idx);
    if (left <= 0 && !answered && !timeUpShown) {
      timeUpShown = true;
      const box = app.querySelector('[data-answer]');
      if (box) box.replaceWith(el('p', { class: 'ph-lead', role: 'status', text: 'Tijd is om! Kijk naar het grote scherm.' }));
    }
    raf = requestAnimationFrame(step);
  };
  step();
}

async function send(qIdx, payload) {
  if (local && local.q === qIdx) return;
  local = { q: qIdx, ...payload };
  viewKey = '';
  render();
  if (navigator.vibrate) navigator.vibrate(30);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await rpc('submit_answer', { p_token: token, p_q: qIdx, p_choice: payload.choice ?? null, p_value: payload.value ?? null });
      if (!r.ok && r.reason !== 'Je had al geantwoord') toast(r.reason);
      return;
    } catch (e) {
      if (attempt === 2) {
        local = null; viewKey = ''; render();
        toast('Versturen lukte niet. Probeer het nog een keer.');
      } else await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
  }
}

/* ---------- antwoord ---------- */
function drawAnswer(s) {
  const q = s.q, r = s.reveal, me = s.me;
  const ans = me.answer;
  const pts = me.points || 0;
  let cls, title;
  if (!ans) { cls = 'none'; title = 'Geen antwoord'; }
  else if (q.kind === 'estimate') { cls = pts > 0 ? 'good' : 'bad'; title = pts >= 900 ? 'Raak!' : pts > 0 ? 'In de buurt' : 'Ver mis'; }
  else if (r.correct.includes(ans.choice)) { cls = 'good'; title = 'Goed!'; }
  else { cls = 'bad'; title = 'Helaas'; }

  const correctText = q.kind === 'estimate'
    ? `Het antwoord: ${q.unit ? q.unit + ' ' : ''}${fmt(r.correct_num)}${ans ? ` · jij zei ${fmt(ans.value)}` : ''}`
    : r.correct.length === q.options.length ? 'Alle antwoorden waren goed.' : `Goed antwoord: ${r.correct.map((i) => q.options[i]).join(' / ')}`;

  screen(s,
    el('section', { class: `verdict ${cls}` },
      el('h1', { text: title }),
      q.practice ? el('p', { text: 'Oefenvraag, telt niet mee.' }) : el('span', { class: 'plus', text: `+${fmt(pts)}` })),
    cls !== 'good' || q.kind === 'estimate' ? el('p', { class: 'correct-was', text: correctText }) : null,
    r.explanation ? el('p', { class: 'explain', text: r.explanation }) : null,
    r.image ? el('img', { class: 'q-img', src: imgSize(r.image, 900), alt: '' }) : null,
    q.practice ? null : el('p', { class: 'muted', text: `Totaal ${fmt(me.score)} punten, plek ${me.rank} van ${s.players}` }));
  local = null;
}

/* ---------- stand ---------- */
function drawBoard(s) {
  screen(s,
    el('section', { class: 'rankcard' },
      el('p', { class: 'muted', text: s.label }),
      el('span', { class: 'big-num', text: `${s.me.rank}e` }),
      el('p', { class: 'ph-lead', text: `van ${s.players}, met ${fmt(s.me.score)} punten` })),
    topList(s.top.slice(0, 5), s.me));
}
function topList(list, me) {
  return el('ol', { class: 'toplist' }, list.map((t) => el('li', { class: me && t.name === me.name && t.score === me.score ? 'me' : '' },
    el('span', { class: 'n', text: t.rank }), el('span', { class: 'nm', text: t.name }), el('span', { class: 's', text: fmt(t.score) }))));
}

/* ---------- connectie van ronde 1 ---------- */
function drawConnCloud(s) {
  screen(s, center(
    el('h1', { class: 'ph-title', text: 'Zie jij de connectie?' }),
    el('p', { class: 'ph-lead', text: 'Wat verbindt deze tien antwoorden?' }),
    el('ul', { class: 'conn-words' }, s.words.map((w) => el('li', { text: w.word })))));
}

function drawConnReveal(s) {
  const mine = s.me.conn;
  const ans = s.answer || '';
  let cls, title, sub;
  if (mine && mine.correct) {
    cls = 'good'; title = 'Goed gezien!';
    sub = mine.at_q === 0 ? `Je wist het al vóór de eerste vraag. Knap.` : mine.at_q > 10 ? `Op het nippertje, bij de woordwolk.` : `Je had het al bij vraag ${mine.at_q}.`;
  } else if (mine) {
    cls = 'bad'; title = 'Helaas';
    sub = `Je gokte ‘${mine.guess}’. Het was ${ans}.`;
  } else {
    cls = 'none'; title = ans;
    sub = 'Je hebt niet gegokt. Volgende keer durven!';
  }
  screen(s,
    el('section', { class: `verdict ${cls}` },
      el('h1', { text: title }),
      mine && mine.correct ? el('span', { class: 'plus', text: `+${fmt(mine.bonus)} bonus` }) : null),
    el('p', { class: 'correct-was', text: sub }),
    el('p', { class: 'muted', text: `Kijk op het grote scherm hoe alle tien antwoorden met ${ans} te maken hebben.` }));
}

const conn = { bar: null, sheet: null, draft: '', sending: false };
function updateConn() {
  const s = S;
  const show = !!(token && s && s.me && s.conn && s.conn.open);
  document.body.classList.toggle('has-conn', show);
  if (!show) {
    conn.bar?.remove(); conn.bar = null;
    closeSheet();
    return;
  }
  if (!conn.bar) {
    conn.bar = el('div', { class: 'conn-bar' });
    document.body.append(conn.bar);
  }
  const mine = s.me.conn;
  const key = mine ? `g:${mine.guess}:${mine.at_q}:${s.kind === 'connection'}` : `w:${s.conn.worth}`;
  if (conn.sheet) updateSheetWorth();
  if (conn.bar.dataset.k === key) return;
  conn.bar.dataset.k = key;
  if (mine) {
    const when = mine.at_q === 0 ? 'nog vóór de eerste vraag' : mine.at_q > 10 ? 'bij de woordwolk' : `bij vraag ${mine.at_q}`;
    conn.bar.replaceChildren(el('div', { class: 'conn-mine', role: 'status' },
      el('span', {}, 'Jouw connectie: ', el('b', { text: mine.guess })),
      el('small', { text: `Gegokt ${when}. ${s.kind === 'connection' ? 'De onthulling komt zo.' : 'Na vraag 10 hoor je of je gelijk had.'}` })));
    closeSheet();
  } else {
    conn.bar.replaceChildren(el('button', { class: 'conn-btn', type: 'button', onclick: openSheet },
      el('span', { text: 'Ik weet de connectie!' }),
      el('small', { text: `Nu ${fmt(s.conn.worth)} punten waard` })));
  }
}

function updateSheetWorth() {
  const n = conn.sheet?.querySelector('[data-bind="worth"]');
  if (!n || !S?.conn) return;
  n.textContent = S.kind === 'connection'
    ? 'Laatste kans: een goede gok is nu nog 100 punten waard.'
    : `Een goede gok is nu ${fmt(S.conn.worth)} punten waard. Na elke vraag wordt dat 200 minder.`;
}

function openSheet() {
  if (conn.sheet) return;
  const input = el('input', { id: 'cg', maxlength: 40, autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'send', required: true, value: conn.draft, oninput: (e) => (conn.draft = e.target.value) });
  const btn = el('button', { class: 'btn', type: 'submit', text: 'Leg mijn gok vast' });
  const form = el('form', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cg-t', onsubmit: async (e) => {
    e.preventDefault();
    const guess = input.value.trim();
    if (guess.length < 2) return input.focus();
    if (conn.sending) return;
    conn.sending = true; btn.disabled = true;
    try {
      const r = await rpc('guess_connection', { p_token: token, p_guess: guess });
      if (r.ok) { conn.draft = ''; closeSheet(); toast('Je gok staat vast. Na vraag 10 weet je meer.'); }
      else { toast(r.reason); closeSheet(); }
      loop.refresh();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
    conn.sending = false;
  } },
    el('h2', { id: 'cg-t', text: 'Wat is de connectie?' }),
    el('p', { text: 'Wat verbindt de goede antwoorden van deze ronde? Je hebt één gok. Of je gelijk hebt, hoor je pas na vraag 10.' }),
    el('div', { class: 'field' }, el('label', { for: 'cg', text: 'Jouw gok' }), input),
    el('p', { class: 'muted', 'data-bind': 'worth' }),
    btn,
    el('button', { class: 'btn ghost', type: 'button', onclick: closeSheet, text: 'Toch nog niet' }));
  conn.sheet = el('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === conn.sheet) closeSheet(); } }, form);
  conn.sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  document.body.append(conn.sheet);
  updateSheetWorth();
  setTimeout(() => input.focus(), 60);
}
function closeSheet() {
  if (!conn.sheet) return;
  conn.sheet.remove(); conn.sheet = null;
  conn.bar?.querySelector('button')?.focus();
}

function drawPodium(s) {
  const r = s.me.rank;
  const msg = r === 1 ? 'Je hebt gewonnen!' : r <= 3 ? `Je staat op het podium: ${r}e!` : `Je bent ${r}e geworden`;
  screen(s, center(
    el('h1', { class: 'ph-title', text: msg }),
    el('p', { class: 'ph-lead', text: `${fmt(s.me.score)} punten, van de ${s.players} spelers.` }),
    el('p', { class: 'muted', text: 'Kijk naar het grote scherm voor de winnaar.' })));
}

/* ---------- onthulling & inschrijven ---------- */
function posterBits(a) {
  return el('section', { class: 'mini-poster' },
    a.edition ? el('p', { class: 'ed', text: a.edition }) : null,
    el('h1', { text: a.kicker }), el('div', { class: 'yr', text: a.year }),
    el('p', { class: 'dates', text: a.dates }),
    el('ul', {}, a.lines.map((l) => el('li', { text: l }))));
}

function drawAnnounce(s) {
  screen(s, posterBits(s.announce), el('p', { class: 'ph-lead', text: 'De inschrijving gaat zo open. Houd je telefoon bij de hand.' }));
}

function spotsBox(s) {
  const left = Math.max(0, s.spots.max - s.spots.taken);
  return el('section', { class: 'spots' },
    el('div', { class: 'row' }, el('span', { class: 'big-num', 'data-bind': 'left', text: left }), el('span', { class: 'ph-lead', text: `van de ${s.spots.max} plekken nog vrij` })),
    el('div', { class: 'seatbar', style: `--max:${s.spots.max}` }, Array.from({ length: s.spots.max }, (_, i) => el('i', { class: i < s.spots.taken ? 'on' : '' }))));
}

function termsBox(a = S?.announce || {}) {
  return el('section', { class: 'terms' },
    el('b', { text: a.terms_title || 'Betaald is definitief' }),
    el('p', { text: a.terms || 'Je plek is pas zeker als je hebt betaald. Kun je daarna toch niet mee? Dan ben je ongeveer € 100 kwijt, tenzij een collega van de wachtlijst je plek overneemt.' }));
}

function drawSignup(s) {
  const su = s.me?.signup;
  if (su) return drawPass(s, su);
  const full = s.spots.taken >= s.spots.max;
  const nameIn = el('input', { id: 'fn', maxlength: 60, autocomplete: 'name', required: true, placeholder: 'Voor- en achternaam' });
  const btn = el('button', { class: 'btn pink', type: 'submit', text: full ? 'Zet me op de wachtlijst' : 'Reserveer mijn plek' });
  const form = el('form', { class: 'field', style: 'gap:14px', onsubmit: async (e) => {
    e.preventDefault();
    const name = nameIn.value.trim();
    if (name.length < 2 || !name.includes(' ')) { toast('Vul je voor- én achternaam in.'); return nameIn.focus(); }
    btn.disabled = true;
    try {
      if (!token) {
        const r = await rpc('join_game', { p_name: name.slice(0, 24) });
        token = store('wb.token', r.token);
      }
      await rpc('sign_up', { p_token: token, p_full_name: name });
      viewKey = '';
      loop.refresh();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  } },
    el('div', { class: 'field' }, el('label', { for: 'fn', text: 'Je naam voor de deelnemerslijst' }), nameIn),
    termsBox(),
    btn);

  const kids = [posterBits(s.announce), spotsBox(s)];
  if (full) kids.push(el('p', { text: 'Alle plekken zijn bezet. Schrijf je in voor de wachtlijst: valt er iemand af, dan schuif je automatisch door.' }));
  kids.push(form);
  if (token) screen(s, ...kids);
  else app.replaceChildren(el('main', { class: 'ph-main' }, ...kids));
  if (s.me?.name && s.me.name.includes(' ')) nameIn.value = s.me.name;
}

function drawPass(s, su) {
  const isIn = su.status === 'in';
  const paid = !!su.paid;
  const L = s.me.links || {};
  const link = (url, label, sub) => url
    ? el('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, label)
    : el('button', { class: 'btn ghost', disabled: true }, label, el('small', { text: sub }));
  const statusText = paid ? 'Betaald, je plek is definitief' : isIn ? 'Gereserveerd, nog niet betaald' : 'Op de wachtlijst';
  const pass = el('section', { class: `pass${isIn || paid ? '' : ' wait'}${paid ? ' paid' : ''}` },
    stripes(),
    el('div', { class: 'pass-body' },
      el('div', { class: 'pass-head' },
        el('h2', {}, `Skipas`, el('br'), `${s.announce.kicker} ${s.announce.year}`),
        el('div', { class: 'plek' }, el('span', { class: 'big-num', text: isIn ? su.pos : `#${su.pos - s.spots.max}` }), isIn ? 'plek' : 'wachtlijst')),
      el('p', { class: 'pass-name', text: su.full_name }),
      el('div', { class: 'pass-grid' },
        el('span', {}, 'Wanneer', el('b', { text: s.announce.dates })),
        el('span', {}, 'Status', el('b', { class: 'pass-status', text: statusText }))),
      el('div', { class: 'pass-code', 'aria-hidden': 'true' })),
    paid ? el('span', { class: 'stamp', 'aria-hidden': 'true', text: 'Betaald' }) : null);

  const kids = [];
  if (paid) {
    kids.push(el('h1', { class: 'ph-title', text: 'Je gaat mee!' }), pass,
      el('p', { text: 'Doe nu mee in de app-groep en houd de kosten bij in WieBetaaltWat:' }),
      el('div', { class: 'links' },
        link(L.whatsapp, 'Word lid van de WhatsApp-groep', 'link volgt'),
        link(L.wbw, 'Open de WieBetaaltWat-lijst', 'link volgt')));
    if (!L.whatsapp || !L.wbw) kids.push(el('p', { class: 'muted', text: 'Nog niet alle links staan klaar. Bewaar deze pagina, ze verschijnen hier vanzelf.' }));
    kids.push(termsBox());
    if (su.paid_self) kids.push(el('button', { class: 'linkish', type: 'button', onclick: () => setPaid(false), text: 'Per ongeluk getikt? Zet terug op niet betaald' }));
  } else if (isIn) {
    const clicked = store('wb.payclicked') === '1';
    kids.push(el('h1', { class: 'ph-title', text: 'Je plek is gereserveerd' }), pass);
    if (!L.pay) {
      kids.push(el('p', { text: 'De betaallink staat nog niet klaar. Bewaar deze pagina, hij verschijnt hier vanzelf.' }),
        el('div', { class: 'links' }, link(null, 'Betaal je deelname', 'betaallink volgt')));
    } else if (!clicked) {
      kids.push(el('p', { text: 'Betaal nu om je plek definitief te maken.' }),
        el('div', { class: 'links' }, el('a', { class: 'btn pink', href: L.pay, target: '_blank', rel: 'noopener', onclick: () => {
          store('wb.payclicked', '1'); payNote = false;
          setTimeout(() => { viewKey = ''; render(); }, 400);
        } }, 'Betaal je deelname')));
      if (payNote) kids.push(el('p', { class: 'note', role: 'status', text: 'Geen probleem: je plek blijft gereserveerd. Probeer het zo nog een keer.' }));
    } else {
      kids.push(el('section', { class: 'paycheck' },
        el('h2', { text: 'Is het gelukt?' }),
        el('p', { text: 'Tik op ‘Ik heb betaald!’ zodra je betaling rond is. Dan verschijnen meteen de WhatsApp-groep en de WieBetaaltWat-lijst.' }),
        el('button', { class: 'btn', type: 'button', onclick: (e) => setPaid(true, e.currentTarget) }, 'Ik heb betaald!'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { store('wb.payclicked', null); payNote = true; viewKey = ''; render(); } }, 'Betalen lukte nog niet'),
        el('a', { class: 'linkish', href: L.pay, target: '_blank', rel: 'noopener', text: 'Open de betaallink opnieuw' })));
    }
    kids.push(termsBox());
  } else {
    kids.push(el('h1', { class: 'ph-title', text: 'Je staat op de wachtlijst' }), pass,
      el('p', { text: 'Valt er iemand af, dan schuif je automatisch door. Deze pagina laat dan vanzelf de betaallink zien.' }));
  }
  kids.push(spotsBox(s));
  screen(s, ...kids);
}

async function setPaid(paid, btn) {
  if (btn) btn.disabled = true;
  try {
    await rpc('mark_paid', { p_token: token, p_paid: paid });
    store('wb.payclicked', null); payNote = false;
    if (paid && navigator.vibrate) navigator.vibrate([30, 60, 30]);
    viewKey = '';
    loop.refresh();
  } catch (err) {
    toast(err.message);
    if (btn) btn.disabled = false;
  }
}

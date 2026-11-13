import { configured, rpc, stateLoop, el, SHAPES, fmt, imgSize, stripes, store, timeLeft, setupMissing } from './core.js';

const app = document.getElementById('app');
if (!configured) { setupMissing(app); throw new Error('config ontbreekt'); }

let token = store('wb.token');
let S = null;              // laatste stand
let viewKey = '';
let local = null;          // { q, choice?, value? } antwoord dat net verstuurd is
let timeUpShown = false;
let goneNote = false;
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
    return `s:${su ? su.status + su.pos : 'no'}:${s.spots.taken >= s.spots.max ? 'full' : 'open'}:${JSON.stringify(s.me.links || null)}`;
  }
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
    case 'acrostic': return drawAcrostic(s);
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
        'aria-label': `${SHAPES[i]} ${o}`,
        onclick: () => send(q.idx, { choice: i }),
      }, el('span', { class: 'shape', 'aria-hidden': 'true', text: SHAPES[i] }), el('span', { text: o }))));
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

function drawAcrostic(s) {
  const letters = s.words.map((w) => w[0].toUpperCase());
  screen(s, center(
    el('p', { class: 'ph-lead', text: 'Lees de eerste letters van alle goede antwoorden eens achter elkaar…' }),
    el('div', { class: 'acro', 'aria-label': letters.join('') }, letters.map((l, i) => el('span', { style: `animation-delay:${0.6 + i * 0.25}s`, text: l })))));
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
    el('h1', { text: a.kicker }), el('div', { class: 'yr', text: a.year }),
    el('p', { class: 'dates', text: a.dates }),
    el('ul', {}, a.lines.map((l) => el('li', { text: l }))));
}

function drawAnnounce(s) {
  screen(s, posterBits(s.announce), el('p', { class: 'ph-lead', text: 'De inschrijving gaat zo open. Hou je telefoon bij de hand.' }));
}

function spotsBox(s) {
  const left = Math.max(0, s.spots.max - s.spots.taken);
  return el('section', { class: 'spots' },
    el('div', { class: 'row' }, el('span', { class: 'big-num', 'data-bind': 'left', text: left }), el('span', { class: 'ph-lead', text: `van de ${s.spots.max} plekken nog vrij` })),
    el('div', { class: 'seatbar', style: `--max:${s.spots.max}` }, Array.from({ length: s.spots.max }, (_, i) => el('i', { class: i < s.spots.taken ? 'on' : '' }))));
}

function drawSignup(s) {
  const su = s.me?.signup;
  if (su) return drawPass(s, su);
  const full = s.spots.taken >= s.spots.max;
  const nameIn = el('input', { id: 'fn', maxlength: 60, autocomplete: 'name', required: true, placeholder: 'Voor- en achternaam' });
  const ski = (v, title, sub, checked) => [
    el('input', { type: 'radio', name: 'ski', id: `ski-${v}`, value: v, checked }),
    el('label', { for: `ski-${v}` }, title, el('small', { text: sub }))];
  const btn = el('button', { class: 'btn pink', type: 'submit', text: full ? 'Zet me op de wachtlijst' : 'Ik ga mee' });
  const form = el('form', { class: 'field', style: 'gap:14px', onsubmit: async (e) => {
    e.preventDefault();
    const name = nameIn.value.trim();
    if (name.length < 2 || !name.includes(' ')) { toast('Vul je voor- én achternaam in.'); return nameIn.focus(); }
    const skier = form.querySelector('input[name=ski]:checked')?.value === 'ja';
    btn.disabled = true;
    try {
      if (!token) {
        const r = await rpc('join_game', { p_name: name.slice(0, 24) });
        token = store('wb.token', r.token);
      }
      await rpc('sign_up', { p_token: token, p_full_name: name, p_skier: skier });
      viewKey = '';
      loop.refresh();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  } },
    el('div', { class: 'field' }, el('label', { for: 'fn', text: 'Je naam voor de deelnemerslijst' }), nameIn),
    el('fieldset', { class: 'choice2', style: 'border:0;padding:0;margin:0' },
      el('legend', { class: 'sr', style: 'font-weight:500;margin-bottom:6px', text: 'Wat ga je doen?' }),
      ...ski('ja', 'Skiën', 'en daarna après', true), ...ski('nee', 'Alleen après', 'niet de piste op', false)),
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
  const L = s.me.links || {};
  const link = (url, label, sub) => url
    ? el('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, label)
    : el('button', { class: 'btn ghost', disabled: true }, label, el('small', { text: sub }));
  const pass = el('section', { class: `pass${isIn ? '' : ' wait'}` },
    stripes(),
    el('div', { class: 'pass-body' },
      el('div', { class: 'pass-head' },
        el('h2', {}, `Skipas`, el('br'), `${s.announce.kicker} ${s.announce.year}`),
        el('div', { class: 'plek' }, el('span', { class: 'big-num', text: isIn ? su.pos : `#${su.pos - s.spots.max}` }), isIn ? 'plek' : 'wachtlijst')),
      el('p', { class: 'pass-name', text: su.full_name }),
      el('div', { class: 'pass-grid' },
        el('span', {}, 'Wanneer', el('b', { text: s.announce.dates })),
        el('span', {}, 'Programma', el('b', { text: su.skier ? 'Skiën + après' : 'Alleen après' }))),
      el('div', { class: 'pass-code', 'aria-hidden': 'true' })));

  const kids = [el('h1', { class: 'ph-title', text: isIn ? 'Je gaat mee!' : 'Je staat op de wachtlijst' }), pass];
  if (isIn) {
    kids.push(el('p', { text: 'Regel nu meteen deze drie dingen:' }));
    kids.push(el('div', { class: 'links' },
      link(L.pay, 'Betaal je deelname', 'link volgt'),
      link(L.whatsapp, 'Word lid van de WhatsApp-groep', 'link volgt'),
      link(L.wbw, 'Open de WieBetaaltWat-lijst', 'link volgt')));
    if (!L.pay || !L.whatsapp || !L.wbw) kids.push(el('p', { class: 'muted', text: 'Nog niet alle links staan klaar. Bewaar deze pagina, ze verschijnen hier vanzelf.' }));
  } else {
    kids.push(el('p', { text: 'Valt er iemand af, dan schuif je automatisch door. Deze pagina laat dan vanzelf de links zien om te betalen en mee te doen in de app-groep.' }));
  }
  kids.push(spotsBox(s));
  screen(s, ...kids);
}

import { configured, rpc, stateLoop, el, fmt, store, timeLeft, setupMissing } from './core.js';

const app = document.getElementById('app');
if (!configured) { setupMissing(app); throw new Error('config ontbreekt'); }

let pin = store('wb.pin');
let S = null, loop = null, autoFor = null, busy = false;
let auto = store('wb.auto') !== '0';
const ui = {};

if (!pin) drawLogin(); else start();

/* ---------- inloggen ---------- */
function drawLogin(msg) {
  const input = el('input', { id: 'pin', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', required: true });
  const btn = el('button', { class: 'btn', type: 'submit', text: 'Inloggen' });
  app.replaceChildren(
    el('h1', { text: 'Bediening' }),
    el('form', { class: 'card field', onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        await rpc('host_state', { p_pin: input.value.trim() });
        pin = store('wb.pin', input.value.trim());
        start();
      } catch (err) {
        btn.disabled = false;
        drawLogin(err.message);
      }
    } }, el('label', { for: 'pin', text: 'Pincode van de quizmaster' }), input, btn,
      msg ? el('p', { style: 'color:var(--pink)', text: msg }) : null));
  input.focus();
}

/* ---------- opbouw ---------- */
function start() {
  build();
  loop = stateLoop({
    fetch: () => rpc('host_state', { p_pin: pin }),
    onState: (s, err) => {
      if (err) {
        if (err.code === '28000') { pin = store('wb.pin', null); return drawLogin('Pincode klopt niet meer, log opnieuw in.'); }
        ui.status.textContent = 'Geen verbinding, opnieuw proberen…';
        return;
      }
      ui.status.textContent = '';
      S = s;
      update();
    },
    intervalFor: (s) => (s && s.kind === 'question' ? 800 : 1500),
  });
  setInterval(checkAuto, 300);
}

function build() {
  ui.kind = el('div', { class: 'kind', text: '…' });
  ui.txt = el('p', { class: 'txt' });
  ui.stats = el('div', { class: 'stats' });
  ui.next = el('button', { class: 'btn next', type: 'button', onclick: () => go(+1) });
  ui.back = el('button', { class: 'btn ghost', type: 'button', onclick: () => go(-1), text: 'Vorige stap' });
  ui.status = el('p', { class: 'muted', role: 'status' });
  ui.autoBox = el('input', { type: 'checkbox', id: 'auto', checked: auto, onchange: (e) => { auto = e.target.checked; store('wb.auto', auto ? '1' : '0'); } });

  ui.pay = el('input', { id: 'pay', type: 'url', placeholder: 'https://tikkie.me/…' });
  ui.wa = el('input', { id: 'wa', type: 'url', placeholder: 'https://chat.whatsapp.com/…' });
  ui.wbw = el('input', { id: 'wbw', type: 'url', placeholder: 'https://www.wiebetaaltwat.nl/…' });
  ui.max = el('input', { id: 'max', type: 'number', min: 1, max: 200 });
  ui.signups = el('div', { class: 'list' });
  ui.signupSum = el('summary');
  ui.players = el('div', { class: 'list' });
  ui.playerSum = el('summary');
  ui.guesses = el('div', { class: 'list' });
  ui.guessSum = el('summary');
  ui.jump = el('select', { id: 'jump', 'aria-label': 'Kies een stap' });

  const fld = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input);

  app.replaceChildren(
    el('h1', { text: 'Bediening' }),
    el('nav', { class: 'links-nav' },
      el('a', { href: 'scherm.html', target: '_blank', text: 'Groot scherm openen' }),
      el('a', { href: './', target: '_blank', text: 'Telefoonpagina' })),
    el('section', { class: 'card' },
      el('div', { class: 'now' }, ui.kind, ui.txt), ui.stats, ui.next,
      ui.back,
      el('label', { class: 'switch', for: 'auto' }, ui.autoBox, 'Antwoord automatisch tonen als de tijd om is of iedereen heeft geantwoord'),
      ui.status),
    el('details', {}, ui.signupSum, el('div', { style: 'display:grid;gap:10px' },
      el('button', { class: 'btn ghost', type: 'button', onclick: copyList, text: 'Kopieer deelnemerslijst' }), ui.signups)),
    el('details', {}, el('summary', { text: 'Links en aantal plekken' }),
      el('form', { style: 'display:grid;gap:12px', onsubmit: saveSettings },
        fld('pay', 'Betaallink', ui.pay), fld('wa', 'WhatsApp-groep', ui.wa), fld('wbw', 'WieBetaaltWat', ui.wbw),
        fld('max', 'Aantal plekken', ui.max),
        el('button', { class: 'btn', type: 'submit', text: 'Opslaan' }),
        el('p', { class: 'muted', text: 'Wie een plek heeft, ziet de betaallink. Na het betalen tikt iemand zelf op "Ik heb betaald!" en ziet dan meteen de WhatsApp-groep en WieBetaaltWat. Bij Inschrijvingen zie je wie dat deed ("zelf gemeld") en kun je iemand ook zelf op betaald of niet betaald zetten. Lege links tonen "link volgt".' }))),
    el('details', {}, ui.guessSum, ui.guesses),
    el('details', {}, ui.playerSum, ui.players),
    el('details', {}, el('summary', { text: 'Naar een andere stap' }),
      el('div', { style: 'display:grid;gap:10px' }, ui.jump,
        confirmBtn('Ga naar deze stap', () => `Zeker? Alle schermen gaan naar "${stepName(S.all_steps[Number(ui.jump.value)])}"`, jump, 'btn ghost'))),
    el('details', { class: 'danger' }, el('summary', { text: 'Opnieuw beginnen' }),
      el('div', { style: 'display:grid;gap:10px' },
        confirmBtn('Quiz opnieuw beginnen (spelers blijven)', 'Tik nogmaals: alle antwoorden wissen', () => reset('quiz')),
        confirmBtn('Alles wissen na het testen', 'Tik nogmaals: spelers, antwoorden en inschrijvingen wissen', () => reset('all')),
        el('p', { class: 'muted', text: 'Tik twee keer om te bevestigen. Alles wissen haalt ook spelers en inschrijvingen weg. Doe dit vóór de borrel, niet erna.' }),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { store('wb.pin', null); location.reload(); }, text: 'Uitloggen' }))));
}

/* Knop die je twee keer moet aantikken (werkt ook waar pop-ups geblokkeerd zijn) */
function confirmBtn(label, armedLabel, fn, cls = 'btn') {
  let timer = 0;
  const b = el('button', { class: cls, type: 'button', text: label, onclick: async () => {
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.textContent = typeof armedLabel === 'function' ? armedLabel() : armedLabel;
      timer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    b.disabled = true;
    const err = await fn();
    b.disabled = false;
    if (!b.isConnected) return;
    b.textContent = err ? `Mislukt: ${err}` : 'Gelukt ✓';
    timer = setTimeout(disarm, err ? 6000 : 2500);
  } });
  const disarm = () => { clearTimeout(timer); b.classList.remove('armed'); b.textContent = label; };
  return b;
}

/* ---------- stappen ---------- */
function qNumbers() {
  const map = {};
  let n = 0;
  for (const st of S.all_steps) if (st.kind === 'question') map[st.q_idx] = st.q_idx === 0 ? 'oefen' : ++n;
  return map;
}
function stepName(st) {
  if (!st) return 'Einde';
  const nums = qNumbers();
  const n = nums[st.q_idx];
  switch (st.kind) {
    case 'lobby': return 'Lobby: spelers doen mee';
    case 'question': return n === 'oefen' ? 'Oefenvraag' : `Vraag ${n}`;
    case 'answer': return n === 'oefen' ? 'Antwoord oefenvraag' : `Antwoord vraag ${n}`;
    case 'leaderboard': return st.label || 'Tussenstand';
    case 'round_intro': return `${st.label}: intro`;
    case 'connection': return 'Connectie: woordwolk (laatste kans)';
    case 'connection_reveal': return 'Connectie onthullen';
    case 'podium': return 'Podium met de winnaar';
    case 'announce': return 'De grote onthulling';
    case 'signup': return 'Inschrijving openen';
    default: return st.kind;
  }
}

async function go(delta) {
  if (!S || busy) return;
  const to = S.step + delta;
  if (to < 0 || to >= S.all_steps.length) return;
  busy = true;
  try {
    await rpc('host_goto', { p_pin: pin, p_from: S.step, p_to: to });
  } catch (e) { ui.status.textContent = e.message; }
  busy = false;
  loop.refresh();
}

function checkAuto() {
  if (!S || !auto || S.kind !== 'question' || busy) return;
  const done = timeLeft(S) <= 0 || (S.players > 0 && S.answered >= S.players);
  if (done && autoFor !== S.step) {
    autoFor = S.step;
    const at = S.step;
    setTimeout(() => { if (S && S.step === at && S.kind === 'question') go(+1); }, 1500);
  }
  if (S.kind === 'question') {
    const t = ui.stats.querySelector('[data-t]');
    if (t) t.textContent = Math.ceil(timeLeft(S));
  }
}

/* ---------- bijwerken ---------- */
let lastLists = '', settingsFilled = false;
function update() {
  const s = S;
  const cur = s.all_steps[s.step];
  const nxt = s.all_steps[s.step + 1];
  ui.kind.textContent = stepName(cur);
  ui.txt.textContent = s.q && (s.kind === 'question' || s.kind === 'answer') ? s.q.text : `Stap ${s.step + 1} van ${s.all_steps.length}`;

  const stat = (v, l, attr) => el('span', {}, el('b', { ...(attr || {}), text: v }), l);
  const st = [stat(s.players, 'spelers')];
  if (s.kind === 'question') st.push(stat(`${s.answered}`, `van ${s.players} geantwoord`), stat(Math.ceil(timeLeft(s)), 'sec over', { 'data-t': '' }));
  if (s.kind === 'answer') st.push(stat(`${s.answered}`, 'antwoorden'));
  if (s.conn && (s.conn.open || s.kind === 'connection_reveal')) st.push(stat(s.conn.guesses, 'connectie-gokken'));
  const taken = s.signup_list.filter((x) => !x.removed).length;
  const paidN = s.signup_list.filter((x) => !x.removed && x.paid).length;
  const max = Number(s.settings.max_spots || 29);
  st.push(stat(`${Math.min(taken, max)}/${max}`, 'ingeschreven'));
  if (s.kind === 'signup' || s.kind === 'announce') st.push(stat(paidN, 'betaald'));
  ui.stats.replaceChildren(...st);

  ui.next.textContent = nxt ? `Volgende: ${stepName(nxt)}` : 'Klaar: de inschrijving staat open';
  ui.next.disabled = !nxt;
  ui.back.disabled = s.step === 0;

  if (!settingsFilled) {
    ui.pay.value = s.settings.pay_url || ''; ui.wa.value = s.settings.whatsapp_url || '';
    ui.wbw.value = s.settings.wbw_url || ''; ui.max.value = max;
    ui.jump.replaceChildren(...s.all_steps.map((x) => el('option', { value: x.idx, text: `${x.idx + 1}. ${stepName(x)}` })));
    settingsFilled = true;
  }
  if (document.activeElement !== ui.jump) ui.jump.value = String(s.step);

  const listsKey = JSON.stringify([s.signup_list, s.guess_list, s.player_list.map((p) => [p.id, p.removed, p.score])]);
  if (listsKey !== lastLists) {
    lastLists = listsKey;
    ui.signupSum.textContent = `Inschrijvingen (${taken}${taken > max ? `, waarvan ${taken - max} wachtlijst` : ''}, ${paidN} betaald)`;
    ui.signups.replaceChildren(...(s.signup_list.length ? s.signup_list.map((x) => el('div', { class: `item su${x.removed ? ' off' : ''}${x.pos > max ? ' wait' : ''}` },
      el('span', { class: 'pos', text: x.removed ? '–' : x.pos > max ? `w${x.pos - max}` : x.pos }),
      el('span', { class: 'grow', text: x.full_name }),
      x.removed ? null : x.paid
        ? confirmBtn(x.paid_self ? 'Betaald ✓ (zelf gemeld)' : 'Betaald ✓', 'Zet op niet betaald?', () => setPaid(x), 'paid')
        : el('button', { type: 'button', onclick: () => setPaid(x), text: 'Markeer betaald' }),
      x.removed ? el('button', { type: 'button', onclick: () => setSignup(x), text: 'Zet terug' })
        : confirmBtn('Verwijder', 'Zeker? Wachtlijst schuift door', () => setSignup(x), 'del')))
      : [el('p', { class: 'muted', text: 'Nog niemand ingeschreven.' })]));
    const gl = s.guess_list || [];
    ui.guessSum.textContent = `Connectie-gokken (${gl.length}${gl.length ? `, ${gl.filter((g) => g.correct).length} goed` : ''})`;
    ui.guesses.replaceChildren(...(gl.length ? gl.map((g) => el('div', { class: `item${g.correct ? ' ok' : ''}` },
      el('span', { class: 'pos', text: g.at_q > 10 ? 'wolk' : `v${g.at_q}` }),
      el('span', { class: 'grow' }, el('b', { text: g.name }), ` ${g.guess}`),
      el('span', { class: 'muted', text: g.correct ? 'goed' : 'fout' })))
      : [el('p', { class: 'muted', text: 'Nog niemand heeft gegokt. Dat kan tijdens ronde 1 met de knop ‘Ik weet de connectie!’.' })]));
    ui.playerSum.textContent = `Spelers (${s.player_list.filter((p) => !p.removed).length})`;
    ui.players.replaceChildren(...s.player_list.map((p) => el('div', { class: `item${p.removed ? ' off' : ''}` },
      el('span', { class: 'grow', text: p.name }), el('span', { class: 'muted', text: fmt(p.score) }),
      el('button', { type: 'button', onclick: () => setPlayer(p), text: p.removed ? 'Zet terug' : 'Verwijder' }))));
  }
}

/* ---------- acties ---------- */
async function setSignup(x) {
  await act(() => rpc('host_set_signup', { p_pin: pin, p_id: x.id, p_removed: !x.removed }));
}
async function setPaid(x) {
  await act(() => rpc('host_set_paid', { p_pin: pin, p_id: x.id, p_paid: !x.paid }));
}
async function setPlayer(p) {
  await act(() => rpc('host_set_player', { p_pin: pin, p_id: p.id, p_removed: !p.removed }));
}
async function saveSettings(e) {
  e.preventDefault();
  await act(() => rpc('host_set_settings', { p_pin: pin, p_pay: ui.pay.value, p_whatsapp: ui.wa.value, p_wbw: ui.wbw.value, p_max: Number(ui.max.value) }), 'Opgeslagen');
}
async function jump() {
  const to = Number(ui.jump.value);
  await act(() => rpc('host_goto', { p_pin: pin, p_from: S.step, p_to: to }));
}
async function reset(scope) {
  await act(() => rpc('host_reset', { p_pin: pin, p_scope: scope }),
    scope === 'all' ? 'Alles gewist. De quiz staat weer in de lobby.' : 'Antwoorden gewist. De quiz staat weer in de lobby.');
}
async function act(fn, okMsg) {
  let err = null;
  try { await fn(); if (okMsg) ui.status.textContent = okMsg; }
  catch (e) { err = e.message; ui.status.textContent = e.message; }
  loop.refresh();
  return err;
}
async function copyList() {
  const max = Number(S.settings.max_spots || 29);
  const rows = S.signup_list.filter((x) => !x.removed).map((x) => `${x.pos}. ${x.full_name}${x.paid ? ' (betaald)' : ''}${x.pos > max ? ' – wachtlijst' : ''}`);
  try { await navigator.clipboard.writeText(rows.join('\n')); ui.status.textContent = 'Lijst gekopieerd'; }
  catch { ui.status.textContent = rows.join(' · '); }
}

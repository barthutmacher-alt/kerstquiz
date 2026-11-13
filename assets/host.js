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
  ui.skip = el('button', { class: 'btn ghost', type: 'button', onclick: () => go(+2), text: 'Sla tussenstand over' });
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
  ui.jump = el('select', { id: 'jump', 'aria-label': 'Kies een stap' });

  const fld = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input);

  app.replaceChildren(
    el('h1', { text: 'Bediening' }),
    el('nav', { class: 'links-nav' },
      el('a', { href: 'scherm.html', target: '_blank', text: 'Groot scherm openen' }),
      el('a', { href: './', target: '_blank', text: 'Telefoonpagina' })),
    el('section', { class: 'card' },
      el('div', { class: 'now' }, ui.kind, ui.txt), ui.stats, ui.next,
      el('div', { class: 'row2' }, ui.back, ui.skip),
      el('label', { class: 'switch', for: 'auto' }, ui.autoBox, 'Antwoord automatisch tonen als de tijd om is of iedereen heeft geantwoord'),
      ui.status),
    el('details', {}, ui.signupSum, el('div', { style: 'display:grid;gap:10px' },
      el('button', { class: 'btn ghost', type: 'button', onclick: copyList, text: 'Kopieer deelnemerslijst' }), ui.signups)),
    el('details', {}, el('summary', { text: 'Links en aantal plekken' }),
      el('form', { style: 'display:grid;gap:12px', onsubmit: saveSettings },
        fld('pay', 'Betaallink', ui.pay), fld('wa', 'WhatsApp-groep', ui.wa), fld('wbw', 'WieBetaaltWat', ui.wbw),
        fld('max', 'Aantal plekken', ui.max),
        el('button', { class: 'btn', type: 'submit', text: 'Opslaan' }),
        el('p', { class: 'muted', text: 'Alleen wie een plek heeft, ziet deze links. Lege links tonen "link volgt".' }))),
    el('details', {}, ui.playerSum, ui.players),
    el('details', {}, el('summary', { text: 'Naar een andere stap' }),
      el('div', { style: 'display:grid;gap:10px' }, ui.jump,
        el('button', { class: 'btn ghost', type: 'button', onclick: jump, text: 'Ga naar deze stap' }))),
    el('details', { class: 'danger' }, el('summary', { text: 'Opnieuw beginnen' }),
      el('div', { style: 'display:grid;gap:10px' },
        el('button', { class: 'btn', type: 'button', onclick: () => reset('quiz'), text: 'Quiz opnieuw beginnen (spelers blijven)' }),
        el('button', { class: 'btn', type: 'button', onclick: () => reset('all'), text: 'Alles wissen na het testen' }),
        el('p', { class: 'muted', text: 'Alles wissen haalt ook spelers en inschrijvingen weg. Doe dit vóór de borrel, niet erna.' }),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { store('wb.pin', null); location.reload(); }, text: 'Uitloggen' }))));
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
    case 'acrostic': return 'Verborgen woord onthullen';
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
  const taken = s.signup_list.filter((x) => !x.removed).length;
  const max = Number(s.settings.max_spots || 29);
  st.push(stat(`${Math.min(taken, max)}/${max}`, 'ingeschreven'));
  ui.stats.replaceChildren(...st);

  ui.next.textContent = nxt ? `Volgende: ${stepName(nxt)}` : 'Klaar: de inschrijving staat open';
  ui.next.disabled = !nxt;
  ui.skip.hidden = !(nxt && nxt.kind === 'leaderboard' && s.all_steps[s.step + 2]);
  ui.back.disabled = s.step === 0;

  if (!settingsFilled) {
    ui.pay.value = s.settings.pay_url || ''; ui.wa.value = s.settings.whatsapp_url || '';
    ui.wbw.value = s.settings.wbw_url || ''; ui.max.value = max;
    ui.jump.replaceChildren(...s.all_steps.map((x) => el('option', { value: x.idx, text: `${x.idx + 1}. ${stepName(x)}` })));
    settingsFilled = true;
  }
  if (document.activeElement !== ui.jump) ui.jump.value = String(s.step);

  const listsKey = JSON.stringify([s.signup_list, s.player_list.map((p) => [p.id, p.removed, p.score])]);
  if (listsKey !== lastLists) {
    lastLists = listsKey;
    ui.signupSum.textContent = `Inschrijvingen (${taken}${taken > max ? `, waarvan ${taken - max} wachtlijst` : ''})`;
    ui.signups.replaceChildren(...(s.signup_list.length ? s.signup_list.map((x) => el('div', { class: `item${x.removed ? ' off' : ''}${x.pos > max ? ' wait' : ''}` },
      el('span', { class: 'grow', text: `${x.removed ? '–' : x.pos}. ${x.full_name}` }),
      el('span', { class: 'muted', text: x.skier ? 'ski' : 'après' }),
      el('button', { type: 'button', onclick: () => setSignup(x), text: x.removed ? 'Zet terug' : 'Verwijder' })))
      : [el('p', { class: 'muted', text: 'Nog niemand ingeschreven.' })]));
    ui.playerSum.textContent = `Spelers (${s.player_list.filter((p) => !p.removed).length})`;
    ui.players.replaceChildren(...s.player_list.map((p) => el('div', { class: `item${p.removed ? ' off' : ''}` },
      el('span', { class: 'grow', text: p.name }), el('span', { class: 'muted', text: fmt(p.score) }),
      el('button', { type: 'button', onclick: () => setPlayer(p), text: p.removed ? 'Zet terug' : 'Verwijder' }))));
  }
}

/* ---------- acties ---------- */
async function setSignup(x) {
  if (!x.removed && !confirm(`${x.full_name} van de lijst halen? De eerste van de wachtlijst schuift dan door.`)) return;
  await act(() => rpc('host_set_signup', { p_pin: pin, p_id: x.id, p_removed: !x.removed }));
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
  if (!confirm(`Naar "${stepName(S.all_steps[to])}" springen? Alle schermen gaan mee.`)) return;
  await act(() => rpc('host_goto', { p_pin: pin, p_from: S.step, p_to: to }));
}
async function reset(scope) {
  const word = prompt(scope === 'all' ? 'Typ WIS om alle spelers, antwoorden en inschrijvingen te wissen.' : 'Typ OPNIEUW om alle antwoorden te wissen en terug te gaan naar de lobby.');
  if (word !== (scope === 'all' ? 'WIS' : 'OPNIEUW')) return;
  await act(() => rpc('host_reset', { p_pin: pin, p_scope: scope }), 'Gewist');
}
async function act(fn, okMsg) {
  try { await fn(); if (okMsg) ui.status.textContent = okMsg; }
  catch (e) { ui.status.textContent = e.message; }
  loop.refresh();
}
async function copyList() {
  const max = Number(S.settings.max_spots || 29);
  const rows = S.signup_list.filter((x) => !x.removed).map((x) => `${x.pos}. ${x.full_name} (${x.skier ? 'ski' : 'après'})${x.pos > max ? ' – wachtlijst' : ''}`);
  try { await navigator.clipboard.writeText(rows.join('\n')); ui.status.textContent = 'Lijst gekopieerd'; }
  catch { ui.status.textContent = rows.join(' · '); }
}

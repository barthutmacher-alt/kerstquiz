import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('JOUW-PROJECT') && !SUPABASE_ANON_KEY.includes('JOUW-');

export const sb = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 2 } },
    })
  : null;

export async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const e = new Error(error.message || 'Er ging iets mis');
    e.code = error.code;
    throw e;
  }
  return data;
}

/**
 * Houdt de stand actueel: direct bij een duw van Supabase Realtime,
 * en anders door zelf te verversen (interval hangt af van de fase).
 */
export function stateLoop({ fetch, onState, intervalFor }) {
  let timer = null, busy = false, pending = false, last = null;
  async function tick() {
    if (busy) { pending = true; return; }
    busy = true;
    clearTimeout(timer);
    try {
      const s = await fetch();
      if (s) s._at = performance.now();
      last = s;
      onState(s, null);
    } catch (e) {
      onState(last, e);
    } finally {
      busy = false;
      if (pending) { pending = false; tick(); }
      else timer = setTimeout(tick, intervalFor(last));
    }
  }
  try {
    sb.channel('quiz_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_state' }, () => setTimeout(tick, Math.random() * 250))
      .subscribe();
  } catch { /* zonder realtime blijft verversen werken */ }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('online', () => tick());
  tick();
  return { refresh: tick, get last() { return last; } };
}

/** Kleine DOM-helper. Tekst gaat altijd via textContent (veilig voor namen). */
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

export const SHAPES = ['▲', '◆', '●', '■'];
export const fmt = (n) => Number(n || 0).toLocaleString('nl-NL');
export const imgSize = (url, w) => (url ? url.replace(/=w\d+-h\d+$/, `=w${w}-h${w}`) : url);
export const stripes = (cls = '') => el('div', { class: `stripes ${cls}`, 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i'));

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* privémodus: dan alleen voor deze sessie */ }
  return value;
}

export function timeLeft(s) {
  if (!s || !s.q || s.kind !== 'question') return 0;
  return Math.max(0, s.q.time_left - (performance.now() - s._at) / 1000);
}

export function setupMissing(root) {
  root.replaceChildren(el('main', { class: 'setup' },
    el('h1', { text: 'Nog niet gekoppeld' }),
    el('p', { text: 'Vul in assets/config.js de Project URL en anon key van Supabase in.' })));
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

export const SHAPES = ['Kerstbal', 'Kerstboom', 'Ster', 'Sneeuwvlok'];
const ICON_SVG = [
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9.5" y="2" width="5" height="4" rx="1" fill="currentColor"/><circle cx="12" cy="14" r="8" fill="currentColor"/><path d="M8 11.5a4.5 4.5 0 0 1 3-2.6" stroke="rgba(255,255,255,.55)" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5 6 9.5h2.8L4.5 15.5h4.3L4 21h6.5v2h3v-2H20l-4.8-5.5h4.3l-4.3-6H18z"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 1.8 2.9 6.6 7.1.7-5.4 4.7 1.6 7L12 17.1l-6.2 3.7 1.6-7L2 9.1l7.1-.7z"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9.2 3.8 12 6.6l2.8-2.8M9.2 20.2l2.8-2.8 2.8 2.8M3.4 10.4l3.9-1-1-3.9M20.6 13.6l-3.9 1 1 3.9M3.4 13.6l3.9 1-1 3.9M20.6 10.4l-3.9-1 1-3.9"/></svg>',
];
export function icon(i, cls = 'shape') {
  const n = document.createElement('span');
  n.className = cls;
  n.setAttribute('aria-hidden', 'true');
  n.innerHTML = ICON_SVG[i % 4];
  return n;
}
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

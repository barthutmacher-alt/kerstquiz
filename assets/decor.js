// Winterse aankleding voor het grote scherm: kerstverlichting, bergen met dennen en sneeuwval.
import { reducedMotion } from './core.js';

const BULBS = ['#E0313F', '#F6C445', '#2FB36B', '#6CCFF6'];

export function mountDecor() {
  document.body.prepend(mountains(), snowCanvas.el);
  const lightsEl = document.createElement('div');
  lightsEl.className = 'lights';
  lightsEl.setAttribute('aria-hidden', 'true');
  document.body.append(lightsEl);
  const drawLights = () => { lightsEl.innerHTML = lightsSvg(innerWidth, Math.round(innerWidth * 0.03)); };
  drawLights();
  addEventListener('resize', drawLights);
  snowCanvas.start();
}

/* ---------- kerstverlichting ---------- */
function lightsSvg(W, H) {
  const span = Math.max(160, W / 8);
  const sag = H * 0.55;
  let wire = `M0 ${H * 0.12}`;
  let bulbs = '';
  let k = 0;
  for (let x0 = 0; x0 < W; x0 += span) {
    const x1 = x0 + span, cx = x0 + span / 2, y0 = H * 0.12;
    wire += ` Q${cx} ${y0 + sag * 2} ${x1} ${y0}`;
    for (const t of [0.17, 0.39, 0.61, 0.83]) {
      const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * (y0 + sag * 2) + t * t * y0;
      const c = BULBS[k % BULBS.length];
      const r = H * 0.16;
      const delay = ((k * 0.37) % 2.4).toFixed(2);
      bulbs += `<g class="bulb" style="animation-delay:-${delay}s">`
        + `<circle cx="${x}" cy="${y + r * 1.4}" r="${r * 2.2}" fill="${c}" opacity=".28" filter="url(#glow)"/>`
        + `<rect x="${x - r * 0.45}" y="${y - r * 0.2}" width="${r * 0.9}" height="${r * 0.8}" rx="${r * 0.2}" fill="#1D3B3F"/>`
        + `<ellipse cx="${x}" cy="${y + r * 1.5}" rx="${r * 0.8}" ry="${r * 1.15}" fill="${c}"/>`
        + `<ellipse cx="${x - r * 0.25}" cy="${y + r * 1.15}" rx="${r * 0.22}" ry="${r * 0.35}" fill="#fff" opacity=".55"/>`
        + `</g>`;
      k++;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H * 1.4}" width="${W}" height="${H * 1.4}"><defs><filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="${H * 0.12}"/></filter></defs>`
    + `<path d="${wire}" fill="none" stroke="#1D3B3F" stroke-width="${Math.max(1.5, H * 0.05)}"/>${bulbs}</svg>`;
}

/* ---------- bergen met dennen ---------- */
function mountains() {
  const W = 1600, H = 220;
  const peaks = [[0, 150], [120, 92], [210, 128], [340, 42], [470, 118], [560, 84], [700, 138], [830, 58], [960, 126], [1080, 74], [1210, 132], [1340, 52], [1470, 118], [1600, 86]];
  const far = `M${peaks.map(([x, y]) => `${x} ${y}`).join(' L')} L${W} ${H} L0 ${H}Z`;
  const caps = peaks.filter(([, y]) => y < 100).map(([x, y]) => `M${x} ${y} L${x - 16} ${y + 15} L${x - 6} ${y + 11} L${x} ${y + 18} L${x + 7} ${y + 11} L${x + 17} ${y + 15}Z`).join(' ');
  const hillY = (x) => 182 + Math.sin(x / 210) * 9 + Math.sin(x / 77) * 4;
  let near = `M0 ${hillY(0)}`;
  for (let x = 20; x <= W; x += 20) near += ` L${x} ${hillY(x)}`;
  near += ` L${W} ${H} L0 ${H}Z`;
  let trees = '';
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let x = 10; x < W; x += 18 + rnd() * 34) {
    const h = 26 + rnd() * 34, w = h * 0.55, b = hillY(x) + 4;
    trees += `M${x} ${b - h} L${x - w * 0.35} ${b - h * 0.55} L${x - w * 0.2} ${b - h * 0.55} L${x - w * 0.5} ${b - h * 0.12} L${x + w * 0.5} ${b - h * 0.12} L${x + w * 0.2} ${b - h * 0.55} L${x + w * 0.35} ${b - h * 0.55}Z M${x - 2} ${b - h * 0.13} h4 v${h * 0.15} h-4Z `;
  }
  const box = document.createElement('div');
  box.className = 'mountains';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
    + `<path d="${far}" fill="#123F48" opacity=".75"/><path d="${caps}" fill="#F4F8FB" opacity=".55"/>`
    + `<path d="${near}" fill="#0A2A2C"/><path d="${trees}" fill="#0A2A2C"/></svg>`;
  return box;
}

/* ---------- sneeuw ---------- */
export const snowCanvas = (() => {
  const c = document.createElement('canvas');
  c.className = 'snow-bg';
  c.setAttribute('aria-hidden', 'true');
  let flakes = [], target = 70, last = 0, running = false;
  const make = (y) => ({ x: Math.random(), y: y ?? Math.random(), r: 0.5 + Math.random() ** 2 * 3.2, v: 0.02 + Math.random() * 0.05, w: Math.random() * 6.28, d: 0.4 + Math.random() });
  const fit = () => { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; };
  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    while (flakes.length < target) flakes.push(make(-0.05 * Math.random()));
    if (flakes.length > target) flakes.length = target;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(244,248,251,.85)';
    for (const f of flakes) {
      f.y += f.v * dt * (0.6 + f.r * 0.25);
      f.w += dt * f.d;
      if (f.y > 1.03) Object.assign(f, make(-0.03));
      ctx.globalAlpha = 0.35 + Math.min(0.6, f.r / 5);
      ctx.beginPath();
      ctx.arc((f.x + Math.sin(f.w) * 0.012) * W, f.y * H, f.r * devicePixelRatio * (innerWidth / 1600), 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  return {
    el: c,
    start() {
      if (reducedMotion() || running) return;
      fit(); addEventListener('resize', fit);
      flakes = Array.from({ length: target }, () => make());
      running = true; requestAnimationFrame(frame);
    },
    set density(n) { target = n; },
  };
})();

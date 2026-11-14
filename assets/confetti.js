// Confettikanonnen over het hele scherm, in kerstkleuren, met sterretjes en sneeuwvlokjes.
import { reducedMotion } from './core.js';

const COLORS = ['#E0313F', '#2FB36B', '#F6C445', '#F4F8FB', '#6CCFF6', '#E0313F', '#F6C445'];

export function confettiShow({ duration = 9000, bursts = [0, 600, 1300, 2600, 4200], rain = true } = {}) {
  if (reducedMotion()) return () => {};
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.setAttribute('aria-hidden', 'true');
  c.style.zIndex = '60';
  document.body.append(c);
  const ctx = c.getContext('2d');
  const dpr = devicePixelRatio || 1;
  const fit = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
  fit();
  const S = c.height / 900; // schaal t.o.v. 900px hoog
  const parts = [];
  const shapes = ['rect', 'rect', 'rect', 'circle', 'star', 'flake'];

  function piece(x, y, angle, speed) {
    return {
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      s: (7 + Math.random() * 9) * S * dpr, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
      flip: Math.random() * 6.28, vf: 0.08 + Math.random() * 0.15,
      col: COLORS[(Math.random() * COLORS.length) | 0], shape: shapes[(Math.random() * shapes.length) | 0],
      drag: 0.985 - Math.random() * 0.01,
    };
  }
  function cannon(side) {
    const x = side === 'l' ? 0 : c.width, y = c.height * 1.02;
    for (let i = 0; i < 150; i++) {
      const base = side === 'l' ? -Math.PI / 3.2 : -Math.PI + Math.PI / 3.2;
      const a = base + (Math.random() - 0.5) * 0.55;
      parts.push(piece(x, y, a, (26 + Math.random() * 22) * S * dpr));
    }
  }
  function centerPop() {
    for (let i = 0; i < 120; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      parts.push(piece(c.width / 2, c.height * 1.02, a, (24 + Math.random() * 20) * S * dpr));
    }
  }
  function sprinkle() {
    for (let i = 0; i < 6; i++) parts.push(piece(Math.random() * c.width, -20 * dpr, Math.PI / 2 + (Math.random() - 0.5) * 0.4, (2 + Math.random() * 3) * S * dpr));
  }

  const timers = bursts.map((t, i) => setTimeout(() => {
    if (i % 3 === 2) centerPop(); else { cannon('l'); cannon('r'); }
  }, t));
  const start = performance.now();
  let alive = true;

  function draw(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.abs(Math.cos(p.flip)) * 0.8 + 0.2);
    ctx.fillStyle = p.col; ctx.strokeStyle = p.col;
    const s = p.s;
    if (p.shape === 'rect') ctx.fillRect(-s / 2, -s / 4, s, s / 2);
    else if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, s / 3, 0, 6.283); ctx.fill(); }
    else if (p.shape === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.22 : s * 0.55, a = (i * Math.PI) / 5; ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r); }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1, s * 0.12); ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5); ctx.lineTo(-Math.cos(a) * s * 0.5, -Math.sin(a) * s * 0.5); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function step(now) {
    if (!alive || !c.isConnected) return;
    const t = now - start;
    if (rain && t < duration - 2500) sprinkle();
    ctx.clearRect(0, 0, c.width, c.height);
    const g = 0.42 * S * dpr;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vx *= p.drag; p.vy = p.vy * p.drag + g;
      if (p.vy > 3.2 * S * dpr) p.vy = 3.2 * S * dpr + (p.vy - 3.2 * S * dpr) * 0.9; // dwarrelen
      p.x += p.vx + Math.sin(p.flip) * 0.6 * dpr; p.y += p.vy; p.rot += p.vr; p.flip += p.vf;
      if (p.y > c.height + 40 * dpr && p.vy > 0) { parts.splice(i, 1); continue; }
      draw(p);
    }
    if (t > duration && parts.length === 0) return stop();
    requestAnimationFrame(step);
  }
  function stop() { alive = false; timers.forEach(clearTimeout); c.remove(); }
  requestAnimationFrame(step);
  return stop;
}

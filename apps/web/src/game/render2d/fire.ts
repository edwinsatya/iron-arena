import { hash } from './fxdraw';

/**
 * The fire witch's fire (Homura): columns of flame, burning pools, rings swept by her staff,
 * fireballs and meteors. The red and orange body of a flame is painted normally, so it stays
 * saturated on a bright stage; only the yellow-white heart and the glow are added as light
 * ('lighter'). Pure functions of position and time: a rollback simply redraws them.
 */

const TAU = Math.PI * 2;

type Rgb = readonly [number, number, number];
const WHITE: Rgb = [255, 250, 226];
const YELLOW: Rgb = [255, 214, 96];
const ORANGE: Rgb = [255, 122, 34];
const RED: Rgb = [214, 46, 18];
const DEEP: Rgb = [120, 18, 8];

const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.max(0, Math.min(1, a))})`;

/** Layers of a column, outside in: width, height, root colour, tip colour, alpha, added as light. */
const LAYERS: readonly (readonly [number, number, Rgb, Rgb, number, boolean])[] = [
  [1, 1, RED, DEEP, 0.92, false],
  [0.74, 0.86, ORANGE, RED, 0.9, false],
  [0.46, 0.66, YELLOW, ORANGE, 0.75, true],
  [0.22, 0.42, WHITE, YELLOW, 0.85, true],
];

/** A small teardrop of flame standing on (x, y): orange body, a hot yellow heart. */
export function tongue(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  seed: number,
  a = 1,
) {
  if (!(h > 1) || !(w > 0.5) || a <= 0) return;
  const sway = Math.sin(t * 10 + seed * 2.7) * w * 0.4;
  const shape = (kw: number, kh: number) => {
    const ww = w * kw;
    const hh = h * kh;
    const sw = sway * kh;
    g.beginPath();
    g.moveTo(x - ww / 2, y);
    g.bezierCurveTo(x - ww * 0.6, y - hh * 0.5, x + sw * 0.5, y - hh * 0.75, x + sw, y - hh);
    g.bezierCurveTo(x + sw * 0.5 + ww * 0.3, y - hh * 0.6, x + ww * 0.6, y - hh * 0.4, x + ww / 2, y);
    g.closePath();
  };
  g.save();
  g.globalCompositeOperation = 'source-over';
  let gr = g.createLinearGradient(0, y, 0, y - h);
  gr.addColorStop(0, rgba(ORANGE, 0.9 * a));
  gr.addColorStop(0.55, rgba(RED, 0.75 * a));
  gr.addColorStop(1, rgba(DEEP, 0));
  g.fillStyle = gr;
  shape(1, 1);
  g.fill();
  g.globalCompositeOperation = 'lighter';
  gr = g.createLinearGradient(0, y, 0, y - h * 0.6);
  gr.addColorStop(0, rgba(YELLOW, 0.75 * a));
  gr.addColorStop(1, rgba(ORANGE, 0));
  g.fillStyle = gr;
  shape(0.5, 0.6);
  g.fill();
  g.restore();
}

/**
 * A column of fire standing on (x, y), `w` wide at the root and `h` tall: licking edges that
 * taper to a flickering tip, white-hot inside, tongues breaking away from the top.
 */
export function fireColumn(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  seed = 0,
  a = 1,
) {
  if (!(h > 2) || !(w > 1) || a <= 0) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const R = Math.max(w, h * 0.55);
  const cy = y - h * 0.4;
  const halo = g.createRadialGradient(x, cy, 0, x, cy, R);
  halo.addColorStop(0, rgba(ORANGE, 0.16 * a));
  halo.addColorStop(1, rgba(RED, 0));
  g.fillStyle = halo;
  g.fillRect(x - R, cy - R, R * 2, R * 2);
  const N = 9;
  for (let li = 0; li < LAYERS.length; li++) {
    const [kw, kh, c0, c1, al, add] = LAYERS[li]!;
    g.globalCompositeOperation = add ? 'lighter' : 'source-over';
    const hh = h * kh * (0.9 + 0.1 * Math.sin(t * 11 + seed * 1.7 + li));
    const half = w * kw * 0.5;
    const gr = g.createLinearGradient(0, y, 0, y - hh);
    gr.addColorStop(0, rgba(c0, al * a));
    gr.addColorStop(0.5, rgba(c0, al * a * 0.9));
    gr.addColorStop(1, rgba(c1, 0));
    g.fillStyle = gr;
    g.beginPath();
    for (let s = 0; s <= N; s++) {
      const k = s / N;
      const wob = Math.sin(t * 13 + k * 7 + seed * 2.1 + li) * w * 0.09 * (0.3 + k);
      const px = x - half * (1 - 0.8 * k * k) + wob;
      if (s === 0) g.moveTo(px, y);
      else g.lineTo(px, y - hh * k);
    }
    g.lineTo(x + Math.sin(t * 9 + seed + li) * w * 0.14, y - hh * 1.06);
    for (let s = N; s >= 0; s--) {
      const k = s / N;
      const wob = Math.sin(t * 12 + k * 6 + seed * 1.3 + li + 2) * w * 0.09 * (0.3 + k);
      g.lineTo(x + half * (1 - 0.8 * k * k) + wob, y - hh * k);
    }
    g.closePath();
    g.fill();
  }
  // Bright streaks racing up inside the column
  g.globalCompositeOperation = 'lighter';
  for (let q = 0; q < 4; q++) {
    const sx = x + (hash(q * 13 + seed) - 0.5) * w * 0.34;
    const len = h * (0.22 + 0.2 * hash(q * 7 + seed));
    const top = y - len - ((t * 2.2 + hash(q + seed * 2)) % 1) * (h * 0.8 - len);
    const gr = g.createLinearGradient(0, top + len, 0, top);
    gr.addColorStop(0, rgba(YELLOW, 0));
    gr.addColorStop(0.5, rgba(YELLOW, 0.5 * a));
    gr.addColorStop(1, rgba(WHITE, 0));
    g.fillStyle = gr;
    g.fillRect(sx - w * 0.035, top, w * 0.07, len);
  }
  g.restore();
  for (let q = 0; q < 3; q++) {
    const life = (t * 1.6 + hash(q + seed * 5)) % 1;
    const s = w * 0.26 * (1 - life);
    const tx = x + (hash(q * 3 + seed) - 0.5) * w * 0.5 + Math.sin(t * 7 + q) * w * 0.08;
    tongue(g, tx, y - h * (0.7 + life * 0.45), s, s * 2.6, t, q + seed, a * (1 - life));
  }
}

/** A pool of fire on the ground: a glowing ellipse ringed by little flames. `heat` 0 → 1. */
export function firePool(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  t: number,
  heat: number,
  seed = 0,
  flames = 1,
) {
  if (!(rx > 1) || heat <= 0) return;
  const ry = rx * 0.2;
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  let gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, rgba(ORANGE, 0.6 * heat));
  gr.addColorStop(0.6, rgba(RED, 0.45 * heat));
  gr.addColorStop(1, rgba(DEEP, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, rx, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'lighter';
  gr = g.createRadialGradient(0, 0, 0, 0, 0, rx * 0.6);
  gr.addColorStop(0, rgba(YELLOW, 0.45 * heat));
  gr.addColorStop(1, rgba(ORANGE, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, rx * 0.6, 0, TAU);
  g.fill();
  g.restore();
  if (flames <= 0) return;
  const n = Math.max(6, Math.min(18, Math.round(rx / 9)));
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + hash(i + seed) * 0.4;
    const fl = 0.5 + 0.5 * Math.sin(t * 9 + i * 1.9 + seed);
    tongue(
      g,
      x + Math.cos(ang) * rx * 0.86,
      y + Math.sin(ang) * ry * 0.86,
      rx * 0.12,
      rx * (0.18 + 0.2 * fl) * heat * flames,
      t,
      i + seed,
      heat * (0.6 + 0.4 * fl),
    );
  }
}

/**
 * Flames along an ellipse (rx × ry) around (cx, cy), from angle a0 to a1: 0 = in front of the
 * caster (toward `dir`), π/2 = toward the viewer. `part` draws only the half behind the caster
 * ('back'), the half in front ('front') or all of it. The newest end of the sweep burns hottest.
 */
export function fireRing(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  h: number,
  t: number,
  seed: number,
  part: 'back' | 'front' | 'all',
  a = 1,
  dir = 1,
) {
  if (!(rx > 1) || a <= 0 || !(a1 > a0)) return;
  const steps = Math.max(6, Math.round(((a1 - a0) / TAU) * 36));
  for (let s = 0; s < steps; s++) {
    const t0 = a0 + ((a1 - a0) * s) / steps;
    const t1 = a0 + ((a1 - a0) * (s + 1)) / steps;
    const mid = (t0 + t1) / 2;
    const front = Math.sin(mid) >= 0;
    if ((part === 'back' && front) || (part === 'front' && !front)) continue;
    const fresh = 0.55 + 0.45 * ((s + 1) / steps);
    const x0 = cx + Math.cos(t0) * rx * dir;
    const y0 = cy + Math.sin(t0) * ry;
    const x1 = cx + Math.cos(t1) * rx * dir;
    const y1 = cy + Math.sin(t1) * ry;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = rgba(ORANGE, 0.75 * a * fresh);
    g.lineWidth = Math.max(3, ry * 0.4);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = rgba(YELLOW, 0.6 * a * fresh);
    g.lineWidth = Math.max(1.5, ry * 0.13);
    g.stroke();
    g.restore();
    const fl = 0.6 + 0.4 * Math.sin(t * 11 + s * 2.3 + seed);
    tongue(
      g,
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      Math.max(4, ry * 0.8),
      h * fl * (0.6 + 0.4 * hash(s + seed)) * fresh,
      t,
      s + seed,
      a,
    );
  }
}

/** A fireball flying along +x (rotate the context first): white-hot head, a long licking tail. */
export function fireball(g: CanvasRenderingContext2D, r: number, t: number, seed = 0, a = 1, tail = 1) {
  if (!(r > 0.5) || a <= 0) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, r * 3);
  halo.addColorStop(0, rgba(ORANGE, 0.3 * a));
  halo.addColorStop(1, rgba(RED, 0));
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, r * 3, 0, TAU);
  g.fill();
  const tails: readonly (readonly [number, number, Rgb, Rgb, number, boolean])[] = [
    [1.15, 4.4, RED, DEEP, 0.9, false],
    [0.95, 3.3, ORANGE, RED, 0.9, false],
    [0.7, 2.2, YELLOW, ORANGE, 0.8, true],
  ];
  tails.forEach(([kw, kl, c0, c1, al, add], li) => {
    g.globalCompositeOperation = add ? 'lighter' : 'source-over';
    const len = r * kl * tail * (0.88 + 0.12 * Math.sin(t * 17 + seed + li * 2));
    const w = r * kw;
    const wv = (q: number) => Math.sin(t * 15 + q * 1.7 + seed * 1.3 + li) * r * 0.22;
    const gr = g.createLinearGradient(w, 0, -len, 0);
    gr.addColorStop(0, rgba(c0, al * a));
    gr.addColorStop(0.35, rgba(c0, al * a * 0.85));
    gr.addColorStop(1, rgba(c1, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(w, 0);
    g.bezierCurveTo(w, -w * 1.05, -len * 0.25, -w * 0.95 + wv(1), -len, wv(2));
    g.bezierCurveTo(-len * 0.25, w * 0.95 + wv(3), w, w * 1.05, w, 0);
    g.fill();
  });
  g.globalCompositeOperation = 'lighter';
  for (let q = 0; q < 5; q++) {
    const life = (t * 3 + hash(q + seed)) % 1;
    const px = -r * (0.6 + life * 3.4 * tail);
    const py = (hash(q * 5 + seed) - 0.5) * r * 1.4 * (0.5 + life);
    const s = r * 0.5 * (1 - life);
    if (s < 0.8) continue;
    const gr = g.createRadialGradient(px, py, 0, px, py, s);
    gr.addColorStop(0, rgba(YELLOW, 0.8 * a * (1 - life)));
    gr.addColorStop(1, rgba(RED, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(px, py, s, 0, TAU);
    g.fill();
  }
  const core = g.createRadialGradient(r * 0.2, 0, 0, 0, 0, r);
  core.addColorStop(0, rgba(WHITE, 0.95 * a));
  core.addColorStop(0.5, rgba(YELLOW, 0.85 * a));
  core.addColorStop(1, rgba(ORANGE, 0));
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.restore();
}

/** Flame gathering at a point (the staff's tip): `k` 0 → 1 as it builds up. */
export function flare(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  k: number,
  seed = 0,
) {
  if (!(r > 0.5) || k <= 0) return;
  for (let q = 0; q < 4; q++) {
    const ang = -Math.PI / 2 + (q - 1.5) * 0.5 + Math.sin(t * 8 + q * 2 + seed) * 0.2;
    const len = r * (1.2 + 0.8 * hash(q + seed)) * k;
    tongue(g, x + Math.cos(ang) * r * 0.3, y + r * 0.2, r * 0.55, len * 1.6, t, q + seed, k);
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  const R = r * (1.5 + 0.15 * Math.sin(t * 21 + seed));
  const gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, rgba(WHITE, 0.75 * k));
  gr.addColorStop(0.25, rgba(YELLOW, 0.55 * k));
  gr.addColorStop(0.55, rgba(ORANGE, 0.3 * k));
  gr.addColorStop(1, rgba(RED, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, R, 0, TAU);
  g.fill();
  g.restore();
}

/** Dark rocks thrown out of an eruption at (x, y); k = 0 → 1 over their flight. */
export function rocks(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  spread: number,
  rise: number,
  size: number,
  k: number,
  n: number,
  seed = 0,
) {
  if (k <= 0 || k >= 1) return;
  for (let i = 0; i < n; i++) {
    const kk = Math.min(1, k * (0.75 + 0.5 * hash(i + seed * 3)));
    if (kk >= 1) continue;
    const vx = (hash(i * 5 + seed) - 0.5) * 2 * spread;
    const up = rise * (0.45 + 0.55 * hash(i * 11 + seed));
    const px = x + vx * kk;
    const py = y - 4 * up * kk * (1 - kk);
    const r = Math.max(1.5, size * (0.45 + 0.6 * hash(i * 7 + seed)));
    g.fillStyle = '#2b130d';
    g.beginPath();
    g.arc(px, py, r, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255, 140, 50, 0.9)';
    g.beginPath();
    g.arc(px, py + r * 0.2, r * 0.6, 0.15, Math.PI - 0.15);
    g.fill();
  }
}

/** A burning rock flying along +x (rotate first): a long fiery tail around a cracked dark stone. */
export function meteorRock(g: CanvasRenderingContext2D, r: number, t: number, seed = 0) {
  fireball(g, r * 1.35, t, seed, 1, 2.2);
  g.save();
  g.rotate(t * 2 + seed);
  g.fillStyle = '#3a1a10';
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * TAU;
    const rr = r * 0.78 * (0.85 + 0.25 * hash(i + seed));
    if (i === 0) g.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    else g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255, 170, 60, 0.95)';
  g.lineWidth = Math.max(1, r * 0.08);
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = hash(i * 3 + seed) * TAU;
    g.moveTo(0, 0);
    g.lineTo(Math.cos(ang) * r * 0.55, Math.sin(ang) * r * 0.55);
    g.lineTo(Math.cos(ang + 0.5) * r * 0.7, Math.sin(ang + 0.5) * r * 0.7);
  }
  g.stroke();
  g.restore();
}

/** An explosion of fire at (x, y): a dome of flame that blooms and cools. `k` 0 → 1. */
export function fireDome(g: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  if (!(r > 1) || k >= 1 || k < 0) return;
  const grow = 1 - (1 - Math.min(1, k * 3)) ** 3;
  const R = r * (0.35 + 0.65 * grow);
  const cool = Math.max(0, (k - 0.25) / 0.75);
  const cy = y - R * 0.35;
  g.save();
  let gr = g.createRadialGradient(x, cy, 0, x, cy, R);
  gr.addColorStop(0, rgba(ORANGE, 0.75 * (1 - cool)));
  gr.addColorStop(0.6, rgba(RED, 0.55 * (1 - cool)));
  gr.addColorStop(1, rgba(DEEP, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(x, cy, R, R * 0.8, 0, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'lighter';
  gr = g.createRadialGradient(x, cy, 0, x, cy, R * 0.6);
  gr.addColorStop(0, rgba(WHITE, 0.85 * (1 - cool)));
  gr.addColorStop(0.5, rgba(YELLOW, 0.6 * (1 - cool)));
  gr.addColorStop(1, rgba(ORANGE, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(x, cy, R * 0.6, R * 0.5, 0, 0, TAU);
  g.fill();
  g.restore();
}

/** A ring of heat rolling out along the ground from (x, y). `k` 0 → 1. */
export function shockRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  if (!(r > 1) || k >= 1 || k < 0) return;
  const R = r * (0.3 + 1.2 * (1 - (1 - k) ** 2));
  g.save();
  g.strokeStyle = rgba(ORANGE, 0.7 * (1 - k));
  g.lineWidth = Math.max(2, r * 0.08 * (1 - k));
  g.beginPath();
  g.ellipse(x, y, R, R * 0.2, 0, 0, TAU);
  g.stroke();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba(YELLOW, 0.45 * (1 - k));
  g.lineWidth = Math.max(1, r * 0.025 * (1 - k));
  g.stroke();
  g.restore();
}

/** The sky catching fire: a deep red glow pouring down from the top of the screen. */
export function burningSky(g: CanvasRenderingContext2D, w: number, h: number, k: number, t: number) {
  if (k <= 0) return;
  g.save();
  const gr = g.createLinearGradient(0, 0, 0, h * 0.85);
  gr.addColorStop(0, `rgba(110, 8, 4, ${0.62 * k})`);
  gr.addColorStop(0.4, `rgba(190, 40, 12, ${0.38 * k * (0.9 + 0.1 * Math.sin(t * 3))})`);
  gr.addColorStop(1, 'rgba(255, 110, 40, 0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.restore();
}

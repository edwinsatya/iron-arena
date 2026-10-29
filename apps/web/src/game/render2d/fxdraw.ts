import { hexA } from './view';

/**
 * Drawing helpers for skill effects with real shapes (flames, crescents, water, crystals, light
 * rays) instead of plain colour blobs. Pure functions of time and position: rollback-safe.
 */

const TAU = Math.PI * 2;

/** Cheap deterministic noise in [0, 1). */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** One flickering flame tongue standing on (x, y), `w` wide and `h` tall (px). */
export function flame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, seed = 0) {
  if (!(h > 1) || !(w > 0.5)) return;
  const sway = Math.sin(t * 9 + seed * 3.1) * w * 0.35;
  const layers: [string, number, number][] = [
    ['rgba(255, 70, 30, 0.85)', 1, 1],
    ['rgba(255, 150, 40, 0.92)', 0.72, 0.8],
    ['rgba(255, 236, 160, 0.95)', 0.42, 0.55],
  ];
  for (const [c, kw, kh] of layers) {
    const ww = w * kw;
    const hh = h * kh * (0.88 + 0.12 * Math.sin(t * 13 + seed));
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(x - ww / 2, y);
    g.bezierCurveTo(x - ww * 0.6, y - hh * 0.45, x + sway * 0.4 - ww * 0.15, y - hh * 0.7, x + sway, y - hh);
    g.bezierCurveTo(x + sway * 0.4 + ww * 0.25, y - hh * 0.65, x + ww * 0.6, y - hh * 0.4, x + ww / 2, y);
    g.closePath();
    g.fill();
  }
}

/** A row of flames between x0 and x1. */
export function flameWall(
  g: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  h: number,
  t: number,
  seed = 0,
) {
  if (!(h > 1) || !(Math.abs(x1 - x0) > 1)) return;
  const n = Math.min(24, Math.max(3, Math.round(Math.abs(x1 - x0) / (h * 0.28))));
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const mid = 1 - Math.abs(k - 0.5) * 1.4;
    const fx = x0 + (x1 - x0) * k;
    flame(g, fx, y, (Math.abs(x1 - x0) / n) * 1.9, h * (0.55 + 0.45 * mid) * (0.8 + 0.2 * hash(i + seed)), t, i + seed);
  }
}

/** Sparks or embers rising from a band around (cx, cy). */
export function embers(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spread: number,
  rise: number,
  t: number,
  n: number,
  color: string,
  seed = 0,
) {
  for (let i = 0; i < n; i++) {
    const life = (t * (0.7 + hash(i + seed) * 0.6) + hash(i * 3 + seed)) % 1;
    const px = cx + (hash(i * 7 + seed) - 0.5) * spread + Math.sin(t * 4 + i) * spread * 0.05;
    const py = cy - life * rise;
    g.globalAlpha = (1 - life) * 0.9;
    g.fillStyle = color;
    g.fillRect(px, py, 2.5, 2.5 + (1 - life) * 3);
  }
  g.globalAlpha = 1;
}

/** Radial spikes with a bright core: impacts and bursts. k = 0 → 1 over its life. */
export function starBurst(g: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, color: string, glow: string, seed = 0) {
  const n = 14;
  const grow = 1 - (1 - Math.min(1, k * 2.5)) ** 3;
  g.save();
  g.translate(x, y);
  g.globalAlpha = 1 - Math.max(0, k - 0.55) / 0.45;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(i + seed) * 0.3;
    const len = r * grow * (0.55 + hash(i * 5 + seed) * 0.6);
    const wid = r * 0.09 * (1 - k * 0.6);
    g.fillStyle = i % 2 ? glow : color;
    g.beginPath();
    g.moveTo(Math.cos(a + 1.57) * wid, Math.sin(a + 1.57) * wid);
    g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    g.lineTo(Math.cos(a - 1.57) * wid, Math.sin(a - 1.57) * wid);
    g.closePath();
    g.fill();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.45 * grow + 1);
  core.addColorStop(0, 'rgba(255,255,255,0.95)');
  core.addColorStop(1, hexA(glow, 0));
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, r * 0.45 * grow + 1, 0, TAU);
  g.fill();
  g.strokeStyle = hexA('#ffffff', 0.8 * (1 - k));
  g.lineWidth = Math.max(1, r * 0.04 * (1 - k));
  g.beginPath();
  g.arc(0, 0, r * (0.4 + k * 0.9), 0, TAU);
  g.stroke();
  g.restore();
}

/**
 * A crescent blade facing +x (rotate/scale the context first): outer arc radius R, thickness
 * `th` at the middle, tapering to points. Bright core with a coloured rim.
 */
export function crescent(g: CanvasRenderingContext2D, R: number, th: number, rim: string, core: string, span = 2.2) {
  const a0 = -span / 2;
  const a1 = span / 2;
  const path = (r: number, t: number) => {
    g.beginPath();
    g.arc(0, 0, r, a0, a1);
    g.quadraticCurveTo(r - t * 1.6, 0, Math.cos(a0) * r, Math.sin(a0) * r);
    g.closePath();
  };
  g.fillStyle = rim;
  path(R, th);
  g.fill();
  g.fillStyle = core;
  path(R * 0.97, th * 0.55);
  g.fill();
}

/** Soft smoke puffs. */
export function smoke(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, n: number, color: string, seed = 0) {
  for (let i = 0; i < n; i++) {
    const life = (t * 0.8 + hash(i + seed)) % 1;
    const px = x + (hash(i * 3 + seed) - 0.5) * r * 2;
    const py = y - life * r * 1.4;
    const rr = r * (0.25 + life * 0.35);
    g.fillStyle = hexA(color, 0.45 * (1 - life));
    g.beginPath();
    g.arc(px, py, rr, 0, TAU);
    g.fill();
  }
}

/** Light rays fanning up from (x, y). */
export function rays(g: CanvasRenderingContext2D, x: number, y: number, len: number, n: number, t: number, color: string) {
  g.save();
  g.translate(x, y);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + ((i / (n - 1)) - 0.5) * 1.6 + Math.sin(t * 2 + i) * 0.04;
    const w = len * 0.05 * (0.6 + hash(i) * 0.8);
    const l = len * (0.6 + hash(i * 3) * 0.4);
    const gr = g.createLinearGradient(0, 0, Math.cos(a) * l, Math.sin(a) * l);
    gr.addColorStop(0, hexA(color, 0.8));
    gr.addColorStop(1, hexA(color, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(Math.cos(a + 1.57) * w, Math.sin(a + 1.57) * w);
    g.lineTo(Math.cos(a) * l, Math.sin(a) * l);
    g.lineTo(Math.cos(a - 1.57) * w, Math.sin(a - 1.57) * w);
    g.fill();
  }
  g.restore();
}

/** A breaking wave rolling toward +x, standing on y = 0 (translate first), w wide, h tall. */
export function waterCurl(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const body = g.createLinearGradient(0, -h, 0, 0);
  body.addColorStop(0, 'rgba(120, 230, 230, 0.95)');
  body.addColorStop(1, 'rgba(20, 110, 150, 0.9)');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-w / 2, 0);
  g.bezierCurveTo(-w * 0.4, -h * 0.5, -w * 0.05, -h * 1.05, w * 0.3, -h * 0.95);
  g.bezierCurveTo(w * 0.5, -h * 0.9, w * 0.48, -h * 0.55, w * 0.32, -h * 0.5);
  g.bezierCurveTo(w * 0.25, -h * 0.48, w * 0.22, -h * 0.25, w / 2, 0);
  g.closePath();
  g.fill();
  // Foam along the crest
  g.strokeStyle = 'rgba(240, 255, 252, 0.95)';
  g.lineWidth = Math.max(2, h * 0.06);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-w * 0.15, -h * 0.85);
  g.bezierCurveTo(w * 0.05, -h * 1.02, w * 0.4, -h * 0.98, w * 0.42, -h * 0.62);
  g.stroke();
  // Spray
  g.fillStyle = 'rgba(240, 255, 252, 0.9)';
  for (let i = 0; i < 10; i++) {
    const k = (t * 1.5 + hash(i)) % 1;
    g.beginPath();
    g.arc(w * 0.3 + k * w * 0.3 * hash(i * 2), -h * (0.9 - k * 0.6) - Math.sin(k * Math.PI) * h * 0.3, 2 + hash(i * 5) * 3, 0, TAU);
    g.fill();
  }
}

/** A faceted ice crystal spear pointing +x, `len` long, `w` thick. */
export function crystalLance(g: CanvasRenderingContext2D, len: number, w: number, rim: string, glow: string) {
  // Frost trail
  const tr = g.createLinearGradient(-len * 1.4, 0, -len * 0.3, 0);
  tr.addColorStop(0, hexA(glow, 0));
  tr.addColorStop(1, hexA(glow, 0.55));
  g.fillStyle = tr;
  g.beginPath();
  g.moveTo(-len * 0.3, -w * 0.6);
  g.lineTo(-len * 1.4, 0);
  g.lineTo(-len * 0.3, w * 0.6);
  g.fill();
  // Body: two facets
  g.fillStyle = rim;
  g.beginPath();
  g.moveTo(len * 0.5, 0);
  g.lineTo(-len * 0.1, -w);
  g.lineTo(-len * 0.5, 0);
  g.closePath();
  g.fill();
  g.fillStyle = '#e8fbff';
  g.beginPath();
  g.moveTo(len * 0.5, 0);
  g.lineTo(-len * 0.1, w);
  g.lineTo(-len * 0.5, 0);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(len * 0.5, 0);
  g.lineTo(-len * 0.5, 0);
  g.stroke();
}

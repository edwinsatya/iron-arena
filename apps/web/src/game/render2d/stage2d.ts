import { ARENA_R } from '@neonfist/sim';
import { hexA, mix, seeded, View2D } from './view';

/**
 * Painted side-view backdrops, drawn once into layers with canvas 2D and scrolled with parallax.
 * The floor is drawn every frame in world space so it lines up with the heroes.
 *
 * Layer canvases use a reference size REF_W × REF_H; the floor band starts at FLOOR_TOP of the
 * screen height, which is where every layer's lowest scenery ends.
 */
const REF_W = 2800;
const REF_H = 1000;
export const FLOOR_TOP = 0.67;
export const GROUND = 0.8;

interface Layer {
  canvas: HTMLCanvasElement;
  /** 0 = fixed sky … 1 = moves with the floor edge. */
  parallax: number;
}

export interface Stage2D {
  name: string;
  /** Colour above the sky layer (shows when the camera rises). */
  skyTop: string;
  layers: Layer[];
  floor: (g: CanvasRenderingContext2D, v: View2D, time: number) => void;
  /** Colour wash over the scene during the ultimate cut-in. */
  tint: string;
  /** Ambient particles (petals, embers, rain), drawn in front. */
  ambient: 'embers' | 'rain' | 'none';
}

function layer(draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = REF_W;
  c.height = REF_H;
  draw(c.getContext('2d')!);
  return c;
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, a: number) {
  const r = g.createRadialGradient(x, y, 0, x, y, rx);
  r.addColorStop(0, hexA(color, a));
  r.addColorStop(1, hexA(color, 0));
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  g.translate(-x, -y);
  g.fillStyle = r;
  g.beginPath();
  g.arc(x, y, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A soft painted cloud: many overlapping blobs, lit from one side. */
function cloud(g: CanvasRenderingContext2D, rnd: () => number, x: number, y: number, w: number, lit: string, shade: string) {
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const bx = x + (t - 0.5) * w + (rnd() - 0.5) * w * 0.15;
    const by = y - Math.sin(t * Math.PI) * w * 0.08 + (rnd() - 0.5) * w * 0.05;
    const r = w * (0.1 + rnd() * 0.1) * (0.6 + Math.sin(t * Math.PI) * 0.6);
    blob(g, bx, by + r * 0.25, r * 1.1, r * 0.7, shade, 0.5);
    blob(g, bx - r * 0.15, by, r, r * 0.75, lit, 0.75);
  }
}

function ridge(g: CanvasRenderingContext2D, rnd: () => number, base: number, amp: number, color: string, step = 60) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, REF_H);
  let y = base;
  for (let x = 0; x <= REF_W + step; x += step) {
    y += (rnd() - 0.5) * amp * 0.5;
    y = Math.max(base - amp, Math.min(base + amp * 0.3, y));
    g.lineTo(x, y);
  }
  g.lineTo(REF_W, REF_H);
  g.closePath();
  g.fill();
}

/* ------------------------------------------------------------------ Lantern Harbor (dusk) */

function harbor(): Stage2D {
  const rnd = seeded(7);
  const sky = layer((g) => {
    const s = g.createLinearGradient(0, 0, 0, 660);
    s.addColorStop(0, '#2c3b78');
    s.addColorStop(0.45, '#7a6aa8');
    s.addColorStop(0.75, '#f0a17a');
    s.addColorStop(1, '#ffdca0');
    g.fillStyle = s;
    g.fillRect(0, 0, REF_W, REF_H);
    // Sun low over the sea
    blob(g, 820, 600, 520, 380, '#ffd9a0', 0.55);
    blob(g, 820, 600, 150, 150, '#fff3cf', 0.95);
    g.fillStyle = '#fff8e6';
    g.beginPath();
    g.arc(820, 600, 58, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 9; i++)
      cloud(g, rnd, rnd() * REF_W, 120 + rnd() * 330, 260 + rnd() * 420, i % 2 ? '#ffd2b8' : '#ffc9a8', '#8a6aa0');
  });
  const far = layer((g) => {
    // Sea
    const sea = g.createLinearGradient(0, 640, 0, REF_H);
    sea.addColorStop(0, '#9fb7cf');
    sea.addColorStop(0.25, '#5d86b0');
    sea.addColorStop(1, '#2e5182');
    g.fillStyle = sea;
    g.fillRect(0, 640, REF_W, REF_H - 640);
    // Islands and a far town
    ridge(g, rnd, 600, 70, '#7d89b5');
    g.clearRect(0, 642, REF_W, REF_H);
    g.fillStyle = sea;
    g.fillRect(0, 640, REF_W, REF_H - 640);
    for (let i = 0; i < 60; i++) {
      const x = 1500 + rnd() * 1000;
      const h = 8 + rnd() * 22;
      g.fillStyle = mix('#e9dccd', '#9aa6c8', rnd() * 0.6);
      g.fillRect(x, 640 - h - (x > 2100 ? 30 : 0) * rnd(), 10 + rnd() * 18, h);
    }
    // Sun glitter
    for (let i = 0; i < 260; i++) {
      const y = 650 + rnd() ** 1.6 * 340;
      const spread = 90 + (y - 640) * 1.4;
      const x = 820 + (rnd() - 0.5) * spread * 2;
      g.fillStyle = hexA('#fff1c4', 0.3 + rnd() * 0.6);
      g.fillRect(x, y, 6 + rnd() * 26, 2);
    }
  });
  const mid = layer((g) => {
    // Sailing ship at anchor
    const shipX = 760;
    g.fillStyle = '#5b3b33';
    g.beginPath();
    g.moveTo(shipX - 230, 640);
    g.lineTo(shipX + 250, 640);
    g.lineTo(shipX + 190, 700);
    g.lineTo(shipX - 180, 700);
    g.closePath();
    g.fill();
    g.fillStyle = '#7a5242';
    g.fillRect(shipX - 220, 632, 460, 12);
    for (const [mx, mh] of [
      [-90, 330],
      [40, 380],
      [160, 280],
    ] as const) {
      g.fillStyle = '#4a3029';
      g.fillRect(shipX + mx - 4, 640 - mh, 8, mh);
      for (let k = 0; k < 3; k++) {
        const top = 640 - mh + 30 + k * (mh / 3.3);
        const w = 120 - k * 6;
        const sail = g.createLinearGradient(shipX + mx - w / 2, 0, shipX + mx + w / 2, 0);
        sail.addColorStop(0, '#f6ead2');
        sail.addColorStop(1, '#d9c4a2');
        g.fillStyle = sail;
        g.beginPath();
        g.moveTo(shipX + mx - w / 2, top);
        g.quadraticCurveTo(shipX + mx, top + 22, shipX + mx + w / 2, top);
        g.lineTo(shipX + mx + w / 2 + 8, top + mh / 3.8);
        g.quadraticCurveTo(shipX + mx, top + mh / 3.8 + 26, shipX + mx - w / 2 - 8, top + mh / 3.8);
        g.closePath();
        g.fill();
      }
    }
    // Harbour town on the right: plaster houses with tiled roofs and lit windows
    let x = 1420;
    while (x < REF_W + 40) {
      const w = 160 + rnd() * 160;
      const h = 170 + rnd() * 230;
      const base = 700;
      const wall = mix('#f2d3a8', '#e7b98a', rnd());
      g.fillStyle = mix(wall, '#7a6aa8', 0.15);
      g.fillRect(x, base - h, w, h);
      // Lit side
      const lit = g.createLinearGradient(x, 0, x + w, 0);
      lit.addColorStop(0, hexA('#ffe7c2', 0.5));
      lit.addColorStop(1, hexA('#ffe7c2', 0));
      g.fillStyle = lit;
      g.fillRect(x, base - h, w, h);
      g.fillStyle = mix('#b8573f', '#8a3f35', rnd());
      g.beginPath();
      g.moveTo(x - 14, base - h);
      g.lineTo(x + w / 2, base - h - 46 - rnd() * 30);
      g.lineTo(x + w + 14, base - h);
      g.closePath();
      g.fill();
      for (let wy = base - h + 40; wy < base - 50; wy += 62)
        for (let wx = x + 22; wx < x + w - 30; wx += 52) {
          const on = rnd() < 0.55;
          g.fillStyle = on ? '#ffcf73' : '#6a5a7a';
          g.beginPath();
          g.roundRect(wx, wy, 22, 32, [11, 11, 2, 2]);
          g.fill();
          if (on) blob(g, wx + 11, wy + 16, 40, 40, '#ffc35a', 0.25);
        }
      x += w + 8 + rnd() * 30;
    }
    // Clock tower
    const tx = 1900;
    g.fillStyle = '#e9c9a0';
    g.fillRect(tx, 230, 120, 470);
    g.fillStyle = '#b8573f';
    g.beginPath();
    g.moveTo(tx - 16, 230);
    g.lineTo(tx + 60, 150);
    g.lineTo(tx + 136, 230);
    g.closePath();
    g.fill();
    g.fillStyle = '#fbf2e2';
    g.beginPath();
    g.arc(tx + 60, 300, 36, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#4a3a4a';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(tx + 60, 300);
    g.lineTo(tx + 60, 276);
    g.moveTo(tx + 60, 300);
    g.lineTo(tx + 78, 306);
    g.stroke();
    // Cypress trees
    for (const cx of [1340, 1395, 2260, 2600]) {
      const h = 220 + rnd() * 120;
      g.fillStyle = '#3e5a3e';
      g.beginPath();
      g.ellipse(cx, 700 - h / 2, 26, h / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hexA('#9bb36a', 0.5);
      g.beginPath();
      g.ellipse(cx - 8, 700 - h / 2, 12, h / 2.3, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Quay wall
    g.fillStyle = '#c9a986';
    g.fillRect(0, 690, REF_W, 20);
  });
  const near = layer((g) => {
    // Balustrade along the back of the pier
    const top = 610;
    const bottom = 700;
    g.fillStyle = '#efdcc0';
    g.fillRect(0, top, REF_W, 22);
    g.fillStyle = '#d8c09e';
    g.fillRect(0, top + 22, REF_W, 6);
    for (let x = 10; x < REF_W; x += 34) {
      const grad = g.createLinearGradient(x, 0, x + 22, 0);
      grad.addColorStop(0, '#f3e3c8');
      grad.addColorStop(1, '#c9ae8a');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x + 6, top + 28);
      g.quadraticCurveTo(x - 4, top + 50, x + 6, bottom - 18);
      g.lineTo(x + 16, bottom - 18);
      g.quadraticCurveTo(x + 26, top + 50, x + 16, top + 28);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#e4cfae';
    g.fillRect(0, bottom - 18, REF_W, 18);
    for (let x = 0; x < REF_W; x += 340) {
      g.fillStyle = '#f1e0c4';
      g.fillRect(x, top - 12, 40, bottom - top + 12);
      // Lantern post
      g.fillStyle = '#3a2e3e';
      g.fillRect(x + 17, top - 150, 6, 140);
      blob(g, x + 20, top - 160, 70, 70, '#ffb04a', 0.45);
      g.fillStyle = '#ffcf6a';
      g.beginPath();
      g.roundRect(x + 8, top - 178, 24, 32, 6);
      g.fill();
    }
  });
  return {
    name: 'Lantern Harbor',
    skyTop: '#2c3b78',
    layers: [
      { canvas: sky, parallax: 0.05 },
      { canvas: far, parallax: 0.15 },
      { canvas: mid, parallax: 0.4 },
      { canvas: near, parallax: 0.75 },
    ],
    floor: (g, v) => {
      drawFloor(g, v, {
        top: '#c9b394',
        bottom: '#e8d6b8',
        line: hexA('#8f7558', 0.45),
        edge: '#a88c6b',
        wall: { top: '#d9c3a2', bottom: '#9c8364', line: hexA('#6e5940', 0.5), bricks: true },
      });
    },
    tint: '#ffb35a',
    ambient: 'embers',
  };
}

/* ------------------------------------------------------------------ Neon Rooftop (night) */

function rooftop(): Stage2D {
  const rnd = seeded(23);
  const sky = layer((g) => {
    const s = g.createLinearGradient(0, 0, 0, 700);
    s.addColorStop(0, '#0a0d2a');
    s.addColorStop(0.55, '#26195a');
    s.addColorStop(1, '#6a2f78');
    g.fillStyle = s;
    g.fillRect(0, 0, REF_W, REF_H);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = hexA('#ffffff', 0.2 + rnd() * 0.7);
      const r = rnd() * 1.8 + 0.4;
      g.beginPath();
      g.arc(rnd() * REF_W, rnd() * 460, r, 0, Math.PI * 2);
      g.fill();
    }
    blob(g, 1900, 230, 380, 380, '#b9a8ff', 0.35);
    g.fillStyle = '#f4f0ff';
    g.beginPath();
    g.arc(1900, 230, 96, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hexA('#c9c0ef', 0.6);
    for (const [dx, dy, r] of [
      [-30, -20, 18],
      [26, 24, 12],
      [10, -40, 8],
    ] as const) {
      g.beginPath();
      g.arc(1900 + dx, 230 + dy, r, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 5; i++) cloud(g, rnd, rnd() * REF_W, 380 + rnd() * 160, 400 + rnd() * 400, '#4d3a86', '#1c1640');
  });
  const skyline = (g: CanvasRenderingContext2D, base: number, minH: number, maxH: number, body: string, win: string, density: number) => {
    let x = -20;
    while (x < REF_W) {
      const w = 70 + rnd() * 150;
      const h = minH + rnd() * (maxH - minH);
      g.fillStyle = body;
      g.fillRect(x, base - h, w, h);
      if (rnd() < 0.3) g.fillRect(x + w / 2 - 3, base - h - 50, 6, 50);
      for (let wy = base - h + 14; wy < base - 10; wy += 18)
        for (let wx = x + 8; wx < x + w - 10; wx += 14)
          if (rnd() < density) {
            g.fillStyle = hexA(win, 0.5 + rnd() * 0.5);
            g.fillRect(wx, wy, 6, 9);
          }
      x += w + rnd() * 10;
    }
  };
  const far = layer((g) => {
    skyline(g, 700, 140, 420, '#221a4c', '#8a7cff', 0.25);
    const haze = g.createLinearGradient(0, 400, 0, 700);
    haze.addColorStop(0, hexA('#6a2f78', 0));
    haze.addColorStop(1, hexA('#ff5fa8', 0.25));
    g.fillStyle = haze;
    g.fillRect(0, 400, REF_W, 300);
  });
  const mid = layer((g) => {
    skyline(g, 700, 220, 520, '#160f33', '#ffd48a', 0.18);
    // Neon signs (decorative shapes, no real brands)
    const signs: [number, number, string][] = [
      [420, 300, '#ff4fa3'],
      [1180, 260, '#3ee6ff'],
      [1700, 340, '#ffcf3e'],
      [2350, 280, '#ff4fa3'],
    ];
    for (const [sx, sy, c] of signs) {
      blob(g, sx + 30, sy + 90, 150, 150, c, 0.35);
      g.strokeStyle = c;
      g.lineWidth = 7;
      g.lineJoin = 'round';
      g.beginPath();
      g.roundRect(sx, sy, 60, 180, 10);
      g.stroke();
      g.lineWidth = 6;
      for (let k = 0; k < 3; k++) {
        const y = sy + 30 + k * 50;
        g.beginPath();
        g.moveTo(sx + 14, y);
        g.lineTo(sx + 46, y);
        g.moveTo(sx + 30, y - 12);
        g.lineTo(sx + 30, y + 16);
        g.stroke();
      }
    }
    // Water tower
    g.fillStyle = '#2b2150';
    g.fillRect(880, 470, 150, 120);
    g.beginPath();
    g.moveTo(870, 470);
    g.lineTo(955, 420);
    g.lineTo(1040, 470);
    g.closePath();
    g.fill();
    g.fillStyle = '#1d1640';
    for (const lx of [895, 1000]) g.fillRect(lx, 590, 10, 110);
  });
  const near = layer((g) => {
    // Rooftop railing and AC units
    g.fillStyle = '#2c2a4a';
    for (let x = 60; x < REF_W; x += 520) {
      g.fillRect(x, 600, 150, 100);
      g.fillStyle = '#3b3866';
      g.fillRect(x + 10, 610, 130, 8);
      g.fillStyle = '#211f3c';
      g.beginPath();
      g.arc(x + 75, 655, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2c2a4a';
    }
    g.strokeStyle = '#4a4677';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, 630);
    g.lineTo(REF_W, 630);
    g.stroke();
    g.lineWidth = 4;
    for (let x = 0; x < REF_W; x += 90) {
      g.beginPath();
      g.moveTo(x, 630);
      g.lineTo(x, 700);
      g.stroke();
    }
  });
  return {
    name: 'Neon Rooftop',
    skyTop: '#0a0d2a',
    layers: [
      { canvas: sky, parallax: 0.04 },
      { canvas: far, parallax: 0.14 },
      { canvas: mid, parallax: 0.35 },
      { canvas: near, parallax: 0.75 },
    ],
    floor: (g, v) => {
      drawFloor(g, v, {
        top: '#3a3760',
        bottom: '#57527f',
        line: hexA('#9a92d6', 0.25),
        edge: '#ffcf3e',
        hazard: true,
        wall: { top: '#2c2950', bottom: '#1a1736', line: hexA('#ff4fa3', 0.8), bricks: false },
      });
    },
    tint: '#7a5cff',
    ambient: 'rain',
  };
}

interface FloorStyle {
  top: string;
  bottom: string;
  line: string;
  edge: string;
  hazard?: boolean;
  /** The walls at both ends of the stage. */
  wall: { top: string; bottom: string; line: string; bricks: boolean };
}

/** The fighting floor: a band with perspective tile lines that scroll with the camera. */
function drawFloor(g: CanvasRenderingContext2D, v: View2D, st: FloorStyle) {
  const lift = v.groundY - v.h * GROUND; // the camera rises when someone jumps high
  const yTop = v.h * FLOOR_TOP + lift;
  const yBot = v.h + lift;
  // Perspective: the far edge is narrower than the near edge; at the heroes' feet it's 1:1
  const tg = (v.groundY - yTop) / (yBot - yTop);
  const at = (x: number, y: number) => {
    const t = (y - yTop) / (yBot - yTop);
    const k = 1 + 0.44 * (t - tg);
    return v.w / 2 + (x - v.camX) * v.scale * k * v.flip + v.ox;
  };
  const L = -ARENA_R * v.flip;
  const R = ARENA_R * v.flip;
  const leftEdge = Math.max(-200, at(L, yTop));
  const rightEdge = Math.min(v.w + 200, at(R, yTop));

  g.save();
  g.beginPath();
  g.moveTo(at(-ARENA_R, yTop), yTop);
  g.lineTo(at(ARENA_R, yTop), yTop);
  g.lineTo(at(ARENA_R, yBot), yBot);
  g.lineTo(at(-ARENA_R, yBot), yBot);
  g.closePath();
  const fill = g.createLinearGradient(0, yTop, 0, yBot);
  fill.addColorStop(0, st.top);
  fill.addColorStop(1, st.bottom);
  g.fillStyle = fill;
  g.fill();
  g.clip();
  // Tile lines
  g.strokeStyle = st.line;
  g.lineWidth = 1.5;
  for (let k = 1; k < 6; k++) {
    const t = (k / 6) ** 1.5;
    const y = yTop + (yBot - yTop) * t;
    g.beginPath();
    g.moveTo(leftEdge - 400, y);
    g.lineTo(rightEdge + 400, y);
    g.stroke();
  }
  const step = 900;
  const first = Math.floor((v.camX - 20000) / step) * step;
  for (let x = first; x < v.camX + 20000; x += step) {
    if (x < -ARENA_R || x > ARENA_R) continue;
    g.beginPath();
    g.moveTo(at(x, yTop), yTop);
    g.lineTo(at(x, yBot), yBot);
    g.stroke();
  }
  // Soft light pool around the action
  const pool = g.createRadialGradient(v.w / 2, v.groundY, 10, v.w / 2, v.groundY, v.w * 0.55);
  pool.addColorStop(0, 'rgba(255,255,255,0.12)');
  pool.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = pool;
  g.fillRect(0, yTop, v.w, yBot - yTop);
  g.restore();

  // Walls at both ends: nobody leaves the stage
  const wallTop = v.sy(3800);
  for (const sgn of [-1, 1]) {
    const xTop = at(sgn * ARENA_R, yTop);
    const xBot = at(sgn * ARENA_R, yBot);
    const outer = sgn * v.flip > 0 ? v.w + 20 : -20;
    if ((outer > 0 && Math.min(xTop, xBot) > v.w + 20) || (outer < 0 && Math.max(xTop, xBot) < -20)) continue;
    g.save();
    g.beginPath();
    g.moveTo(xTop, wallTop);
    g.lineTo(outer, wallTop);
    g.lineTo(outer, yBot);
    g.lineTo(xBot, yBot);
    g.lineTo(xTop, yTop);
    g.closePath();
    const wf = g.createLinearGradient(0, wallTop, 0, yBot);
    wf.addColorStop(0, st.wall.top);
    wf.addColorStop(1, st.wall.bottom);
    g.fillStyle = wf;
    g.fill();
    g.clip();
    g.strokeStyle = st.wall.line;
    g.lineWidth = 2;
    const rows = 9;
    for (let r = 1; r < rows; r++) {
      const y = wallTop + ((yTop - wallTop) * r) / rows;
      g.beginPath();
      g.moveTo(Math.min(xTop, outer) - 10, y);
      g.lineTo(Math.max(xTop, outer) + 10, y);
      g.stroke();
      if (st.wall.bricks) {
        const bw = v.px(700);
        for (let x = xTop + ((r % 2) * bw) / 2 * sgn * v.flip; Math.abs(x - xTop) < Math.abs(outer - xTop) + bw; x += bw * sgn * v.flip) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y - (yTop - wallTop) / rows);
          g.stroke();
        }
      }
    }
    if (!st.wall.bricks) {
      // Neon strip and hazard band
      g.fillStyle = st.wall.line;
      g.fillRect(Math.min(xTop, outer), wallTop + (yTop - wallTop) * 0.3, Math.abs(outer - xTop), 4);
    }
    // Shade toward the stage: the wall's face catches less light
    const sh = g.createLinearGradient(xTop, 0, xTop + sgn * v.flip * v.px(900), 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.35)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(Math.min(xTop, outer), wallTop, Math.abs(outer - xTop), yBot - wallTop);
    g.restore();
    // Trim
    g.strokeStyle = st.edge;
    g.lineWidth = st.hazard ? 8 : 6;
    if (st.hazard) g.setLineDash([16, 12]);
    g.beginPath();
    g.moveTo(xTop, wallTop);
    g.lineTo(xTop, yTop);
    g.lineTo(xBot, yBot);
    g.stroke();
    g.setLineDash([]);
  }
  // Back edge highlight
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(at(-ARENA_R, yTop), yTop, at(ARENA_R, yTop) - at(-ARENA_R, yTop), 3);
}

/** Layers pre-scaled to the screen (rebuilt only when the screen size changes). */
const scaled = new WeakMap<Stage2D, { key: string; layers: HTMLCanvasElement[] }>();

function scaledLayers(stage: Stage2D, w: number, h: number, dpr: number): HTMLCanvasElement[] {
  const key = `${w}x${h}@${dpr}`;
  const hit = scaled.get(stage);
  if (hit && hit.key === key) return hit.layers;
  const layers = stage.layers.map((l) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(l.canvas, 0, 0, c.width, c.height);
    return c;
  });
  scaled.set(stage, { key, layers });
  return layers;
}

/**
 * Draw the backdrop layers with parallax (they don't zoom: only the floor and heroes do).
 * The big painted layers are scaled to the screen once and then only blitted.
 */
export function drawBackdrop(g: CanvasRenderingContext2D, stage: Stage2D, v: View2D, dpr = 1) {
  // Cover the screen height down to the floor top (plus a little so seams never show)
  const hDst = v.h * (FLOOR_TOP + 0.02) * (REF_H / 710);
  const s = hDst / REF_H;
  const wDst = Math.max(REF_W * s, v.w * 1.15);
  const slack = Math.max(0, wDst - v.w);
  const camN = Math.max(-1, Math.min(1, (v.camX * v.flip) / ARENA_R));
  g.fillStyle = stage.skyTop;
  g.fillRect(0, 0, v.w, v.h);
  const layers = scaledLayers(stage, Math.round(wDst), Math.round(hDst), Math.min(dpr, 1.25));
  stage.layers.forEach((l, k) => {
    const x = (v.w - wDst) / 2 - camN * (slack / 2) * l.parallax + v.ox * l.parallax;
    const lift = (v.groundY - v.h * GROUND) * (0.3 + 0.7 * l.parallax);
    g.drawImage(layers[k]!, x, v.oy * l.parallax + lift, wDst, hDst);
  });
}

export function buildStage2D(id: string): Stage2D {
  return id === 'rooftop-night' ? rooftop() : harbor();
}

const previews = new Map<string, string>();

/** A still of the stage (backdrop, floor and walls) as an image URL, for the arena picker. */
export function stagePreview(id: string, w = 480, h = 270): string {
  const key = `${id}:${w}x${h}`;
  const hit = previews.get(key);
  if (hit) return hit;
  const stage = buildStage2D(id);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const v = new View2D();
  v.w = w;
  v.h = h;
  v.camX = 0;
  v.scale = w / 15000;
  v.groundY = h * GROUND;
  drawBackdrop(g, stage, v);
  stage.floor(g, v, 0);
  const url = c.toDataURL('image/jpeg', 0.85);
  previews.set(key, url);
  return url;
}

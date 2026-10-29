/**
 * Converts the Elie Automata character packs (free, credit "elie automata") into game sprites.
 *
 *   pnpm sprites      # reads assets-src/sprites/*.zip → apps/web/public/sprites/<hero>/
 *
 * For every hero: the side-view ("east") frames of each animation are trimmed and packed into
 * PNG sheets with an atlas.json (feet anchors, contact frames); portraits, skill cards and full
 * art are cropped from the art boards as WebP. Raw packs stay out of git (the licence forbids
 * redistributing them on their own); only the converted files ship inside the game.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets-src/sprites';
const WORK = 'assets-src/sprites/x';
const OUT = 'apps/web/public/sprites';
const SHEET_W = 2048;
const SHEET_H = 2048;

interface AnimCfg {
  /** Folder under Animations/. */
  src: string;
  /** Contact frame override (default: the frame reaching furthest forward). */
  hit?: number;
  fps?: number;
  loop?: boolean;
  /** Use only these source frames [from, to] (inclusive). */
  range?: [number, number];
  /** Play backwards (e.g. getting up = death reversed). */
  reverse?: boolean;
  /** Use exactly these source frames, in this order. */
  pick?: number[];
  /** Facing folder (default east = side view; south faces the camera). */
  dir?: string;
  /** A turn on the spot: frame `pick[0] ?? 0` of every direction, clockwise from east. */
  spin?: boolean;
}

const SPIN = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

interface HeroCfg {
  id: string;
  pack: string;
  /** Hero height in metres (the idle frame's height maps to this). */
  height: number;
  /** Folder holding the animations (default Animations). */
  animDir?: string;
  anims: Record<string, AnimCfg>;
  /** Art board file prefix (complete packs only). */
  art?: string;
  /** Skill card index (0–3 on the board) for skill 1, 2, 3 and the ultimate. */
  cards?: [number, number, number, number];
  /** Packs without art: the sprite frame to crop a portrait from. */
  face?: { src: string; dir: string; frame: number };
  /** Packs with full art but no portrait board: square crop of Fullart_01 for the portrait. */
  faceFromArt?: { left: number; top: number; size: number };
}

const HEROES: HeroCfg[] = [
  {
    id: 'benika',
    pack: 'battle-axemaiden-COMPLETE-FREE',
    height: 1.8,
    art: 'Battle_Axemaiden_',
    cards: [1, 2, 3, 0],
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 14, loop: true },
      attack: { src: 'Attack_Swing', hit: 6 },
      spin: { src: 'Whirling_Axe', pick: [1, 2, 3, 4, 11, 12, 13, 14, 15], hit: 3 },
      s1: { src: 'Earth_Shatter', hit: 7 },
      s2: { src: 'Whirling_Axe', hit: 4 },
      s3: { src: 'War_Cry', hit: 4 },
      ult: { src: 'Crimson_Judgment', hit: 5 },
      death: { src: 'Death' },
    },
  },
  {
    id: 'lysa',
    pack: 'elven-bow-scout-FREE-COMPLETE',
    height: 1.72,
    art: 'Elven_Bow_Scout_',
    cards: [0, 1, 2, 3],
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 14, loop: true },
      attack: { src: 'Shoot_Arrow', hit: 7 },
      dash: { src: 'Wind_Dash', hit: 8 },
      vortex: { src: 'Leaf_Vortex', hit: 9 },
      death: { src: 'Death' },
    },
  },
  {
    id: 'hyoga',
    pack: 'glacierbreaker-knight-FREE-COMPLETE',
    height: 1.95,
    art: 'Glacierbreaker_Knight_',
    cards: [0, 1, 2, 3],
    anims: {
      idle: { src: 'Idle', fps: 8, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      cyclone: { src: 'Frozen_Cyclone', hit: 7 },
      hammerfall: { src: 'Glacial_Hammerfall', hit: 7 },
      death: { src: 'Death' },
    },
  },
  {
    id: 'hyoshin',
    pack: 'glacial-heart-COMPLETE-FREE',
    height: 1.75,
    art: 'Glacial_Heart_',
    cards: [0, 1, 3, 2],
    faceFromArt: { left: 222, top: 330, size: 580 },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      bolt: { src: 'Glacial_Bolt', hit: 10 },
      barrier: { src: 'Frost_Barrier', hit: 7 },
      shatter: { src: 'Death', range: [0, 11], hit: 8 },
      zero: { src: 'Absolute_Zero', hit: 9 },
      death: { src: 'Death' },
    },
  },
  {
    id: 'reo',
    pack: 'shield-knight-FREE',
    height: 1.8,
    face: { src: 'Walk', dir: 'south-east', frame: 3 },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 14, loop: true },
      attack: { src: 'Valiant_Slash', hit: 7 },
    },
  },
  {
    id: 'kage',
    pack: 'Black-Assassin-FREE',
    animDir: 'animations',
    height: 1.75,
    face: { src: 'idle', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'idle', fps: 10, loop: true },
      walk: { src: 'walk', fps: 12, loop: true },
      run: { src: 'run', fps: 14, loop: true },
      jump: { src: 'jump', hit: 5 },
      attack: { src: 'dagger-slash', hit: 3 },
      throw: { src: 'throw', hit: 2 },
      turn: { src: 'idle', spin: true, fps: 24 },
      front: { src: 'idle', dir: 'south', fps: 10, loop: true },
    },
  },
  {
    id: 'gokai',
    pack: 'tentaclebeard-admiral-FREE',
    animDir: 'animations',
    height: 1.85,
    face: { src: 'idle', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'idle', fps: 6, loop: true },
      walk: { src: 'walk', fps: 12, loop: true },
      attack: { src: 'anchor-attack', hit: 2, fps: 10 },
      cast: { src: 'magic-cast', hit: 2, fps: 10 },
      death: { src: 'death', fps: 8 },
      turn: { src: 'idle', spin: true, fps: 24 },
      front: { src: 'idle', dir: 'south', fps: 6, loop: true },
    },
  },
  {
    id: 'yomi',
    pack: 'faceless-void-reaper-FREE',
    height: 1.8,
    face: { src: 'Idle', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      attack: { src: 'Void_Strike', hit: 11 },
      turn: { src: 'Idle', spin: true, fps: 24 },
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
    },
  },
  {
    id: 'kuma',
    pack: 'black-bear-bandit-FREE',
    height: 1.95,
    face: { src: 'Idle_Breathing', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'Idle_Breathing', fps: 8, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      attack: { src: 'Claw_Attack', hit: 4 },
      turn: { src: 'Idle_Breathing', spin: true, fps: 24 },
      front: { src: 'Idle_Breathing', dir: 'south', fps: 8, loop: true },
    },
  },
  {
    id: 'homura',
    pack: 'fire-witch-FREE',
    height: 1.72,
    face: { src: 'Idle', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      turn: { src: 'Idle', spin: true, fps: 24 },
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
      cast: { src: 'Idle', dir: 'south-east', fps: 10, loop: true },
    },
  },
  {
    id: 'dummy',
    pack: 'wasteland-juggernaut-FREE',
    height: 1.85,
    face: { src: 'Idle', dir: 'south-east', frame: 0 },
    anims: { idle: { src: 'Idle', fps: 10, loop: true } },
  },
];

type Frame = [number, number, number, number, number, number, number];

interface Img {
  data: Buffer;
  w: number;
  h: number;
}

async function load(file: string): Promise<Img> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Bounding box of pixels with alpha > 8, or null. */
function bbox(im: Img): [number, number, number, number] | null {
  let x0 = im.w;
  let y0 = im.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      if (im.data[(y * im.w + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

/** Feet of a standing frame: the middle of the lowest rows of pixels. */
function feet(im: Img): [number, number] {
  const b = bbox(im)!;
  let sum = 0;
  let n = 0;
  for (let y = b[3] - 6; y < b[3]; y++)
    for (let x = b[0]; x < b[2]; x++)
      if (im.data[(y * im.w + x) * 4 + 3]! > 8) {
        sum += x;
        n++;
      }
  return [Math.round(n ? sum / n : (b[0] + b[2]) / 2), b[3] - 1];
}

function unzip(pack: string): string {
  const dir = join(WORK, pack);
  if (!existsSync(dir)) {
    const zip = join(SRC, `${pack}.zip`);
    if (!existsSync(zip)) throw new Error(`missing ${zip}`);
    mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-qo', zip, '-d', dir]);
  }
  return dir;
}

/** Shelf packer. */
class Packer {
  sheets: { x: number; y: number; row: number }[] = [{ x: 0, y: 0, row: 0 }];
  place(w: number, h: number): [number, number, number] {
    let s = this.sheets[this.sheets.length - 1]!;
    if (s.x + w > SHEET_W) {
      s.x = 0;
      s.y += s.row + 1;
      s.row = 0;
    }
    if (s.y + h > SHEET_H) {
      s = { x: 0, y: 0, row: 0 };
      this.sheets.push(s);
    }
    const at: [number, number, number] = [this.sheets.length - 1, s.x, s.y];
    s.x += w + 1;
    s.row = Math.max(s.row, h);
    return at;
  }
}

async function hero(cfg: HeroCfg) {
  const dir = unzip(cfg.pack);
  const out = join(OUT, cfg.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // Feet anchor and scale from the first idle frame
  const idleDir = join(dir, cfg.animDir ?? 'Animations', cfg.anims.idle!.src, 'east');
  const idle0 = await load(join(idleDir, readdirSync(idleDir).sort()[0]!));
  const ib = bbox(idle0)!;
  const footX = Math.round((ib[0] + ib[2]) / 2);
  const footY = ib[3] - 1;
  const pxPerM = (ib[3] - ib[1]) / cfg.height;

  const packer = new Packer();
  const pieces: { img: Img; box: [number, number, number, number]; at: [number, number, number] }[] = [];
  const anims: Record<string, { frames: Frame[]; fps: number; loop?: boolean; hit: number }> = {};
  const list = (folder: string) =>
    readdirSync(folder)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => join(folder, f));
  for (const [name, a] of Object.entries(cfg.anims)) {
    let files: string[];
    if (a.spin) {
      files = SPIN.map((d) => list(join(dir, cfg.animDir ?? 'Animations', a.src, d))[a.pick?.[0] ?? 0]!);
    } else {
      files = list(join(dir, cfg.animDir ?? 'Animations', a.src, a.dir ?? 'east'));
      if (a.range) files = files.slice(a.range[0], a.range[1] + 1);
      if (a.pick) files = a.pick.map((i) => files[i]!).filter(Boolean);
    }
    if (a.reverse) files.reverse();
    const frames: Frame[] = [];
    let reach = -1;
    let hit = 0;
    // Some packs draw each animation on a different canvas size: find the feet again
    let fx = footX;
    let fy = footY;
    const first = await load(files[0]!);
    if (first.w !== idle0.w || first.h !== idle0.h) [fx, fy] = feet(first);
    for (const [k, f] of files.entries()) {
      const img = await load(f);
      const box = bbox(img) ?? [fx, fy, fx + 1, fy + 1];
      const w = box[2] - box[0];
      const h = box[3] - box[1];
      const at = packer.place(w, h);
      pieces.push({ img, box, at });
      frames.push([at[0], at[1], at[2], w, h, fx - box[0], fy - box[1]]);
      // Contact: the frame whose pixels reach furthest forward, or cover the most ground
      const score = box[2] + (box[2] - box[0]) * 0.25;
      if (score > reach) {
        reach = score;
        hit = k;
      }
    }
    anims[name] = { frames, fps: a.fps ?? 20, ...(a.loop ? { loop: true } : {}), hit: a.hit ?? hit };
  }

  // Compose sheets
  const sheets: string[] = [];
  for (let s = 0; s < packer.sheets.length; s++) {
    const used = pieces.filter((p) => p.at[0] === s);
    const h = Math.max(...used.map((p) => p.at[2] + (p.box[3] - p.box[1])));
    const w = Math.max(...used.map((p) => p.at[1] + (p.box[2] - p.box[0])));
    const composites = await Promise.all(
      used.map(async (p) => ({
        input: await sharp(p.img.data, { raw: { width: p.img.w, height: p.img.h, channels: 4 } })
          .extract({ left: p.box[0], top: p.box[1], width: p.box[2] - p.box[0], height: p.box[3] - p.box[1] })
          .png()
          .toBuffer(),
        left: p.at[1],
        top: p.at[2],
      })),
    );
    const name = `sheet${s}.png`;
    await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites)
      .png({ compressionLevel: 9, palette: false })
      .toFile(join(out, name));
    sheets.push(name);
  }

  // Art: portraits, skill cards, full art (complete packs); partial packs get a sprite portrait
  const art: Record<string, string> = {};
  const artDir = join(dir, 'Art');
  if (cfg.art && existsSync(artDir)) {
    const files = readdirSync(artDir);
    const find = (part: string) => files.find((f) => f.startsWith(cfg.art!) && f.includes(part));
    const portraits = find('Portraits_8');
    if (portraits) {
      // 4 × 2 grid of expressions; 0 = calm, 1 = shouting
      const crop = async (cell: number, file: string) => {
        const cx = (cell % 4) * 384;
        const cy = Math.floor(cell / 4) * 512;
        await sharp(join(artDir, portraits))
          .extract({ left: cx + 42, top: cy + 70, width: 300, height: 300 })
          .resize(256, 256)
          .webp({ quality: 88 })
          .toFile(join(out, file));
      };
      await crop(0, 'face.webp');
      await crop(1, 'face-shout.webp');
      art.face = 'face.webp';
      art.faceShout = 'face-shout.webp';
    }
    const full = find('Fullart_01');
    if (full && cfg.faceFromArt) {
      const f = cfg.faceFromArt;
      await sharp(join(artDir, full))
        .extract({ left: f.left, top: f.top, width: f.size, height: f.size })
        .resize(256, 256)
        .webp({ quality: 88 })
        .toFile(join(out, 'face.webp'));
      art.face = 'face.webp';
    }
    if (full) {
      await sharp(join(artDir, full)).resize(560, 840).webp({ quality: 86 }).toFile(join(out, 'art.webp'));
      art.full = 'art.webp';
    }
    const skills = files.find((f) => f.startsWith(cfg.art!) && f.endsWith('skills.png'));
    if (skills && cfg.cards) {
      const boxes = [144, 488, 835, 1200];
      for (const [k, card] of cfg.cards.entries()) {
        const name = k === 3 ? 'card-ult.webp' : `card-s${k + 1}.webp`;
        await sharp(join(artDir, skills))
          .extract({ left: boxes[card]!, top: 238, width: 276, height: 262 })
          .resize(240, 240)
          .webp({ quality: 88 })
          .toFile(join(out, name));
        art[k === 3 ? 'cardUlt' : `cardS${k + 1}`] = name;
      }
    }
  }
  if (!art.face) {
    // Head-and-shoulders from a sprite frame, scaled up crisply
    let src = idle0;
    if (cfg.face) {
      const fdir = join(dir, cfg.animDir ?? 'Animations', cfg.face.src, cfg.face.dir);
      src = await load(join(fdir, readdirSync(fdir).sort()[cfg.face.frame]!));
    }
    const fb = bbox(src)!;
    const size = Math.round((fb[3] - fb[1]) * 0.55);
    const cx = Math.round((fb[0] + fb[2]) / 2);
    await sharp(src.data, { raw: { width: src.w, height: src.h, channels: 4 } })
      .extract({ left: Math.max(0, cx - Math.round(size / 2)), top: Math.max(0, fb[1] - 4), width: size, height: size })
      .resize(256, 256, { kernel: 'nearest' })
      .webp({ lossless: true })
      .toFile(join(out, 'face.webp'));
    art.face = 'face.webp';
  }

  const atlas = { sheets, pxPerM: Math.round(pxPerM * 100) / 100, facing: 1, anims, art, credit: 'elie automata' };
  writeFileSync(join(out, 'atlas.json'), JSON.stringify(atlas));
  console.log(
    `${cfg.id.padEnd(8)} ${sheets.length} sheet(s), ${Object.keys(anims)
      .map((n) => `${n}:${anims[n]!.frames.length}@${anims[n]!.hit}`)
      .join(' ')}  art: ${Object.keys(art).join(', ')}`,
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const h of HEROES) {
    if (!existsSync(join(SRC, `${h.pack}.zip`)) && !existsSync(join(WORK, h.pack))) {
      console.warn(`(skip) ${h.id}: ${SRC}/${h.pack}.zip not found`);
      continue;
    }
    await hero(h);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

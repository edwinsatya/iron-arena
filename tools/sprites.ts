/**
 * Converts the character packs (elie automata's free packs, and Void Mantis) into game sprites.
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
  /** Use exactly these source frames, in this order; [folder, frame] takes a frame from another
   * animation (same facing). */
  pick?: (number | [string, number])[];
  /** Facing folder (default east = side view; south faces the camera). */
  dir?: string;
  /** Mirror the frames (a camera-facing view whose swing goes to the wrong side). */
  flip?: boolean;
  /** From another zip: a separate animation update of the same character (its Animations/
   * folder). Drawn at the same size, so only the canvas may differ (the feet are found again). */
  pack?: string;
  /** A turn on the spot: frame `pick[0] ?? 0` of every direction, clockwise from east. */
  spin?: boolean;
  /** Recolour the fire (lantern glass, flames, sparks and the light they cast) sickly green. */
  plague?: boolean;
  /** Not lifted by the hero's `hover` (falls that end on the floor). */
  noHover?: boolean;
  /**
   * New poses made from existing frames: per output frame (array) or as a function of the frame
   * number, a tilt around the feet and a shift. See Xf.
   */
  xf?: Xf[] | ((k: number, n: number) => Xf);
}

/** Frame transform. `rot`: degrees, + = leaning back (head away from the facing). `dx`/`dy`:
 * shift in source pixels (+x = forward, +y = down). `ground`: lift the pose so nothing sinks
 * below the floor line (falls, lying down). */
interface Xf {
  rot?: number;
  dx?: number;
  dy?: number;
  ground?: boolean;
}

/** Room around transformed frames so tilted poses never get clipped. */
const PAD = 72;

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
  /** Packs with an "actions" board instead of a skills board: file suffix and the card crops
   * [left, top, size] for skill 1, 2, 3 and the ultimate. */
  actionCards?: { file: string; rects: [number, number, number][] };
  /** Packs without art: the sprite frame to crop a portrait from. */
  face?: { src: string; dir: string; frame: number };
  /** Packs with full art but no portrait board: square crop of Fullart_01 for the portrait. */
  faceFromArt?: { left: number; top: number; size: number };
  /** Bust crop of the 3/4 frame (source px) when the automatic one misses the head. */
  bust?: { left: number; top: number; size: number };
  /** Floats this many source pixels above the floor (every animation without `noHover`). */
  hover?: number;
  /** Who drew the pack (default elie automata). */
  credit?: string;
  /** The pack's stand-alone VFX update (a separate zip of camera-facing clips). */
  vfx?: VfxCfg;
}

interface VfxCfg {
  pack: string;
  /** Clip folder under VFX/ → its anchor in the source canvas (the point drawn at the spot the
   * effect is placed: the ground under a column, the middle of a ring). */
  clips: Record<string, [number, number]>;
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
    id: 'akari',
    pack: 'young-swordswoman-COMPLETE-FREE',
    height: 1.7,
    art: 'Young_Swordswoman_',
    actionCards: {
      file: 'character_actions.png',
      // Rising slash, downward slash, overhead slash, spell chant (picture area of each card)
      rects: [
        [111, 880, 255],
        [856, 520, 255],
        [482, 880, 255],
        [856, 880, 255],
      ],
    },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      run: { src: 'Run', fps: 14, loop: true },
      jump: { src: 'Jump' },
      hurt: { src: 'Recoil' },
      down: { src: 'Downward_Sword_Slash', hit: 6 },
      rise: { src: 'Rising_Sword_Slash', hit: 7 },
      over: { src: 'Overhead_Slash', hit: 3 },
      chant: { src: 'Spell_Chant', hit: 3 },
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
    // The Hooded Rogue's VFX update: a rune ring of hooked chains, a violet shroud, a venom pool
    vfx: {
      pack: 'hooded-rogue-assassin-VFX-FREE',
      clips: {
        Umbral_Gravebind: [128, 152],
        Veil_of_the_Forgotten: [128, 191],
        Venomshade_Miasma: [128, 160],
      },
    },
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
    vfx: {
      pack: 'faceless-void-reaper-VFX-FREE',
      clips: { Void_Arcane_Surge: [128, 128], Void_Awakening: [128, 128], Void_Triple_Claw: [128, 128] },
    },
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
    vfx: {
      pack: 'fire-witch-VFX-FREE',
      clips: {
        Fireball_Radial_Burst: [128, 128],
        Inferno_Pillar: [128, 206],
        Protective_Fire_Ring: [128, 132],
        Infernal_Cataclysm_Gothic: [128, 183],
        Infernal_Cataclysm_Area: [128, 212],
      },
    },
    face: { src: 'Idle', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      turn: { src: 'Idle', spin: true, fps: 24 },
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
      cast: { src: 'Idle', dir: 'south-east', fps: 10, loop: true },
    },
  },
  {
    // The free pack has idle, walk, jump and one lantern swing (8 directions). Everything else is
    // built from those frames: re-timed picks, the front and 3/4 views, green plague fire, tilts.
    id: 'karasu',
    pack: 'plague-doctor-FREE',
    height: 1.75,
    face: { src: 'Idle', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      // Leaning into the stride
      run: { src: 'Walk', fps: 20, loop: true, xf: (k) => ({ rot: -8, dy: k % 9 < 4 ? -1 : 0 }) },
      // Crouch, spring, tuck, cloak flaring on the way down
      jump: { src: 'Jump', pick: [8, 10, 12, 15, 16] },
      land: { src: 'Jump', pick: [16, 17, 18, 19, 20] },
      // Huddled behind the cloak
      guard: { src: 'Jump', pick: [7, 7] },
      hurt: {
        src: 'Jump',
        pick: [7, 7, 6, 5, 4],
        xf: [{ rot: 8, dx: -3 }, { rot: 16, dx: -7 }, { rot: 12, dx: -5 }, { rot: 6, dx: -2 }, { rot: 2 }],
      },
      // Knocked off the feet: tilts back, curls up and lands on the back (getting up = reversed)
      death: {
        src: 'Jump',
        pick: [7, 7, ['Idle', 0], ['Idle', 0], ['Idle', 0], ['Idle', 0], ['Idle', 0], ['Idle', 0]],
        xf: [
          { rot: 10, dx: -3 },
          { rot: 28, dx: -8, ground: true },
          { rot: 50, dx: -12, ground: true },
          { rot: 72, dx: -14, ground: true },
          { rot: 90, dx: -14, dy: -5, ground: true },
          { rot: 90, dx: -14, ground: true },
          { rot: 88, dx: -14, ground: true },
          { rot: 90, dx: -14, ground: true },
        ],
      },
      attack: { src: 'Basic_Attack', hit: 6 },
      // Back-swing seen from three quarters
      swing2: { src: 'Basic_Attack', dir: 'south-east', hit: 5 },
      // Facing out: raise the fist, then smash the lantern down in a burst of fire
      slam: { src: 'Basic_Attack', dir: 'south', hit: 7 },
      plague: { src: 'Basic_Attack', hit: 6, plague: true },
      // Throwing a flask: the swing without its fire arc
      toss: { src: 'Basic_Attack', pick: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15], hit: 5 },
      // Holding the green lantern out while crows pour from it
      present: {
        src: 'Basic_Attack',
        pick: [2, 3, 4, 5, 8, 9, 8, 9, 8, 9, 10, 11, 12, 13, 14, 15],
        hit: 4,
        plague: true,
      },
      // Pulling the cloak around and sinking into it
      veil: { src: 'Jump', pick: [4, 5, 6, 7, 8, 8, 9, 10], hit: 4 },
      // Ultimate: fist raised, the lantern burning green and trembling with power, then the smash
      ultcast: {
        src: 'Basic_Attack',
        dir: 'south',
        plague: true,
        pick: [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          ...[5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5],
          7,
          8,
          8,
          9,
          10,
          11,
          13,
          15,
        ],
        hit: 6,
      },
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
      win: { src: 'Basic_Attack', dir: 'south', pick: [0, 1, 2, 3, 4, 5, 6], plague: true },
    },
  },
  {
    // Void Mantis (a free pack, not elie automata's): a walk and one slash in 8 directions, and
    // one-frame idle, flying and dead poses. Everything else is built from those frames.
    id: 'kamakiri',
    pack: 'Void_Mantis_Pixel_Art_v1.0',
    animDir: 'Void_Mantis_Pixel_Art_v1.0',
    height: 1.7,
    credit: 'Void Mantis Pixel Art v1.0',
    face: { src: 'Idle', dir: 'south-east', frame: 0 },
    bust: { left: 100, top: 86, size: 92 },
    anims: {
      // The one-frame idle, breathing: rising and settling
      idle: {
        src: 'Idle',
        pick: [0, 0, 0, 0],
        fps: 4,
        loop: true,
        xf: [{}, { dy: -1 }, { dy: -2 }, { dy: -1 }],
      },
      walk: { src: 'Walk', fps: 12, loop: true },
      run: { src: 'Walk', fps: 18, loop: true, xf: (k) => ({ rot: -6, dy: k % 7 < 3 ? -1 : 0 }) },
      // Wings out: tail down on the way up, nose down on the way down
      jump: { src: 'Flying', pick: [0, 0, 0, 0], xf: [{ rot: 8 }, { dy: -2 }, { rot: -6 }, { rot: -12 }] },
      // Blades folded up in front of the face
      guard: { src: 'Walk', pick: [3, 3] },
      hurt: {
        src: 'Idle',
        pick: [0, 0, 0, 0, 0],
        xf: (k) => ({ rot: [8, 16, 12, 6, 2][k], dx: [-3, -7, -5, -2, 0][k], ground: true }),
      },
      // Knocked off its feet: rears back, then crumples onto its belly (getting up = reversed)
      death: {
        src: 'Idle',
        pick: [0, 0, 0, ['Dead', 0], ['Dead', 0], ['Dead', 0]],
        xf: [
          { rot: 10, dx: -4, ground: true },
          { rot: 24, dx: -8, ground: true },
          { rot: 34, dx: -10, ground: true },
          { dx: -12, ground: true },
          { dx: -12, dy: -3, ground: true },
          { dx: -12, ground: true },
        ],
      },
      attack: { src: 'Attack', hit: 3 },
      // One scythe, then the other: the slash twice (the second wind blade lands on the second)
      double: { src: 'Attack', pick: [0, 1, 2, 3, 4, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4], hit: 3 },
      // The scythes whirl round in a full circle, seen from three quarters
      spin: { src: 'Attack', dir: 'south-east', hit: 1 },
      // Facing out: both blades raised, then brought down crossed
      twin: { src: 'Attack', dir: 'south', hit: 4 },
      // The forelegs shoot out and snap shut
      snare: {
        src: 'Walk',
        pick: [3, 3, ['Attack', 4], ['Attack', 4], ['Attack', 0]],
        xf: [{}, { rot: 4, dx: -3 }, { rot: -14, dx: 16 }, { rot: -8, dx: 10 }, {}],
        hit: 2,
      },
      // Wings beating as it hovers
      fly: {
        src: 'Flying',
        pick: [0, 0, 0, 0],
        fps: 10,
        loop: true,
        xf: [{}, { dy: -3 }, { dy: -5 }, { dy: -3 }],
      },
      // Diving: nose down, the slash at the bottom of the dive
      dive: {
        src: 'Flying',
        pick: [0, 0, ['Attack', 2], ['Attack', 3], ['Attack', 3], ['Attack', 4]],
        xf: [{ rot: 6 }, { rot: -16 }, { rot: -28 }, { rot: -32 }, { rot: -24 }, { rot: -8 }],
        hit: 3,
      },
      front: {
        src: 'Idle',
        dir: 'south',
        pick: [0, 0, 0, 0],
        fps: 4,
        loop: true,
        xf: [{}, { dy: -1 }, { dy: -2 }, { dy: -1 }],
      },
      // Facing out on the wing: the ultimate
      hover: {
        src: 'Flying',
        dir: 'south',
        pick: [0, 0, 0, 0],
        fps: 10,
        loop: true,
        xf: [{}, { dy: -3 }, { dy: -5 }, { dy: -3 }],
      },
      win: { src: 'Attack', dir: 'south', pick: [0, 1, 2, 3], hit: 3 },
    },
  },
  {
    // Abyssal Jelly (free complete pack): idle, move, a tentacle lash and a death, 8 directions.
    // It floats a little off the floor; the guard, the flinch, the pulse and the gaze come from
    // those frames.
    id: 'kurage',
    pack: 'abyssal-jelly-COMPLETE-FREE',
    height: 1.6,
    hover: 12,
    face: { src: 'Idle', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Move', fps: 12, loop: true },
      run: { src: 'Move', fps: 18, loop: true, xf: () => ({ rot: -6 }) },
      // Shrinking into its bell
      guard: { src: 'Death', pick: [15, 16] },
      // A shudder, the eye flashing
      hurt: { src: 'Death', pick: [1, 2, 3, 4, 5] },
      // Collapses into a puddle on the floor (getting up = re-forming)
      death: {
        src: 'Death',
        noHover: true,
        xf: (k, n) => ({ dy: -Math.round(12 * (1 - k / (n - 1))), ground: true }),
      },
      attack: { src: 'Basic_Attack', hit: 8 },
      // The lash seen from three quarters: a bigger spark at the tip
      lash: { src: 'Basic_Attack', dir: 'south-east', hit: 10 },
      // The bell swelling with light
      pulse: { src: 'Idle', pick: [0, 1, 2, 3, 4, 4, 4, 3, 2, 1], hit: 4 },
      // Facing out, the great eye open
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
      gaze: { src: 'Basic_Attack', dir: 'south', hit: 10 },
      win: { src: 'Idle', dir: 'south', fps: 10, loop: true },
    },
  },
  {
    // Cyberpunk Street Assassin (free complete pack): a gauntlet brawler. One punch animation,
    // so the combo also uses its 3/4 view, the straight arm of the ultimate and, seen from the
    // front, the hammer fist. The death ends on her knees; the last frames tip her onto her back.
    id: 'kemuri',
    pack: 'cyberpunk-street-assassin-COMPLETE-FREE',
    height: 1.72,
    // Stand-alone clips named after her skills (the pack's own VFX folder)
    vfx: {
      pack: 'cyberpunk-street-assassin-COMPLETE-FREE',
      clips: {
        Cindertrace_Brand: [128, 128],
        Violet_Vein_Priming: [128, 128],
        Crimson_Smokescreen_Order: [128, 172],
        Last_Breath_Protocol: [128, 128],
      },
    },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      run: { src: 'Walk', fps: 18, loop: true, xf: () => ({ rot: -7 }) },
      // Fists up
      guard: { src: 'Crimson_Smokescreen_Order', pick: [1, 2] },
      hurt: {
        src: 'Death',
        pick: [7, 8, 9, 8, 7],
        xf: [{ rot: 6, dx: -2 }, { rot: 12, dx: -5 }, { rot: 10, dx: -4 }, { rot: 5, dx: -2 }, {}],
      },
      death: {
        src: 'Death',
        pick: [8, 9, 10, 11, 12, 13, 13, 13],
        xf: [
          {},
          {},
          {},
          {},
          { rot: 18, dx: -4, ground: true },
          { rot: 48, dx: -9, ground: true },
          { rot: 80, dx: -12, dy: -4, ground: true },
          { rot: 90, dx: -12, ground: true },
        ],
      },
      // The punch without its wind-up
      jab: { src: 'Smokestrike_Jab', pick: [0, 2, 8, 9, 10, 14, 15], hit: 2 },
      // The other hand, seen from three quarters
      jab2: { src: 'Smokestrike_Jab', dir: 'south-east', pick: [0, 1, 6, 7, 8, 9, 13, 15], hit: 3 },
      // A straight right: the arm of the ultimate without the charge
      cross: { src: 'Last_Breath_Protocol', pick: [0, 3, 5, 16, 17, 18, 20, 22, 23], hit: 3 },
      smokestrike: { src: 'Smokestrike_Jab', hit: 8 },
      // Facing out: a hammer fist into the floor
      slam: { src: 'Smokestrike_Jab', dir: 'south', hit: 10 },
      brand: { src: 'Cindertrace_Brand', hit: 12 },
      prime: { src: 'Violet_Vein_Priming', hit: 12 },
      screen: { src: 'Crimson_Smokescreen_Order', hit: 8 },
      ult: { src: 'Last_Breath_Protocol', hit: 16 },
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
    },
  },
  {
    // Cyberpunk Sword Huntress (free complete pack): every skill has its own animation. The
    // quick cuts of the combo and the lunge are the big moves without their wind-ups.
    id: 'raika',
    pack: 'cyberpunk-sword-huntress-COMPLETE-FREE',
    height: 1.74,
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      run: { src: 'Walk', fps: 18, loop: true, xf: () => ({ rot: -7 }) },
      // The gauntlet held out, palm first
      guard: { src: 'Gauntlet_Polarity_Lock', pick: [5, 6] },
      hurt: { src: 'Death', pick: [5, 6, 7, 8, 9] },
      death: { src: 'Death', range: [8, 23] },
      cut: { src: 'Plasma_Seam_Ripper', pick: [0, 7, 9, 11, 12, 13, 14, 16, 19], hit: 4 },
      thrust: { src: 'Magenta_Circuit_Break', pick: [0, 3, 4, 5, 6, 7, 16, 18, 19], hit: 3 },
      ripper: { src: 'Plasma_Seam_Ripper', hit: 12 },
      // The pack's alternate side view of the same skill: a low rising sweep, then the thrust
      seam: {
        src: 'Plasma_Seam_Ripper',
        dir: 'east-alternate-1',
        pick: [2, 5, 6, 7, 8, 9, 10, 12, 14, 16, 19],
        hit: 4,
      },
      breaker: { src: 'Magenta_Circuit_Break', hit: 8 },
      lock: { src: 'Gauntlet_Polarity_Lock', hit: 8 },
      decoy: { src: 'Violet_Mantle_Decoy', hit: 6 },
      // The dash of the ultimate without the charge
      lunge: { src: 'Last_Circuit_Execution', pick: [0, 3, 15, 16, 17, 18, 20, 22, 23], hit: 2 },
      ult: { src: 'Last_Circuit_Execution', hit: 15 },
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
      // Facing out, the hunter's eye lit
      win: { src: 'Cyan_Hunter_S_Calibration', dir: 'south', pick: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    },
  },
  {
    // Lightning Academy Magister (free complete pack): a rod, a bronze gauntlet and six spells,
    // plus stand-alone VFX clips (amber dome, counter flash, target sigil, bolts, rune circle).
    id: 'ikazuchi',
    pack: 'lightning-academy-magister-COMPLETE-FREE',
    height: 1.7,
    vfx: {
      pack: 'lightning-academy-magister-COMPLETE-FREE',
      clips: {
        Area_Ultimate: [128, 128],
        Defensive_Buff: [128, 214],
        Defensive_Counter: [128, 128],
        Distant_Target: [128, 130],
        Outward_Projectiles: [128, 128],
        Stationary_Area: [128, 240],
      },
    },
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      run: { src: 'Walk', fps: 18, loop: true, xf: () => ({ rot: -7 }) },
      // Wrapped in the stormcloak
      guard: { src: 'Stormcloak_Insulation', pick: [6, 7] },
      hurt: { src: 'Death', pick: [1, 2, 3, 2, 1] },
      death: { src: 'Death' },
      // The rod's thrust without its wind-up
      jab: { src: 'Gothic_Rod_Discharge', pick: [3, 5, 6, 7, 9, 11, 14, 17], hit: 2 },
      // The gauntlet's short hook
      knuckle: { src: 'Bronze_Polarity_Reversal', pick: [0, 4, 7, 8, 9, 10, 12, 15, 18], hit: 4 },
      discharge: { src: 'Gothic_Rod_Discharge', hit: 6 },
      imprint: { src: 'Amber_Charge_Imprint', hit: 8 },
      reversal: { src: 'Bronze_Polarity_Reversal', hit: 9 },
      relay: { src: 'Golden_Circuit_Relay', hit: 10 },
      cloak: { src: 'Stormcloak_Insulation', hit: 11 },
      theorem: { src: 'The_Amber_Resonance_Theorem', hit: 9 },
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
      // Facing out, arms open, the circuit lit around him
      win: { src: 'Golden_Circuit_Relay', dir: 'south', pick: [0, 2, 4, 6, 8, 10, 12, 13, 14] },
    },
  },
  {
    // Sanctuary Seraph (free complete pack): a staff, great wings and five holy skills.
    id: 'amane',
    pack: 'sanctuary-seraph-COMPLETE-FREE',
    height: 1.78,
    anims: {
      idle: { src: 'Idle', fps: 10, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      run: { src: 'Walk', fps: 18, loop: true, xf: () => ({ rot: -6 }) },
      // Wings drawn around her
      guard: { src: 'Featherbound_Oath', pick: [3, 4] },
      hurt: { src: 'Death', pick: [1, 2, 3, 2, 1] },
      death: { src: 'Death' },
      staff: { src: 'Gothic_Staff_Convergence' },
      // A buffet of the wing without the whole wingbeat
      wing: { src: 'Seraphic_Wingbeat', pick: [0, 4, 8, 11, 12, 13, 14, 17, 20, 23], hit: 4 },
      // Pointing the verdict down without the halo's wind-up
      point: { src: 'Sunspoke_Verdict', pick: [0, 5, 7, 8, 9, 10, 13, 16, 19], hit: 3 },
      verdict: { src: 'Sunspoke_Verdict', hit: 8 },
      oath: { src: 'Featherbound_Oath', hit: 10 },
      wingbeat: { src: 'Seraphic_Wingbeat', hit: 13 },
      halo: { src: 'The_Unbroken_Halo', hit: 12 },
      front: { src: 'Idle', dir: 'south', fps: 10, loop: true },
      win: { src: 'Featherbound_Oath', dir: 'south', pick: [0, 2, 4, 6, 8, 9, 10, 11, 12] },
    },
  },
  {
    // Northern Pack Goat (free complete pack): only idles, walks and a stride, loaded and
    // unloaded. It fights loaded; every attack is built from those frames with tilts.
    id: 'tsuno',
    pack: 'northern-pack-goat-COMPLETE-FREE',
    height: 1.45,
    // The head, not the pack piled above it
    bust: { left: 64, top: 30, size: 58 },
    anims: {
      idle: { src: 'Loaded_Idle', fps: 10, loop: true },
      walk: { src: 'Loaded_Walk', fps: 12, loop: true },
      run: { src: 'Loaded_Stride', fps: 18, loop: true, xf: () => ({ rot: -4 }) },
      // Springing up, forelegs first; nose down on the way down
      jump: {
        src: 'Loaded_Stride',
        pick: [2, 4, 6, 8, 10],
        xf: [{ rot: 6 }, { rot: 14, dy: -2 }, { rot: 8 }, { rot: -4 }, { rot: -10 }],
      },
      // Head down, horns to the front, braced
      guard: { src: 'Loaded_Idle', pick: [8, 8], xf: () => ({ rot: -9, dy: 1, ground: true }) },
      hurt: {
        src: 'Loaded_Idle',
        pick: [0, 0, 0, 0, 0],
        xf: (k) => ({ rot: [8, 16, 12, 6, 2][k], dx: [-3, -7, -5, -2, 0][k], ground: true }),
      },
      // Bowled over: tips back and lands with its legs in the air (getting up = reversed)
      death: {
        src: 'Loaded_Idle',
        pick: [0, 0, 0, 0, 0, 0, 0, 0],
        xf: [
          { rot: 12, dx: -3, ground: true },
          { rot: 40, dx: -8, ground: true },
          { rot: 80, dx: -12, ground: true },
          { rot: 125, dx: -14, ground: true },
          { rot: 165, dx: -14, dy: -4, ground: true },
          { rot: 180, dx: -14, ground: true },
          { rot: 176, dx: -14, ground: true },
          { rot: 180, dx: -14, ground: true },
        ],
      },
      // Rocks back, then drives the horns forward
      butt: {
        src: 'Loaded_Stride',
        pick: [0, 0, 1, 2, 2, 3, 4],
        xf: [
          { rot: 6, dx: -3 },
          { rot: 12, dx: -8 },
          { rot: -14, dx: 14 },
          { rot: -10, dx: 11 },
          { rot: -6, dx: 6 },
          { rot: -2, dx: 2 },
          {},
        ],
        hit: 2,
      },
      // Rears up on the hind legs and brings the forehooves down
      rear: {
        src: 'Loaded_Idle',
        pick: [0, 0, 0, 0, 0, 0, 0, 0],
        xf: [
          { rot: 10, dx: -2, ground: true },
          { rot: 24, dx: -5, ground: true },
          { rot: 36, dx: -7, ground: true },
          { rot: 40, dx: -7, dy: -2, ground: true },
          { rot: 14, dx: 2, ground: true },
          { rot: -8, dx: 6, ground: true },
          { rot: -4, dx: 3, ground: true },
          { ground: true },
        ],
        hit: 5,
      },
      // Head low, the stride at full tilt
      ram: { src: 'Loaded_Stride', fps: 24, xf: () => ({ rot: -10, dx: 4 }) },
      // Nose to the ground, picking up the trail, then off at a gallop
      trail: {
        src: 'Loaded_Stride',
        pick: [
          ['Loaded_Idle', 0],
          ['Loaded_Idle', 1],
          ['Loaded_Idle', 2],
          ['Loaded_Idle', 3],
          0,
          2,
          4,
          6,
          8,
          10,
          12,
        ],
        xf: (k) => (k < 4 ? { rot: -18, dx: 2, ground: true } : { rot: -10, dx: 4 }),
        hit: 6,
      },
      // Hunkered down into its winter coat
      hunker: {
        src: 'Loaded_Idle',
        pick: [0, 0, 0, 0, 0, 0],
        xf: [{}, { dy: 1 }, { dy: 2 }, { dy: 3 }, { dy: 3 }, { dy: 2 }],
        hit: 3,
      },
      front: { src: 'Loaded_Idle', dir: 'south', fps: 10, loop: true },
      win: { src: 'Loaded_Idle', dir: 'south-east', fps: 10, loop: true },
    },
  },
  {
    // Female Hero Pixel Art v1.1 (a free pack with no author named): an armoured knight with a
    // longsword, every move in 8 directions (two extra slashes face the camera only), plus its
    // separate update with two holy spells (256 px canvas instead of 320, same size on screen).
    id: 'shirogane',
    pack: 'Female_Hero_Pixel_Art_v1.1',
    animDir: 'Female_Hero_Pixel_Art_v1.1',
    height: 1.72,
    credit: 'Female Hero Pixel Art v1.1',
    face: { src: 'Idle', dir: 'south-east', frame: 0 },
    anims: {
      idle: { src: 'Idle', fps: 8, loop: true },
      walk: { src: 'Walk', fps: 12, loop: true },
      run: { src: 'Run', fps: 14, loop: true },
      jump: { src: 'Jump' },
      // Sword held out, braced
      guard: { src: 'Guard', pick: [0, 4] },
      hurt: { src: 'Hurt', pick: [1, 2, 3, 4, 6, 8] },
      // She drops to her knees; the last frames tip her onto her back (getting up = reversed)
      death: {
        src: 'Death',
        pick: [0, 2, 4, 5, 6, 7, 7, 7],
        xf: [
          {},
          {},
          {},
          {},
          { rot: 14, dx: -3, ground: true },
          { rot: 40, dx: -8, ground: true },
          { rot: 72, dx: -12, ground: true },
          { rot: 88, dx: -12, ground: true },
        ],
      },
      // The diagonal slash without its wind-up
      cut: { src: 'Attack', pick: [0, 2, 3, 4, 5, 6, 8], hit: 2 },
      // The same slash from three quarters, the blade swung back across
      cut2: { src: 'Attack', dir: 'south-east', hit: 6 },
      slash: { src: 'Attack', hit: 3 },
      // Facing out: the blade coiled overhead, then brought down (mirrored so it swings forward)
      coil: { src: 'Attack2', dir: 'south', flip: true, hit: 6 },
      // Facing out: wound up low, then a wide sweep (mirrored so it sweeps forward)
      sweep: { src: 'Attack3', dir: 'south', flip: true, hit: 7 },
      // The palm pushed out, a spark of light leaving it
      cast: { src: 'Basic_Holy_Spell_Cast', pack: 'female-hero-NEW-ANIMATIONS-FREE', hit: 4 },
      // Facing out: light gathering between her hands
      bless: { src: 'Basic_Holy_Spell_Cast', pack: 'female-hero-NEW-ANIMATIONS-FREE', dir: 'south', hit: 11 },
      // The hand raised to gather the dawn, then pointed: the flash
      judgment: { src: 'Dawnpiercer_Judgment', pack: 'female-hero-NEW-ANIMATIONS-FREE', hit: 15 },
      front: { src: 'Idle', dir: 'south', fps: 8, loop: true },
      // Facing out, the hand raised and the dawn coming down on it
      win: {
        src: 'Dawnpiercer_Judgment',
        pack: 'female-hero-NEW-ANIMATIONS-FREE',
        dir: 'south',
        pick: [0, 2, 4, 5, 6, 7, 8, 9, 10],
      },
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

/** Hue (degrees), saturation and value (0..1). */
function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx / 255];
}

function fromHsv(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Which pixels are fire: thick bright-orange areas (lantern glass, flame arcs) and very hot
 * pixels seed a flood through flame-coloured neighbours; floating specks and thin strokes in
 * the air are sparks. Thin gold trims on the clothes are neither thick nor floating, so they
 * keep their colour.
 */
function fireMask(im: Img): Uint8Array {
  const { w: W, h: H, data } = im;
  const N = W * H;
  const alpha = new Uint8Array(N);
  const warm = new Uint8Array(N);
  const fireish = new Uint8Array(N);
  const loose = new Uint8Array(N);
  const hot = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (data[i * 4 + 3]! < 10) continue;
    alpha[i] = 1;
    const [h, s, v] = hsv(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
    const red = h <= 15 || h >= 345;
    if ((h <= 62 || h >= 350) && s >= 0.5 && v >= 0.55) warm[i] = 1;
    if ((h <= 68 || h >= 340) && ((v >= 0.75 && s >= 0.12) || (red && s >= 0.45 && v >= 0.28)))
      fireish[i] = 1;
    if ((h <= 45 || h >= 340) && s >= 0.45 && v >= 0.35) loose[i] = 1;
    if ((h >= 5 && h <= 28 && s >= 0.82 && v >= 0.85) || (h >= 35 && h <= 58 && s >= 0.78 && v >= 0.95))
      hot[i] = 1;
  }
  const around = (i: number, f: (j: number) => void) => {
    const x = i % W;
    const y = (i / W) | 0;
    for (let yy = y - 1; yy <= y + 1; yy++)
      for (let xx = x - 1; xx <= x + 1; xx++)
        if ((yy !== y || xx !== x) && yy >= 0 && yy < H && xx >= 0 && xx < W) f(yy * W + xx);
  };
  const air = (i: number) => {
    let n = 0;
    around(i, (j) => (n += alpha[j] ? 0 : 1));
    return n;
  };
  // Thick warm areas survive a 3×3 erosion; drop the tiny ones (a thick bit of trim)
  const core = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!warm[i]) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
    let all = true;
    around(i, (j) => (all &&= warm[j] === 1));
    if (all) core[i] = 1;
  }
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!core[i] || seen[i]) continue;
    const comp = [i];
    seen[i] = 1;
    for (let q = 0; q < comp.length; q++)
      around(comp[q]!, (j) => {
        if (core[j] && !seen[j]) {
          seen[j] = 1;
          comp.push(j);
        }
      });
    if (comp.length < 5) for (const j of comp) core[j] = 0;
  }
  // Flood from the cores and hot pixels through flame colours
  const out = new Uint8Array(N);
  const depth = new Int16Array(N);
  const queue: number[] = [];
  for (let i = 0; i < N; i++)
    if (core[i] || hot[i]) {
      out[i] = 1;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    if (depth[i]! >= 90) continue;
    around(i, (j) => {
      if (fireish[j] && !out[j]) {
        out[j] = 1;
        depth[j] = depth[i]! + 1;
        queue.push(j);
      }
    });
  }
  // Sparks floating in the air, then thin strokes touching them
  for (let i = 0; i < N; i++) if (!out[i] && (warm[i] || fireish[i] || loose[i]) && air(i) >= 4) out[i] = 1;
  for (let pass = 0; pass < 3; pass++) {
    const add: number[] = [];
    for (let i = 0; i < N; i++) {
      if (out[i] || !(fireish[i] || loose[i]) || air(i) < 2) continue;
      let touch = false;
      around(i, (j) => (touch ||= out[j] === 1));
      if (touch) add.push(i);
    }
    for (const i of add) out[i] = 1;
  }
  return out;
}

/** The fire turns plague-green: orange → green, yellow cores → pale lime, gradients kept. */
function plague(im: Img): Img {
  const mask = fireMask(im);
  const data = Buffer.from(im.data);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const [h0, s, v] = hsv(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
    const h = h0 >= 300 ? h0 - 360 : h0;
    const [r, g, b] = fromHsv(100 + (h - 10) * 0.55, Math.min(1, s * 0.95), v);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
  }
  return { data, w: im.w, h: im.h };
}

/** Left–right mirror image. */
function mirror(im: Img): Img {
  const data = Buffer.alloc(im.data.length);
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      im.data.copy(data, (y * im.w + (im.w - 1 - x)) * 4, (y * im.w + x) * 4, (y * im.w + x) * 4 + 4);
  return { data, w: im.w, h: im.h };
}

/** Tilt and shift a frame around its feet (nearest neighbour, so the pixels stay crisp). */
function transform(im: Img, foot: [number, number], xf: Xf): Img {
  const W = im.w + PAD * 2;
  const H = im.h + PAD * 2;
  const px = foot[0] + PAD;
  const py = foot[1] + PAD;
  const th = (-(xf.rot ?? 0) * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const out = Buffer.alloc(W * H * 4);
  let lift = 0;
  const sample = (X: number, Y: number): number => {
    // Inverse: source = R(-θ)·(dest − pivot − d) + pivot
    const ux = X + 0.5 - px - (xf.dx ?? 0);
    const uy = Y + 0.5 - py - (xf.dy ?? 0) + lift;
    const sx = Math.floor(ux * cos + uy * sin + px - PAD);
    const sy = Math.floor(-ux * sin + uy * cos + py - PAD);
    if (sx < 0 || sy < 0 || sx >= im.w || sy >= im.h) return -1;
    return (sy * im.w + sx) * 4;
  };
  const render = () => {
    out.fill(0);
    let bottom = -1;
    for (let Y = 0; Y < H; Y++)
      for (let X = 0; X < W; X++) {
        const s = sample(X, Y);
        if (s < 0 || im.data[s + 3]! < 8) continue;
        const d = (Y * W + X) * 4;
        out[d] = im.data[s]!;
        out[d + 1] = im.data[s + 1]!;
        out[d + 2] = im.data[s + 2]!;
        out[d + 3] = im.data[s + 3]!;
        bottom = Math.max(bottom, Y);
      }
    return bottom;
  };
  const bottom = render();
  if (xf.ground && bottom > py) {
    lift = bottom - py;
    render();
  }
  return { data: out, w: W, h: H };
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

/** The frames of an animation folder, in order. Packs with one-frame states (Void Mantis) keep
 * those as `<State>/<facing>.png` instead of a folder. */
function list(folder: string): string[] {
  if (!existsSync(folder)) return existsSync(`${folder}.png`) ? [`${folder}.png`] : [];
  return readdirSync(folder)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => join(folder, f));
}

async function hero(cfg: HeroCfg) {
  const dir = unzip(cfg.pack);
  const out = join(OUT, cfg.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const anim = (src: string, facing: string, pack?: string) =>
    list(
      pack
        ? join(unzip(pack), 'Animations', src, facing)
        : join(dir, cfg.animDir ?? 'Animations', src, facing),
    );

  // Feet anchor and scale from the first idle frame
  const idle0 = await load(anim(cfg.anims.idle!.src, 'east')[0]!);
  const ib = bbox(idle0)!;
  const footX = Math.round((ib[0] + ib[2]) / 2);
  const footY = ib[3] - 1;
  const pxPerM = (ib[3] - ib[1]) / cfg.height;

  const packer = new Packer();
  const pieces: { img: Img; box: [number, number, number, number]; at: [number, number, number] }[] = [];
  const anims: Record<string, { frames: Frame[]; fps: number; loop?: boolean; hit: number }> = {};
  for (const [name, a] of Object.entries(cfg.anims)) {
    let files: string[];
    if (a.spin) {
      const at = typeof a.pick?.[0] === 'number' ? a.pick[0] : 0;
      files = SPIN.map((d) => anim(a.src, d, a.pack)[at]!);
    } else {
      files = anim(a.src, a.dir ?? 'east', a.pack);
      if (a.range) files = files.slice(a.range[0], a.range[1] + 1);
      if (a.pick) {
        const all = files;
        files = a.pick
          .map((i) => (typeof i === 'number' ? all[i] : anim(i[0], a.dir ?? 'east', a.pack)[i[1]]))
          .filter((f): f is string => !!f);
      }
    }
    if (!files.length) throw new Error(`${cfg.id}.${name}: no frames in ${a.src}`);
    if (a.reverse) files.reverse();
    const frames: Frame[] = [];
    let reach = -1;
    let hit = 0;
    // Some packs draw each animation on a different canvas size: find the feet again
    let fx = footX;
    let fy = footY;
    const first = await load(files[0]!);
    if (first.w !== idle0.w || first.h !== idle0.h) [fx, fy] = feet(first);
    if (a.flip) fx = first.w - 1 - fx;
    const foot: [number, number] = [fx, fy];
    const lift = a.noHover ? 0 : (cfg.hover ?? 0);
    const moved = !!a.xf || lift > 0;
    if (moved) {
      fx += PAD;
      fy += PAD;
    }
    for (const [k, f] of files.entries()) {
      let img = await load(f);
      if (a.flip) img = mirror(img);
      if (a.plague) img = plague(img);
      if (moved) {
        const xf = (typeof a.xf === 'function' ? a.xf(k, files.length) : a.xf?.[k]) ?? {};
        img = transform(img, foot, { ...xf, dy: (xf.dy ?? 0) - lift });
      }
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

  // Pixel bust for every hero (HUD, select grid): head and shoulders of the 3/4 idle frame,
  // centred on the upper body so a long weapon doesn't pull the crop sideways
  {
    const bfile = anim(cfg.face?.src ?? cfg.anims.idle!.src, 'south-east')[cfg.face?.frame ?? 0];
    const src = bfile ? await load(bfile) : idle0;
    const b = bbox(src)!;
    const H = b[3] - b[1];
    const S = Math.round(H * 0.6);
    let sum = 0;
    let n = 0;
    for (let y = b[1]; y < b[1] + H * 0.45; y++)
      for (let x = b[0]; x < b[2]; x++)
        if (src.data[(y * src.w + x) * 4 + 3]! > 8) {
          sum += x;
          n++;
        }
    const cx = Math.round(n ? sum / n : (b[0] + b[2]) / 2);
    const left = cfg.bust?.left ?? cx - Math.round(S / 2);
    const top = cfg.bust?.top ?? b[1] - Math.round(S * 0.05);
    const size = cfg.bust?.size ?? S;
    // Pad first so the crop can never leave the canvas
    const pad = size;
    const padded = await sharp(src.data, { raw: { width: src.w, height: src.h, channels: 4 } })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await sharp(padded)
      .extract({ left: left + pad, top: top + pad, width: size, height: size })
      .resize(96, 96, { kernel: 'nearest' })
      .webp({ lossless: true })
      .toFile(join(out, 'bust.webp'));
    art.bust = 'bust.webp';
  }
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
    const actions =
      cfg.actionCards && files.find((f) => f.startsWith(cfg.art!) && f.endsWith(cfg.actionCards!.file));
    if (actions && cfg.actionCards) {
      for (const [k, [left, top, size]] of cfg.actionCards.rects.entries()) {
        const name = k === 3 ? 'card-ult.webp' : `card-s${k + 1}.webp`;
        await sharp(join(artDir, actions))
          .extract({ left, top, width: size, height: size })
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
    if (cfg.face) src = await load(anim(cfg.face.src, cfg.face.dir)[cfg.face.frame]!);
    const fb = bbox(src)!;
    const size = Math.round((fb[3] - fb[1]) * 0.55);
    const cx = Math.round((fb[0] + fb[2]) / 2);
    await sharp(src.data, { raw: { width: src.w, height: src.h, channels: 4 } })
      .extract({
        left: Math.max(0, cx - Math.round(size / 2)),
        top: Math.max(0, fb[1] - 4),
        width: size,
        height: size,
      })
      .resize(256, 256, { kernel: 'nearest' })
      .webp({ lossless: true })
      .toFile(join(out, 'face.webp'));
    art.face = 'face.webp';
  }

  const vfxFile = cfg.vfx ? await vfx(cfg.vfx, out, pxPerM) : null;

  const atlas = {
    sheets,
    pxPerM: Math.round(pxPerM * 100) / 100,
    facing: 1,
    anims,
    art,
    ...(vfxFile ? { vfx: vfxFile } : {}),
    credit: cfg.credit ?? 'elie automata',
  };
  writeFileSync(join(out, 'atlas.json'), JSON.stringify(atlas));
  console.log(
    `${cfg.id.padEnd(8)} ${sheets.length} sheet(s), ${Object.keys(anims)
      .map((n) => `${n}:${anims[n]!.frames.length}@${anims[n]!.hit}`)
      .join(' ')}  art: ${Object.keys(art).join(', ')}`,
  );
}

/**
 * The pack's VFX update: every clip's frames trimmed and packed into vfx<N>.png with vfx.json
 * ([sheet, x, y, w, h, anchorX, anchorY] per frame, w = 0 for an empty frame). Drawn at the
 * hero's own pixel density (pxPerM), so the effects match the sprite's pixels.
 */
async function vfx(cfg: VfxCfg, out: string, pxPerM: number): Promise<string | null> {
  if (!existsSync(join(SRC, `${cfg.pack}.zip`)) && !existsSync(join(WORK, cfg.pack))) {
    console.warn(`  (no vfx) ${SRC}/${cfg.pack}.zip not found`);
    return null;
  }
  const dir = unzip(cfg.pack);
  const packer = new Packer();
  const pieces: { img: Img; box: [number, number, number, number]; at: [number, number, number] }[] = [];
  const clips: Record<string, { frames: Frame[] }> = {};
  for (const [name, [ax, ay]] of Object.entries(cfg.clips)) {
    // Newer updates keep each clip's single camera view in a `south` folder
    let files = list(join(dir, 'VFX', name));
    if (!files.length) files = list(join(dir, 'VFX', name, 'south'));
    if (!files.length) throw new Error(`${cfg.pack}: no frames in VFX/${name}`);
    const frames: Frame[] = [];
    for (const f of files) {
      const img = await load(f);
      const box = bbox(img);
      if (!box) {
        frames.push([0, 0, 0, 0, 0, 0, 0]);
        continue;
      }
      const w = box[2] - box[0];
      const h = box[3] - box[1];
      const at = packer.place(w, h);
      pieces.push({ img, box, at });
      frames.push([at[0], at[1], at[2], w, h, ax - box[0], ay - box[1]]);
    }
    clips[name] = { frames };
  }
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
    const name = `vfx${s}.png`;
    await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites)
      .png({ compressionLevel: 9, palette: false })
      .toFile(join(out, name));
    sheets.push(name);
  }
  writeFileSync(
    join(out, 'vfx.json'),
    JSON.stringify({ sheets, pxPerM: Math.round(pxPerM * 100) / 100, clips }),
  );
  console.log(
    `  vfx ${sheets.length} sheet(s), ${Object.keys(clips)
      .map((n) => `${n}:${clips[n]!.frames.length}`)
      .join(' ')}`,
  );
  return 'vfx.json';
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  // `pnpm sprites karasu reo` converts only those heroes
  const only = process.argv.slice(2);
  for (const h of HEROES) {
    if (only.length && !only.includes(h.id)) continue;
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

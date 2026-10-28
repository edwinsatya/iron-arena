/** Simulation constants. Units: millimetres (mm), frames (1/60 s). */

export const FPS = 60;

/** Match flow phase. */
export const PHASE = { INTRO: 0, FIGHT: 1, KO: 2, ROUND_END: 3, MATCH_END: 4 } as const;

/** Fighter state. */
export const FS = {
  IDLE: 0,
  WALK_F: 1,
  WALK_B: 2,
  DASH: 3,
  BACKDASH: 4,
  CROUCH: 5,
  JUMP: 6,
  SIDESTEP: 7,
  LAND: 8,
  ATTACK: 10,
  BLOCKSTUN: 11,
  HITSTUN: 12,
  AIR: 13,
  DOWN: 14,
  WAKEUP: 15,
  THROW: 16,
  THROWN: 17,
  KO: 18,
} as const;

/** Intent bits: raw input after SOCD cleaning and side mapping (LEFT/RIGHT → BACK/FORWARD). */
export const IN = { U: 1, D: 2, B: 4, F: 8, B1: 16, B2: 32, B3: 64, B4: 128 } as const;
export const IN_DIRS = IN.U | IN.D | IN.B | IN.F;
export const IN_BUTTONS = IN.B1 | IN.B2 | IN.B3 | IN.B4;

/** Gameplay events kept in GameState.recentEvents (render/audio diff them, PLAN §5.6). */
export const EV = {
  HIT: 1,
  BLOCK: 2,
  COUNTER: 3,
  SWING: 4,
  LAND: 5,
  KO: 6,
  THROW: 7,
  THROW_BREAK: 8,
  ARMOR: 9,
  JUMP: 10,
  STEP: 11,
} as const;

/** How a round ended. */
export const END = { NONE: 0, KO: 1, TIME: 2, DOUBLE_KO: 3 } as const;

// ---- World -------------------------------------------------------------------------------
export const STAGE_HALF = 5000; // arena is 10 m × 10 m
export const START_GAP = 1600; // distance between fighters at round start
export const GRAVITY = 4; // mm/frame² (jumps)
export const AIR_GRAVITY = 3; // juggled bodies are floatier…
export const AIR_GRAVITY_STEP = 5; // …but fall 1 mm/frame² faster every 5 hits
export const PUSH_HEIGHT = 900; // fighters push each other only when vertically overlapping

// ---- Round flow ----------------------------------------------------------------------------
export const INTRO_FRAMES = 120;
export const KO_FRAMES = 150;
export const KO_SLOWMO_FRAMES = 60;
export const SLOWMO_DIVISOR = 3;
export const ROUND_END_FRAMES = 60;

// ---- Input --------------------------------------------------------------------------------
export const INPUT_RING = 32; // must be a power of two
export const BUFFER_FRAMES = 8; // a press this many frames before you can act still comes out
export const MULTI_PRESS_LENIENCY = 2; // 1+2 may be pressed up to 2 frames apart
export const DOUBLE_TAP_WINDOW = 12; // f,f and b,b

// ---- Combat --------------------------------------------------------------------------------
export const CH_BONUS_STUN = 6;
export const MAX_JUGGLE_HITS = 10;
export const JUGGLE_POP = 40; // vy given by an air hit (mm/frame)
export const JUGGLE_CARRY = 10; // forward carry given by an air hit (mm/frame)
export const KND_VY = 34;
export const KND_VX = 22;
export const DEFAULT_PUSH_HIT = 120;
export const DEFAULT_PUSH_BLOCK = 180;
export const KO_HITSTOP = 18;

// ---- Movement ------------------------------------------------------------------------------
export const JUMP_LIFT_FRAME = 3;
export const JUMP_VY = 64;
export const JUMP_VX = 24;
export const LAND_FRAMES = 4;
export const DOWN_MIN_FRAMES = 24;
export const DOWN_MAX_FRAMES = 70;
export const WAKEUP_FRAMES = 22;
export const WAKEUP_INVULN_FRAMES = 14;
export const BACKDASH_LOCK_FRAMES = 12;
export const LOW_WHIFF_HEIGHT = 120; // lows whiff on jumping fighters above this height

/**
 * Simulation constants. Units: millimetres, frames (60 per second), mm/frame, unit vectors × 1024.
 * Gameplay numbers that belong to a hero live in data/heroes; these are the shared rules (docs/GAME.md).
 */

/** Match phases. */
export const PHASE = {
  INTRO: 0,
  FIGHT: 1,
  KO: 2,
  ROUND_END: 3,
  MATCH_END: 4,
} as const;

/** Fighter states. */
export const FS = {
  IDLE: 0,
  RUN: 1,
  DASH: 2,
  JUMP_SQUAT: 3,
  AIR: 4,
  LAND: 5,
  ACTION: 6,
  GUARD: 7,
  BLOCKSTUN: 8,
  GUARD_BREAK: 9,
  HITSTUN: 10,
  LAUNCHED: 11,
  DOWN: 12,
  GETUP: 13,
  DIZZY: 14,
  HELD: 15,
  FALLING: 16,
  KO: 17,
  CHARGE: 18,
  WIN: 19,
} as const;

/** How a round ended. */
export const END = {
  NONE: 0,
  KO: 1,
  RING_OUT: 2,
  TIME: 3,
  DOUBLE_KO: 4,
} as const;

/** Rollback-safe events for sound, effects and the HUD (PLAN §5.6). */
export const EV = {
  HIT: 1,
  BLOCK: 2,
  GUARD_BREAK: 3,
  ARMOR: 4,
  SWING: 5,
  FIRE: 6,
  EXPLODE: 7,
  AREA: 8,
  SKILL: 9,
  ULT: 10,
  COUNTER: 11,
  TELEPORT: 12,
  JUMP: 13,
  DASH: 14,
  LAND: 15,
  KO: 16,
  RING_OUT: 17,
  CHARGED: 18,
  DIZZY: 19,
  GRAB: 20,
  ROUND: 21,
  FALL: 22,
  /** Slammed into a wall (value: impact speed). */
  WALL: 23,
} as const;

/** Action kinds (what a move is for). */
export const AK = {
  BASIC: 0,
  DASH: 1,
  AIR: 2,
  CHARGE: 3,
  SKILL: 4,
  ULT: 5,
  FOLLOW: 6,
} as const;

// ——— Arena ———
/** Half the stage width (mm): walls stand at ±ARENA_R. */
export const ARENA_R = 8200;
/** Fighter centres stay within this (the body touches the wall). Nobody leaves the stage. */
export const ARENA_WALK_R = 7900;
/** Knockback faster than this into a wall bounces the victim back off it. */
export const WALL_BOUNCE_SPEED = 40;
export const START_X = 3200;

// ——— Movement ———
export const GRAVITY = 6;
/** Falling after the apex is a little heavier: a snappier arc. */
export const FALL_GRAVITY = 8;
export const MAX_FALL = 160;
export const JUMP_SQUAT = 3;
export const AIR_CONTROL = 7;
/** Extra jumps in the air (double jump) and their strength (% of the hero's jump). */
export const AIR_JUMPS = 1;
export const AIR_JUMP_PCT = 100;
export const DASH_FRAMES = 14;
export const DASH_TAP_WINDOW = 12;
export const LAND_FRAMES = 6;
export const FRICTION_PCT = 88;
export const BODY_R = 420;

// ——— Input ———
/** Buttons pressed within this many frames of each other count as a chord (skill). */
export const CHORD_WINDOW = 4;
/** A press made during an action is remembered this long. */
export const BUFFER_FRAMES = 8;
/** Hold Attack this long (through your first strike) to start charging. */
export const CHARGE_START = 16;
/** Charge frames needed for a full charged attack. */
export const CHARGE_FULL = 28;

// ——— Combat ———
export const DEFAULT_HITSTUN = 18;
export const DEFAULT_HITSTOP = 5;
export const BLOCK_STUN_PCT = 60;
export const BLOCK_PUSH_PCT = 50;
export const CHIP_PCT = 10;
export const GUARD_BREAK_FRAMES = 46;
export const GUARD_BREAK_DAMAGE_PCT = 50;
export const DOWN_FRAMES = 38;
export const GETUP_FRAMES = 18;
/** Air hits allowed before the victim drops out of the juggle (invulnerable fall). */
export const JUGGLE_LIMIT = 7;
/** Launch height falls off with each extra air hit (% per hit). */
export const JUGGLE_DECAY_PCT = 14;
/** Damage scaling by hit number in a combo (%). */
export const COMBO_SCALE = [100, 100, 92, 85, 78, 72, 66, 60, 55, 50, 46, 42, 40];

// ——— Meter ———
export const ULT_MAX = 1000;
/** Ultimate meter gained per damage point dealt / taken (%). */
export const ULT_GAIN_DEALT_PCT = 110;
export const ULT_GAIN_TAKEN_PCT = 70;
/** Everyone freezes for this long while the ultimate cut-in plays. */
export const ULT_FREEZE = 48;

// ——— Rounds ———
export const INTRO_FRAMES = 120;
export const KO_FRAMES = 100;
export const ROUND_END_FRAMES = 90;
export const KO_SLOWMO_FRAMES = 40;
export const SLOWMO_DIVISOR = 3;

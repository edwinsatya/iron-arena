/**
 * Simulation types. Every number in GameState is an integer (PLAN §4.4):
 * positions in mm, velocities in mm/frame, directions as unit vectors × 1024.
 * GameState is plain data only — numbers and arrays/objects of numbers.
 */

export type Height = 'high' | 'mid' | 'low' | 'throw';
/** A frame advantage, or a special outcome. */
export type Outcome = number | 'launch' | 'knockdown' | 'wallSplat';
export type MoveProperty = 'homing' | 'groundHit' | 'extender';

export interface Hitbox {
  /** Inclusive move-frame range during which the sphere is active. */
  frames: [number, number];
  /** Fighter-local position: forward, up, right (mm). */
  at: [number, number, number];
  /** Radius (mm). */
  r: number;
}

export interface Cylinder {
  r: number;
  /** Bottom and top, relative to the fighter's feet (mm). */
  y0: number;
  y1: number;
  zone: 'high' | 'mid' | 'low';
}

export interface ThrowData {
  /** Buttons that break this throw (raw button bits, e.g. B1 or B1|B2). */
  breakButtons: number;
  /** Frames the defender has to break after the grab connects. */
  breakWindow: number;
  /** Total frames of the throw animation once it can no longer be broken. */
  duration: number;
  /** Does the throw end with the fighters swapped? */
  switchSides?: boolean;
  /** Max centre distance at which the grab connects (mm). */
  range: number;
}

export interface MoveData {
  id: string;
  name: string;
  /** Command notation, e.g. 'df+2', 'f,f+3', '1+3'. Empty for string follow-ups. */
  command: string;
  height: Height;
  /** First active frame (i15 → 15). */
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  /** Authored frame advantage on block; blockstun is derived (PLAN Appendix B). */
  onBlock: number;
  onHit: Outcome;
  onCounterHit?: Outcome;
  hitboxes: Hitbox[];
  pushback?: { hit: number; block: number };
  hitstop?: number;
  launch?: { vy: number; vx: number };
  properties?: MoveProperty[];
  /** Frames (of this move) during which the attacker avoids highs or lows. */
  crush?: { frames: [number, number]; type: 'high' | 'low' };
  armor?: { frames: [number, number]; hits: number };
  /** Attacker movement: mm per frame forward during the frame range. */
  movement?: { frames: [number, number]; forward: number }[];
  /** String follow-ups: press `input` during `window` (move frames) to go `into` another move. */
  cancels?: { input: string; window: [number, number]; into: string }[];
  /** The attacker is crouching during this move (ducks highs). */
  stance?: 'crouch';
  /** The attacker ends the move crouching. */
  endStance?: 'crouch';
  throw?: ThrowData;
  /** Render-only: map sim frames to animation clip seconds (PLAN §5.2). */
  anim?: { clip: string; keys: [number, number][] };
}

export interface CharacterData {
  id: string;
  name: string;
  /** Short display name, e.g. "KAITO". */
  short: string;
  title: string;
  style: string;
  hp: number;
  walkF: number;
  walkB: number;
  bodyRadius: number;
  /** Per-frame distances of a forward dash / backdash (mm). */
  dash: number[];
  backdash: number[];
  hurt: { stand: Cylinder[]; crouch: Cylinder[]; air: Cylinder[] };
  moves: MoveData[];
  /** Hidden from character select (e.g. the training dummy). */
  hidden?: boolean;
}

export interface FighterState {
  /** Index into the roster. */
  char: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Facing toward the opponent, unit vector × 1024. */
  dirX: number;
  dirZ: number;
  hp: number;
  roundsWon: number;
  state: number;
  stateFrame: number;
  /** Index into the character's move list, -1 = none. */
  moveId: number;
  moveFrame: number;
  /** Remaining hitstun / blockstun frames. */
  stun: number;
  /** Current move connected: 0 no, 1 hit, 2 blocked. */
  hitLanded: number;
  crouching: number;
  /** 0 none, 1 standing guard, 2 crouching guard (computed every frame). */
  guard: number;
  /** Knockback velocity (mm/frame), decays every frame. */
  kbX: number;
  kbZ: number;
  /** As the victim of a combo: hits and damage so far. */
  comboHits: number;
  comboDamage: number;
  juggleLeft: number;
  armorLeft: number;
  /** Throw being suffered: move index of the attacker's throw, frames left to break. */
  thrownBy: number;
  breakLeft: number;
  /** Ring buffer of the last INPUT_RING intents, newest at inputHead. */
  inputRing: number[];
  inputHead: number;
  /** Buffered button press (intent button bits), direction at the press, age in frames. */
  bufBtn: number;
  bufDir: number;
  bufAge: number;
  /** For render blending (PLAN §5.2). */
  prevMoveId: number;
  prevMoveFrame: number;
}

export interface SimEvent {
  frame: number;
  /** Fighter the event belongs to (the attacker for hits, the subject otherwise). */
  fighter: number;
  type: number;
  /** Extra data, e.g. damage for hits. */
  value: number;
  x: number;
  y: number;
  z: number;
}

export interface GameState {
  frame: number;
  /** PRNG state (mulberry32). */
  rng: number;
  phase: number;
  phaseFrame: number;
  round: number;
  /** Remaining round time in frames. */
  timer: number;
  roundFrames: number;
  roundsToWin: number;
  hitstop: number;
  /** 1 or 0 — which side P1 is on, used for input mapping (PLAN §2.7). */
  p1OnLeft: number;
  /** "Always on the left" per player: 1 = that player's view is mirrored. */
  viewMirrored: [number, number];
  /** How the last round ended (END.*) and who won it (-1 draw, 0, 1). */
  endReason: number;
  endWinner: number;
  /** Match winner once phase is MATCH_END (-1 draw). */
  matchWinner: number;
  fighters: [FighterState, FighterState];
  /** Gameplay events from the last 16 frames (PLAN §5.6). */
  recentEvents: SimEvent[];
}

/** Everything needed to create the initial state. Both peers must use identical values. */
export interface SimConfig {
  seed: number;
  fighters: [string, string];
  roundsToWin: number;
  roundFrames: number;
  viewMirrored: [boolean, boolean];
}

/**
 * Simulation types. Every number in GameState is an integer (PLAN §4.4):
 * positions in mm, velocities in mm/frame, directions as unit vectors × 1024.
 * GameState is plain data only — numbers and arrays/objects of numbers.
 */

/** What happens to whoever gets hit. */
export interface HitSpec {
  damage: number;
  /** Flinch frames (standing hit). */
  hitstun?: number;
  /** Horizontal knockback speed (mm/frame), away from the attacker. Negative pulls in. */
  kb?: number;
  /** Launch speed (mm/frame) — sends the victim into the air for a juggle. */
  vy?: number;
  /** Victim is knocked down (lands on the floor, then gets up). */
  knockdown?: boolean;
  /** Dizzy frames: the victim can't act but can still be hit. */
  stun?: number;
  guardBreak?: boolean;
  unblockable?: boolean;
  hitstop?: number;
  /** The attacker switches into this action and holds the victim (grabs). */
  grab?: string;
  /** Knockback direction follows the attacker's facing instead of attacker→victim. */
  kbAlongFacing?: boolean;
}

/** A melee hit sphere, fighter-local: forward, up, right (mm). */
export interface Strike {
  frames: [number, number];
  at: [number, number, number];
  r: number;
  hit: HitSpec;
  /** Can hit again every N frames while active (multi-hit). */
  rehit?: number;
  /** Hits the held victim regardless of position, then releases them. */
  release?: boolean;
}

export type ProjectileKind =
  'bullet' | 'slug' | 'orb' | 'foxfire' | 'lance' | 'mine' | 'grenade' | 'wave' | 'shard' | 'arrow';

export interface ProjectileSpec {
  frame: number;
  kind: ProjectileKind;
  /** Spawn point, fighter-local: forward, up, right. */
  at: [number, number, number];
  speed: number;
  life: number;
  r: number;
  hit: HitSpec;
  /** Fan of shots: one per angle (degrees, multiples of 5, relative to facing). */
  angles?: number[];
  pierce?: boolean;
  /** Steering toward the opponent, 0..1024 per frame. */
  homing?: number;
  /** Frames until the projectile stops (mines, grenades). */
  stopAfter?: number;
  /** Upward speed at spawn; gravity applies when set. */
  vy?: number;
  /** Ignores guard (unless guarded) — explodes into this area instead of hitting directly. */
  explode?: AreaSpec;
  /** Can't hit until this many frames old (mines arm themselves). */
  armAfter?: number;
}

export type AreaKind =
  | 'quake'
  | 'frost'
  | 'blast'
  | 'moon'
  | 'storm'
  | 'barrage'
  | 'thunder'
  | 'burst'
  | 'crimson'
  | 'leaf'
  | 'holy'
  | 'shout'
  | 'meteor'
  | 'smoke'
  | 'tide'
  | 'void';

/** A ground circle that hits everyone inside after a telegraph. */
export interface AreaSpec {
  frame: number;
  kind: AreaKind;
  /** Where: `forward` mm in front of the user, or on the opponent if they're within `onTarget` mm. */
  forward: number;
  onTarget?: number;
  r: number;
  /** Telegraph frames before it becomes active. */
  delay: number;
  active: number;
  /** Hits again every N frames while active. */
  every?: number;
  hit: HitSpec;
}

export interface Motion {
  frames: [number, number];
  /** Forward speed (mm/frame) during these frames. */
  speed: number;
}

export interface ActionData {
  id: string;
  name: string;
  /** Short line for menus and the ultimate cut-in. */
  blurb?: string;
  total: number;
  strikes?: Strike[];
  projectiles?: ProjectileSpec[];
  areas?: AreaSpec[];
  motion?: Motion[];
  /** Hits taken during these frames don't interrupt (damage still applies). */
  armor?: [number, number];
  invuln?: [number, number];
  /** Pressing Attack in this window continues the combo into `into`. */
  chain?: { from: number; to: number; into: string };
  /** From this frame on, skills, guard, jump and dash can cancel the action. */
  cancelFrom?: number;
  /** Turn toward the opponent at the start if they're within this distance (mm). */
  lockOn?: number;
  /** Jump at this frame with this upward speed (the action continues in the air). */
  jump?: { frame: number; vy: number };
  /** Ends as soon as the fighter lands (air attacks). */
  endOnLand?: boolean;
  /**
   * Teleport at `frame`: `distance` along facing; or `behind` the opponent (behind their back);
   * or `toTarget` (in front of the opponent, facing them) when they're within `distance`.
   */
  teleport?: { frame: number; distance: number; behind?: boolean; toTarget?: boolean };
  /** If hit during these frames: ignore the hit and switch into `into` behind the attacker. */
  counter?: { frames: [number, number]; into: string };
  /** Grants a timed buff at `frame`. */
  buff?: {
    frame: number;
    frames: number;
    armor?: boolean;
    damagePct?: number;
    speedPct?: number;
    heal?: number;
  };
  /** Skills: frames until it can be used again. */
  cooldown?: number;
  /** Usable in the air (otherwise ground only). */
  air?: boolean;
}

export type Weapon = 'axe' | 'bow' | 'hammer' | 'sword' | 'dagger' | 'fire' | 'ice' | 'anchor' | 'scythe' | 'claw' | 'none';
/** Melee roles close in; Archer keeps its distance (the CPU plays them differently). */
export type Role = 'Berserker' | 'Archer' | 'Guardian' | 'Knight' | 'Assassin' | 'Mage' | 'Dummy';

export interface HeroData {
  id: string;
  name: string;
  /** Epithet, e.g. "Stormblade". */
  title: string;
  /** Japanese reading shown as decoration on the select screen. */
  kana: string;
  role: Role;
  weapon: Weapon;
  difficulty: 1 | 2 | 3;
  blurb: string;
  hp: number;
  /** Run speed (mm/frame). */
  speed: number;
  jumpVy: number;
  /** Damage taken (%) — heavy heroes take less. */
  defensePct: number;
  /** Basic attack combo, in order. */
  basic: string[];
  dashAttack: string;
  airAttack: string;
  charge: string;
  /** Skill 1 (Attack+Guard), Skill 2 (Attack+Jump), Skill 3 (Guard+Jump). */
  skills: [string, string, string];
  ultimate: string;
  actions: ActionData[];
  hidden?: boolean;
}

export interface CompiledHero extends HeroData {
  index: number;
  /** Index of every action id. */
  ids: Record<string, number>;
  basicIdx: number[];
  dashIdx: number;
  airIdx: number;
  chargeIdx: number;
  skillIdx: [number, number, number];
  ultIdx: number;
}

// ——— State ———

export interface FighterState {
  char: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Facing as a unit vector × 1024. */
  fx: number;
  fz: number;
  hp: number;
  roundsWon: number;
  state: number;
  stateFrame: number;
  /** Current action index (−1 = none). */
  action: number;
  actionFrame: number;
  /** Frames left in hitstun/blockstun/dizzy/down etc. */
  stun: number;
  /** Strikes that already hit in this action (bit per strike). */
  hitMask: number;
  /** Frame of the last hit landed by this action (multi-hit spacing). */
  lastHitFrame: number;
  airHits: number;
  comboHits: number;
  comboDamage: number;
  /** Who is holding this fighter (−1 = nobody). */
  heldBy: number;
  /** Skill cooldowns (frames left). */
  cd: number[];
  ult: number;
  /** Buffs: frames left and their strength. */
  buffFrames: number;
  buffArmor: number;
  buffDamagePct: number;
  buffSpeedPct: number;
  invulnFrames: number;
  /** Air jumps used since leaving the ground (double jump). */
  airJumps: number;
  /** Frames Attack has been held without a break (charge attacks). */
  holdA: number;
  // Input tracking (lives here so rollback restores it)
  prevBits: number;
  /** Frames since Attack / Guard / Jump were last pressed (capped). */
  ageA: number;
  ageG: number;
  ageJ: number;
  /** Last tapped direction (0–7) and frames since, for double-tap dashes. */
  tapDir: number;
  tapAge: number;
  /** Buffered request (BUF.*) and its age. */
  buf: number;
  bufAge: number;
  /** Stats for the HUD. */
  totalDamage: number;
  bestCombo: number;
}

export interface ProjectileState {
  owner: number;
  /** Which spec: owner's hero, action index, projectile index. */
  char: number;
  action: number;
  spec: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  /** 1 once it has hit (non-piercing projectiles then vanish). */
  hit: number;
}

export interface AreaState {
  owner: number;
  char: number;
  action: number;
  spec: number;
  x: number;
  z: number;
  age: number;
  lastHit: number;
  /** Bit per fighter already hit (single-hit areas). */
  hitMask: number;
}

export interface SimEvent {
  frame: number;
  fighter: number;
  type: number;
  value: number;
  x: number;
  y: number;
  z: number;
}

export interface GameState {
  frame: number;
  rng: number;
  phase: number;
  phaseFrame: number;
  round: number;
  timer: number;
  roundFrames: number;
  roundsToWin: number;
  hitstop: number;
  /** Ultimate cut-in freeze: frames left and who is using it. */
  freeze: number;
  freezeOwner: number;
  viewMirrored: [number, number];
  endReason: number;
  endWinner: number;
  matchWinner: number;
  fighters: [FighterState, FighterState];
  projectiles: ProjectileState[];
  areas: AreaState[];
  recentEvents: SimEvent[];
}

export interface SimConfig {
  seed: number;
  fighters: [string, string];
  roundsToWin: number;
  roundFrames: number;
  viewMirrored: [boolean, boolean];
}

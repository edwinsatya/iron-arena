import { FS, PHASE, START_X, ULT_MAX } from './constants';
import { characterIndex, ROSTER } from './roster';
import type { FighterState, GameState, SimConfig } from './types';

export function createFighter(charId: string, side: 0 | 1): FighterState {
  const char = characterIndex(charId);
  const hero = ROSTER[char]!;
  return {
    char,
    x: side === 0 ? -START_X : START_X,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    fx: side === 0 ? 1024 : -1024,
    fz: 0,
    hp: hero.hp,
    roundsWon: 0,
    state: FS.IDLE,
    stateFrame: 0,
    action: -1,
    actionFrame: 0,
    stun: 0,
    hitMask: 0,
    lastHitFrame: -999,
    airHits: 0,
    comboHits: 0,
    comboDamage: 0,
    heldBy: -1,
    cd: [0, 0, 0],
    ult: 0,
    buffFrames: 0,
    buffArmor: 0,
    buffDamagePct: 0,
    buffSpeedPct: 0,
    invulnFrames: 0,
    holdA: 0,
    prevBits: 0,
    ageA: 99,
    ageG: 99,
    ageJ: 99,
    tapDir: -1,
    tapAge: 99,
    buf: 0,
    bufAge: 99,
    totalDamage: 0,
    bestCombo: 0,
  };
}

/** Put both fighters back at their corners for a new round (HP refilled, meter kept). */
export function resetForRound(s: GameState): void {
  for (const side of [0, 1] as const) {
    const old = s.fighters[side];
    const f = createFighter(ROSTER[old.char]!.id, side);
    f.roundsWon = old.roundsWon;
    f.ult = Math.min(ULT_MAX, old.ult);
    f.totalDamage = old.totalDamage;
    f.bestCombo = old.bestCombo;
    f.prevBits = old.prevBits;
    s.fighters[side] = f;
  }
  s.projectiles.length = 0;
  s.areas.length = 0;
  s.timer = s.roundFrames;
  s.hitstop = 0;
  s.freeze = 0;
  s.freezeOwner = -1;
}

export function createInitialState(config: SimConfig): GameState {
  return {
    frame: 0,
    rng: config.seed | 0,
    phase: PHASE.INTRO,
    phaseFrame: 0,
    round: 1,
    timer: config.roundFrames,
    roundFrames: config.roundFrames,
    roundsToWin: config.roundsToWin,
    hitstop: 0,
    freeze: 0,
    freezeOwner: -1,
    viewMirrored: [config.viewMirrored[0] ? 1 : 0, config.viewMirrored[1] ? 1 : 0],
    endReason: 0,
    endWinner: -1,
    matchWinner: -1,
    fighters: [createFighter(config.fighters[0], 0), createFighter(config.fighters[1], 1)],
    projectiles: [],
    areas: [],
    recentEvents: [],
  };
}

/**
 * Deep copy of plain data. GameState holds only numbers, arrays and plain objects, so a generic
 * copy can't forget a field (rollback snapshots depend on this).
 */
function copy<T>(v: T): T {
  if (typeof v !== 'object' || v === null) return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = copy(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) out[k] = copy((v as Record<string, unknown>)[k]);
  return out as T;
}

export function cloneState(s: GameState): GameState {
  return copy(s);
}

export function cloneFighter(f: FighterState): FighterState {
  return { ...f, cd: [...f.cd] };
}

import { END, FS, INPUT_RING, PHASE, START_GAP } from './constants';
import { characterIndex, ROSTER } from './roster';
import type { FighterState, GameState, SimConfig } from './types';

export function createFighter(char: number): FighterState {
  return {
    char,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    dirX: 1024,
    dirZ: 0,
    hp: ROSTER[char]!.hp,
    roundsWon: 0,
    state: FS.IDLE,
    stateFrame: 0,
    moveId: -1,
    moveFrame: 0,
    stun: 0,
    hitLanded: 0,
    crouching: 0,
    guard: 1,
    kbX: 0,
    kbZ: 0,
    comboHits: 0,
    comboDamage: 0,
    juggleLeft: 0,
    armorLeft: 0,
    thrownBy: -1,
    breakLeft: 0,
    inputRing: new Array<number>(INPUT_RING).fill(0),
    inputHead: 0,
    bufBtn: 0,
    bufDir: 0,
    bufAge: 0,
    prevMoveId: -1,
    prevMoveFrame: 0,
  };
}

/** Put a fighter back at its round-start spot with full health (rounds won are kept). */
export function resetFighterForRound(f: FighterState, side: -1 | 1): void {
  f.x = (side * START_GAP) / 2;
  f.y = 0;
  f.z = 0;
  f.vx = 0;
  f.vy = 0;
  f.vz = 0;
  f.dirX = -side * 1024;
  f.dirZ = 0;
  f.hp = ROSTER[f.char]!.hp;
  f.state = FS.IDLE;
  f.stateFrame = 0;
  f.moveId = -1;
  f.moveFrame = 0;
  f.stun = 0;
  f.hitLanded = 0;
  f.crouching = 0;
  f.guard = 1;
  f.kbX = 0;
  f.kbZ = 0;
  f.comboHits = 0;
  f.comboDamage = 0;
  f.juggleLeft = 0;
  f.armorLeft = 0;
  f.thrownBy = -1;
  f.breakLeft = 0;
  f.bufBtn = 0;
  f.bufDir = 0;
  f.bufAge = 0;
  f.prevMoveId = -1;
  f.prevMoveFrame = 0;
}

/** Start round `round`: positions, health, timer, intro phase. */
export function startRound(s: GameState, round: number): void {
  s.round = round;
  s.phase = PHASE.INTRO;
  s.phaseFrame = 0;
  s.timer = s.roundFrames;
  s.hitstop = 0;
  s.p1OnLeft = 1;
  s.endReason = END.NONE;
  s.endWinner = -1;
  resetFighterForRound(s.fighters[0], -1);
  resetFighterForRound(s.fighters[1], 1);
}

export function createInitialState(cfg: SimConfig): GameState {
  const s: GameState = {
    frame: 0,
    rng: cfg.seed | 0,
    phase: PHASE.INTRO,
    phaseFrame: 0,
    round: 1,
    timer: cfg.roundFrames,
    roundFrames: cfg.roundFrames,
    roundsToWin: cfg.roundsToWin,
    hitstop: 0,
    p1OnLeft: 1,
    viewMirrored: [cfg.viewMirrored[0] ? 1 : 0, cfg.viewMirrored[1] ? 1 : 0],
    endReason: END.NONE,
    endWinner: -1,
    matchWinner: -1,
    fighters: [createFighter(characterIndex(cfg.fighters[0])), createFighter(characterIndex(cfg.fighters[1]))],
    recentEvents: [],
  };
  startRound(s, 1);
  return s;
}

export function cloneFighter(f: FighterState): FighterState {
  return { ...f, inputRing: f.inputRing.slice() };
}

/** Deep copy. Every nested array/object in GameState must be copied here (synctest checks it). */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    viewMirrored: [s.viewMirrored[0], s.viewMirrored[1]],
    fighters: [cloneFighter(s.fighters[0]), cloneFighter(s.fighters[1])],
    recentEvents: s.recentEvents.map((e) => ({ ...e })),
  };
}

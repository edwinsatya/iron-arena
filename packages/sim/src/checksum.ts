import type { FighterState, GameState } from './types';

/** FNV-1a style hash over int32 words. */
export function hashInts(values: Iterable<number>): number {
  let h = 0x811c9dc5 | 0;
  for (const v of values) h = Math.imul(h ^ (v | 0), 0x01000193);
  return h >>> 0;
}

function* fighterWords(f: FighterState): Generator<number> {
  yield f.char;
  yield f.x;
  yield f.y;
  yield f.z;
  yield f.vx;
  yield f.vy;
  yield f.vz;
  yield f.dirX;
  yield f.dirZ;
  yield f.hp;
  yield f.roundsWon;
  yield f.state;
  yield f.stateFrame;
  yield f.moveId;
  yield f.moveFrame;
  yield f.stun;
  yield f.hitLanded;
  yield f.crouching;
  yield f.guard;
  yield f.kbX;
  yield f.kbZ;
  yield f.comboHits;
  yield f.comboDamage;
  yield f.juggleLeft;
  yield f.armorLeft;
  yield f.thrownBy;
  yield f.breakLeft;
  yield f.inputRing.length;
  for (const v of f.inputRing) yield v;
  yield f.inputHead;
  yield f.bufBtn;
  yield f.bufDir;
  yield f.bufAge;
  yield f.prevMoveId;
  yield f.prevMoveFrame;
}

function* stateWords(s: GameState): Generator<number> {
  yield s.frame;
  yield s.rng;
  yield s.phase;
  yield s.phaseFrame;
  yield s.round;
  yield s.timer;
  yield s.roundFrames;
  yield s.roundsToWin;
  yield s.hitstop;
  yield s.p1OnLeft;
  yield s.viewMirrored[0];
  yield s.viewMirrored[1];
  yield s.endReason;
  yield s.endWinner;
  yield s.matchWinner;
  yield* fighterWords(s.fighters[0]);
  yield* fighterWords(s.fighters[1]);
  yield s.recentEvents.length;
  for (const e of s.recentEvents) {
    yield e.frame;
    yield e.fighter;
    yield e.type;
    yield e.value;
    yield e.x;
    yield e.y;
    yield e.z;
  }
}

/** uint32 checksum of the entire state. Feed it EVERY field (a unit test checks coverage). */
export function checksum(s: GameState): number {
  return hashInts(stateWords(s));
}

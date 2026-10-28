import {
  END,
  EV,
  FS,
  INTRO_FRAMES,
  KO_FRAMES,
  KO_HITSTOP,
  PHASE,
  ROUND_END_FRAMES,
} from './constants';
import { pushEvent } from './events';
import { setState } from './fighter';
import { along } from './math';
import { startRound } from './state';
import type { FighterState, GameState } from './types';

function setPhase(s: GameState, phase: number): void {
  s.phase = phase;
  s.phaseFrame = 0;
}

function knockOut(s: GameState, p: number): void {
  const f = s.fighters[p]!;
  const o = s.fighters[1 - p]!;
  f.moveId = -1;
  f.moveFrame = 0;
  f.stun = 0;
  f.thrownBy = -1;
  if (f.state === FS.AIR) {
    f.juggleLeft = 0; // keeps falling; becomes KO on landing
    return;
  }
  if (f.state !== FS.KO) setState(f, FS.KO);
  if (f.y === 0) {
    f.vy = 26;
    f.vx = along(o.dirX, 18);
    f.vz = along(o.dirZ, 18);
  }
  pushEvent(s, p, EV.KO, 0, f.x, 1000, f.z);
}

function decideWinner(s: GameState): number | null {
  const [a, b] = s.fighters;
  const aWon = a.roundsWon >= s.roundsToWin;
  const bWon = b.roundsWon >= s.roundsToWin;
  if (aWon && bWon) return a.roundsWon > b.roundsWon ? 0 : b.roundsWon > a.roundsWon ? 1 : null;
  if (aWon) return 0;
  if (bWon) return 1;
  return null;
}

function awardRound(s: GameState): void {
  if (s.endWinner === -1) {
    s.fighters[0].roundsWon++;
    s.fighters[1].roundsWon++;
  } else {
    s.fighters[s.endWinner]!.roundsWon++;
  }
}

function alive(f: FighterState): boolean {
  return f.hp > 0;
}

/** Round flow (PLAN §2.2): intro → fight → KO / time → round end → next round or match end. */
export function roundLogic(s: GameState): void {
  switch (s.phase) {
    case PHASE.INTRO:
      if (s.phaseFrame >= INTRO_FRAMES) setPhase(s, PHASE.FIGHT);
      break;

    case PHASE.FIGHT: {
      const [a, b] = s.fighters;
      if (!alive(a) || !alive(b)) {
        const both = !alive(a) && !alive(b);
        s.endReason = both ? END.DOUBLE_KO : END.KO;
        s.endWinner = both ? -1 : alive(a) ? 0 : 1;
        if (!alive(a)) knockOut(s, 0);
        if (!alive(b)) knockOut(s, 1);
        if (s.hitstop < KO_HITSTOP) s.hitstop = KO_HITSTOP;
        setPhase(s, PHASE.KO);
        break;
      }
      if (s.hitstop === 0 && s.timer > 0) {
        s.timer--;
        if (s.timer === 0) {
          s.endReason = END.TIME;
          s.endWinner = a.hp > b.hp ? 0 : b.hp > a.hp ? 1 : -1;
          setPhase(s, PHASE.KO);
        }
      }
      break;
    }

    case PHASE.KO:
      if (s.phaseFrame >= KO_FRAMES) {
        awardRound(s);
        setPhase(s, PHASE.ROUND_END);
      }
      break;

    case PHASE.ROUND_END:
      if (s.phaseFrame >= ROUND_END_FRAMES) {
        const winner = decideWinner(s);
        if (winner !== null) {
          s.matchWinner = winner;
          setPhase(s, PHASE.MATCH_END);
        } else {
          startRound(s, s.round + 1);
        }
      }
      break;
  }
}

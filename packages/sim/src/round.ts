import { END, EV, FS, INTRO_FRAMES, KO_FRAMES, PHASE, RING_OUT_Y, ROUND_END_FRAMES } from './constants';
import { pushEvent } from './events';
import { setState } from './fighter';
import { ROSTER } from './roster';
import { resetForRound } from './state';
import type { GameState } from './types';

function endRound(s: GameState, reason: number, winner: number): void {
  s.phase = PHASE.KO;
  s.phaseFrame = 0;
  s.endReason = reason;
  s.endWinner = winner;
  s.projectiles.length = 0;
}

/** Phases, timer, KOs, ring-outs and match end. */
export function roundLogic(s: GameState): void {
  const [a, b] = s.fighters;
  switch (s.phase) {
    case PHASE.INTRO:
      if (s.phaseFrame === 1) pushEvent(s, 0, EV.ROUND, s.round, 0, 0, 0);
      if (s.phaseFrame >= INTRO_FRAMES) {
        s.phase = PHASE.FIGHT;
        s.phaseFrame = 0;
      }
      return;
    case PHASE.FIGHT: {
      if (s.timer > 0) s.timer--;
      const outA = a.y < RING_OUT_Y;
      const outB = b.y < RING_OUT_Y;
      if (outA || outB) {
        for (const [f, out, i] of [
          [a, outA, 0],
          [b, outB, 1],
        ] as const) {
          if (!out) continue;
          f.hp = 0;
          setState(f, FS.KO);
          pushEvent(s, i, EV.RING_OUT, 0, f.x, f.y, f.z);
        }
        endRound(s, outA && outB ? END.DOUBLE_KO : END.RING_OUT, outA && outB ? -1 : outA ? 1 : 0);
        return;
      }
      const koA = a.hp <= 0;
      const koB = b.hp <= 0;
      if (koA || koB) {
        endRound(s, koA && koB ? END.DOUBLE_KO : END.KO, koA && koB ? -1 : koA ? 1 : 0);
        return;
      }
      if (s.timer === 0) {
        // Higher remaining health (as a share of max) wins
        const pa = a.hp * ROSTER[b.char]!.hp;
        const pb = b.hp * ROSTER[a.char]!.hp;
        endRound(s, END.TIME, pa === pb ? -1 : pa > pb ? 0 : 1);
      }
      return;
    }
    case PHASE.KO:
      if (s.phaseFrame >= KO_FRAMES) {
        if (s.endWinner >= 0) s.fighters[s.endWinner].roundsWon++;
        else {
          a.roundsWon++;
          b.roundsWon++;
        }
        s.phase = PHASE.ROUND_END;
        s.phaseFrame = 0;
        if (s.endWinner >= 0) {
          const w = s.fighters[s.endWinner];
          if (w.state !== FS.KO && w.state !== FS.FALLING) setState(w, FS.WIN);
        }
      }
      return;
    case PHASE.ROUND_END:
      if (s.phaseFrame >= ROUND_END_FRAMES) {
        const doneA = a.roundsWon >= s.roundsToWin;
        const doneB = b.roundsWon >= s.roundsToWin;
        if (doneA || doneB) {
          s.phase = PHASE.MATCH_END;
          s.phaseFrame = 0;
          s.matchWinner = doneA && doneB ? -1 : doneA ? 0 : 1;
          return;
        }
        s.round++;
        resetForRound(s);
        s.phase = PHASE.INTRO;
        s.phaseFrame = 0;
        s.endReason = END.NONE;
        s.endWinner = -1;
      }
      return;
  }
}

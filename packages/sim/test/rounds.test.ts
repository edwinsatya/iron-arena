import { BTN } from '@neonfist/shared';
import { describe, expect, it } from 'vitest';
import { END, FS, INTRO_FRAMES, KO_FRAMES, PHASE, ROUND_END_FRAMES } from '../src/constants';
import { createInitialState } from '../src/state';
import { step } from '../src/step';
import { fightState, force, place, run, runUntil } from './helpers';

describe('round flow (PLAN §2.2)', () => {
  it('starts with a 120-frame intro, then the fight', () => {
    const s = createInitialState({
      seed: 1,
      fighters: ['kaito', 'magnus'],
      roundsToWin: 2,
      roundFrames: 3600,
      viewMirrored: [false, false],
    });
    expect(s.phase).toBe(PHASE.INTRO);
    run(s, INTRO_FRAMES - 1);
    expect(s.phase).toBe(PHASE.INTRO);
    run(s, 1);
    expect(s.phase).toBe(PHASE.FIGHT);
    expect(s.fighters[0].x).toBe(-800);
    expect(s.fighters[1].x).toBe(800);
  });

  it('inputs are ignored during the intro', () => {
    const s = createInitialState({
      seed: 1,
      fighters: ['kaito', 'magnus'],
      roundsToWin: 2,
      roundFrames: 3600,
      viewMirrored: [false, false],
    });
    run(s, 60, [BTN.RIGHT | BTN.B1, BTN.LEFT]);
    expect(s.fighters[0].x).toBe(-800);
    expect(s.fighters[0].state).toBe(FS.IDLE);
  });

  it('a KO ends the round, awards it, and resets for round 2', () => {
    const s = fightState('dummy', 'dummy');
    place(s, 650);
    s.fighters[1].hp = 5;
    force(s, 0, 'dummy_1');
    runUntil(s, (st) => st.phase === PHASE.KO, () => [0, BTN.LEFT]);
    expect(s.endReason).toBe(END.KO);
    expect(s.endWinner).toBe(0);
    expect(s.fighters[1].state === FS.KO || s.fighters[1].state === FS.AIR).toBe(true);
    run(s, KO_FRAMES);
    expect(s.phase).toBe(PHASE.ROUND_END);
    expect(s.fighters[0].roundsWon).toBe(1);
    run(s, ROUND_END_FRAMES);
    expect(s.phase).toBe(PHASE.INTRO);
    expect(s.round).toBe(2);
    expect(s.fighters[1].hp).toBe(200);
    expect(s.fighters[1].state).toBe(FS.IDLE);
    expect(s.timer).toBe(3600);
  });

  it('time out: higher health wins the round', () => {
    const s = fightState('dummy', 'dummy', 600);
    s.fighters[0].hp = 150;
    runUntil(s, (st) => st.phase === PHASE.KO, undefined, 700);
    expect(s.endReason).toBe(END.TIME);
    expect(s.endWinner).toBe(1);
  });

  it('time out with equal health: both get the round', () => {
    const s = fightState('dummy', 'dummy', 600);
    runUntil(s, (st) => st.phase === PHASE.ROUND_END, undefined, 1000);
    expect(s.endWinner).toBe(-1);
    expect(s.fighters[0].roundsWon).toBe(1);
    expect(s.fighters[1].roundsWon).toBe(1);
  });

  it('double KO: both fighters lose the round together', () => {
    const s = fightState('dummy', 'dummy');
    place(s, 650);
    s.fighters[0].hp = 5;
    s.fighters[1].hp = 5;
    force(s, 0, 'dummy_1');
    force(s, 1, 'dummy_1');
    runUntil(s, (st) => st.phase === PHASE.KO);
    expect(s.endReason).toBe(END.DOUBLE_KO);
    expect(s.endWinner).toBe(-1);
  });

  it('first to 2 rounds wins the match', () => {
    const s = fightState('dummy', 'dummy');
    for (let round = 1; round <= 2; round++) {
      while (s.phase !== PHASE.FIGHT) step(s, [0, 0]);
      place(s, 650);
      s.fighters[1].hp = 5;
      force(s, 0, 'dummy_1');
      runUntil(s, (st) => st.phase === PHASE.KO, () => [0, BTN.LEFT]);
      runUntil(s, (st) => st.phase !== PHASE.KO && st.phase !== PHASE.ROUND_END, undefined, 400);
    }
    expect(s.phase).toBe(PHASE.MATCH_END);
    expect(s.matchWinner).toBe(0);
  });

  it('a match tied at the deciding round goes to another round', () => {
    const s = fightState('dummy', 'dummy', 600);
    s.fighters[0].roundsWon = 1;
    s.fighters[1].roundsWon = 1;
    runUntil(s, (st) => st.phase === PHASE.INTRO, undefined, 1000); // draw → 2–2
    expect(s.fighters[0].roundsWon).toBe(2);
    expect(s.fighters[1].roundsWon).toBe(2);
    expect(s.round).toBe(2);
  });
});

import { BTN } from '@neonfist/shared';
import { describe, expect, it } from 'vitest';
import { EV, PHASE } from '../src/constants';
import { isActionable } from '../src/debug';
import { cloneState, createInitialState } from '../src/state';
import { step } from '../src/step';
import type { GameState } from '../src/types';

const R = BTN.RIGHT;
const D = BTN.DOWN;

/** A combo step: an input sequence whose last frame triggers the move. */
interface ComboStep {
  seq: number[];
  /** 'move' waits until the fighter can act; 'string' is pressed right away (buffered). */
  kind: 'move' | 'string';
}

/**
 * P2 walks forward (not guarding) until the first hit, then lets go of the stick (so it guards
 * once it can act again). Returns the number of hits and the damage dealt.
 */
function perform(p1: string, steps: ComboStep[], delays: number[] = []): { hits: number; damage: number } {
  const s = createInitialState({
    seed: 1,
    fighters: [p1, 'dummy'],
    roundsToWin: 2,
    roundFrames: 3600,
    viewMirrored: [false, false],
  });
  while (s.phase !== PHASE.FIGHT) step(s, [0, 0]);
  s.fighters[0].x = -330;
  s.fighters[1].x = 330;
  let hits = 0;
  const p2 = () => (hits === 0 ? BTN.LEFT : 0);
  const feed = (st: GameState, inp: number) => {
    step(st, [inp, p2()]);
    hits += st.recentEvents.filter((e) => e.frame === st.frame && e.type === EV.HIT).length;
  };
  steps.forEach((st, i) => {
    const delay = delays[i] ?? 0;
    if (st.kind === 'move') {
      const probe = cloneState(s);
      let wait = 0;
      while (!isActionable(probe.fighters[0]) && wait < 200) {
        step(probe, [0, p2()]);
        wait++;
      }
      for (let k = 0; k < wait + delay - (st.seq.length - 1); k++) feed(s, 0);
    } else {
      for (let k = 0; k < delay; k++) feed(s, 0);
    }
    for (const inp of st.seq) feed(s, inp);
  });
  for (let k = 0; k < 150; k++) feed(s, 0);
  return { hits, damage: 200 - s.fighters[1].hp };
}

const KAITO_STARTER: ComboStep[] = [
  { seq: [D | R | BTN.B2], kind: 'move' }, // df+2 Skyward Uppercut (launch)
  { seq: [BTN.B1], kind: 'move' }, // 1 Quick Jab
  { seq: [BTN.B1], kind: 'move' }, // 1,2 Storm One-Two…
  { seq: [BTN.B2], kind: 'string' }, // …second hit
  { seq: [R, 0, R | BTN.B3], kind: 'move' }, // f,f+3 Comet Kick
];

const MAGNUS_STARTER: ComboStep[] = [
  { seq: [D | R | BTN.B2], kind: 'move' }, // df+2 Avalanche Uppercut
  { seq: [BTN.B1], kind: 'move' }, // 1 Heavy Jab
  { seq: [BTN.B2], kind: 'move' }, // 2 Hammer Cross
  { seq: [R, 0, R | BTN.B2], kind: 'move' }, // f,f+2 Bull Rush
];

describe('starter combos (PLAN §2.6)', () => {
  it('Kaito: df+2 → 1 → 1,2 → f,f+3 = 42 damage', () => {
    expect(perform('kaito', KAITO_STARTER)).toEqual({ hits: 5, damage: 42 });
  });

  it('Magnus: df+2 → 1 → 2 → f,f+2 = 51 damage', () => {
    expect(perform('magnus', MAGNUS_STARTER)).toEqual({ hits: 4, damage: 51 });
  });

  it('combos are human-friendly: each link has a timing window of at least 4 frames', () => {
    for (const [char, combo] of [
      ['kaito', KAITO_STARTER],
      ['magnus', MAGNUS_STARTER],
    ] as const) {
      for (let i = 1; i < combo.length; i++) {
        const delays = combo.map((_, j) => (j === i ? 3 : 0));
        expect(perform(char, combo, delays).hits, `${char} link ${i} late by 3 frames`).toBe(combo.length);
      }
    }
  });

  it('juggles cannot go on forever (gravity grows, 10-hit limit)', () => {
    // Kaito launches, then jabs as fast as possible.
    const steps: ComboStep[] = [{ seq: [D | R | BTN.B2], kind: 'move' }];
    for (let i = 0; i < 20; i++) steps.push({ seq: [BTN.B1], kind: 'move' });
    expect(perform('kaito', steps).hits).toBeLessThanOrEqual(10);
  });
});

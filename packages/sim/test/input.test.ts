import { BTN } from '@neonfist/shared';
import { describe, expect, it } from 'vitest';
import { FS, IN } from '../src/constants';
import { mapInput } from '../src/input';
import { findMove, parseCommand, MOTION } from '../src/moves';
import { ROSTER } from '../src/roster';
import { createInitialState } from '../src/state';
import { step } from '../src/step';
import { fightState, moveIndex, place } from './helpers';

const kaito = ROSTER.find((c) => c.id === 'kaito')!;
const idOf = (i: number) => kaito.moves[i]?.id;

describe('input mapping (PLAN §2.7)', () => {
  const s = createInitialState({
    seed: 1,
    fighters: ['kaito', 'kaito'],
    roundsToWin: 2,
    roundFrames: 3600,
    viewMirrored: [false, true],
  });

  it('maps right/left to forward/back by side', () => {
    expect(mapInput(s, 0, BTN.RIGHT)).toBe(IN.F);
    expect(mapInput(s, 0, BTN.LEFT)).toBe(IN.B);
  });

  it('cleans opposite directions (SOCD)', () => {
    expect(mapInput(s, 0, BTN.LEFT | BTN.RIGHT | BTN.B1)).toBe(IN.B1);
    expect(mapInput(s, 0, BTN.UP | BTN.DOWN)).toBe(0);
  });

  it('un-mirrors a player who uses "always on the left"', () => {
    // P2 sees itself on the left, so pressing RIGHT on its screen means toward P1 = forward.
    expect(mapInput(s, 1, BTN.RIGHT)).toBe(IN.F);
    expect(mapInput(s, 1, BTN.LEFT)).toBe(IN.B);
  });

  it('flips with the side state, not the camera', () => {
    const t = { ...s, p1OnLeft: 0, viewMirrored: [0, 0] as [number, number] };
    expect(mapInput(t, 0, BTN.LEFT)).toBe(IN.F);
    expect(mapInput(t, 1, BTN.RIGHT)).toBe(IN.F);
  });
});

describe('commands', () => {
  it('parses notation', () => {
    expect(parseCommand('df+2')).toEqual({ motion: MOTION.NONE, dir: IN.D | IN.F, buttons: IN.B2 });
    expect(parseCommand('f,f+3')).toEqual({ motion: MOTION.FF, dir: 0, buttons: IN.B3 });
    expect(parseCommand('b+1+2')).toEqual({ motion: MOTION.NONE, dir: IN.B, buttons: IN.B1 | IN.B2 });
    expect(parseCommand('1+3')).toEqual({ motion: MOTION.NONE, dir: 0, buttons: IN.B1 | IN.B3 });
    expect(parseCommand('SS+2').motion).toBe(MOTION.SS);
    expect(() => parseCommand('df')).toThrow();
  });

  it('finds moves with direction fallbacks', () => {
    expect(idOf(findMove(kaito, IN.B1, IN.D | IN.F, false))).toBe('kaito_df1');
    expect(idOf(findMove(kaito, IN.B1, IN.D | IN.B, false))).toBe('kaito_d1'); // db+1 → d+1
    expect(idOf(findMove(kaito, IN.B1, IN.F, false))).toBe('kaito_1'); // f+1 → 1
    expect(idOf(findMove(kaito, IN.B3, IN.F, true))).toBe('kaito_ff3'); // while dashing
    expect(idOf(findMove(kaito, IN.B1 | IN.B3, 0, false))).toBe('kaito_13');
    expect(idOf(findMove(kaito, IN.B1 | IN.B2, IN.B, false))).toBe('kaito_b12');
    expect(idOf(findMove(kaito, IN.B1 | IN.B2, 0, false))).toBe('kaito_1'); // no 1+2 → 1
  });
});

describe('input handling in the simulation', () => {
  it('f,f dashes', () => {
    const s = fightState('kaito', 'kaito');
    for (const inp of [BTN.RIGHT, BTN.RIGHT, 0, 0, BTN.RIGHT]) step(s, [inp, 0]);
    expect(s.fighters[0].state).toBe(FS.DASH);
  });

  it('b,b backdashes', () => {
    const s = fightState('kaito', 'kaito');
    for (const inp of [BTN.LEFT, 0, BTN.LEFT]) step(s, [inp, 0]);
    expect(s.fighters[0].state).toBe(FS.BACKDASH);
  });

  it('holding forward walks; down crouches; up jumps', () => {
    const s = fightState('kaito', 'kaito');
    step(s, [BTN.RIGHT, 0]);
    expect(s.fighters[0].state).toBe(FS.WALK_F);
    step(s, [BTN.DOWN, 0]);
    expect(s.fighters[0].state).toBe(FS.CROUCH);
    expect(s.fighters[0].guard).toBe(2);
    step(s, [BTN.DOWN | BTN.RIGHT, 0]);
    expect(s.fighters[0].guard).toBe(0); // d/f doesn't guard
    step(s, [BTN.UP, 0]);
    expect(s.fighters[0].state).toBe(FS.JUMP);
  });

  it('1 and 3 pressed a frame apart still make a throw', () => {
    const s = fightState('kaito', 'kaito');
    step(s, [BTN.B1, 0]);
    step(s, [BTN.B1 | BTN.B3, 0]);
    expect(s.fighters[0].moveId).toBe(moveIndex(s, 0, 'kaito_13'));
  });

  it('a press during recovery comes out on the first actionable frame', () => {
    const s = fightState('kaito', 'kaito');
    place(s, 3000);
    step(s, [BTN.B2, 0]); // Straight Right: 29 frames total
    const total = 11 - 1 + 2 + 17;
    for (let i = 2; i <= total - 3; i++) step(s, [0, 0]);
    step(s, [BTN.B1, 0]); // pressed 3 frames before the end
    step(s, [0, 0]);
    step(s, [0, 0]);
    step(s, [0, 0]);
    expect(s.fighters[0].moveId).toBe(moveIndex(s, 0, 'kaito_1'));
    expect(s.fighters[0].moveFrame).toBe(1);
  });

  it('a string follow-up pressed early is kept until its window opens', () => {
    const s = fightState('kaito', 'kaito');
    place(s, 3000);
    step(s, [BTN.B1, 0]);
    step(s, [0, 0]);
    step(s, [0, 0]);
    step(s, [BTN.B2, 0]); // jab frame 4, window opens at 11
    for (let i = 0; i < 7; i++) step(s, [0, 0]);
    expect(s.fighters[0].moveId).toBe(moveIndex(s, 0, 'kaito_1_2'));
  });
});

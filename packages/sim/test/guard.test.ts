import { BTN } from '@neonfist/shared';
import { describe, expect, it } from 'vitest';
import { EV, FS } from '../src/constants';
import { step } from '../src/step';
import { fightState, force, place } from './helpers';
import type { GameState } from '../src/types';

const P2 = { BACK: BTN.RIGHT, FORWARD: BTN.LEFT, DOWN: BTN.DOWN, DOWN_BACK: BTN.DOWN | BTN.RIGHT, DOWN_FORWARD: BTN.DOWN | BTN.LEFT };

/**
 * Hold `hold` for P2 a few frames first (to settle the stance), then run P1's move.
 * P2 stands with its back to the stage edge so holding back can't walk out of range.
 */
function outcome(moveId: string, hold: number, settle = 4): 'hit' | 'block' | 'whiff' {
  const s = fightState('kaito', 'dummy');
  const atEdge = () => {
    s.fighters[1].x = 4700;
    s.fighters[0].x = 4700 - 650;
  };
  atEdge();
  for (let i = 0; i < settle; i++) step(s, [0, hold]);
  atEdge();
  force(s, 0, moveId);
  for (let i = 0; i < 60; i++) {
    step(s, [0, hold]);
    const ev = s.recentEvents.find(
      (e) => e.frame === s.frame && e.fighter === 0 && (e.type === EV.HIT || e.type === EV.COUNTER || e.type === EV.BLOCK),
    );
    if (ev?.type === EV.HIT || ev?.type === EV.COUNTER) return 'hit';
    if (ev?.type === EV.BLOCK) return 'block';
  }
  return 'whiff';
}

describe('guard and hit heights (PLAN §2.4)', () => {
  const table: [string, string, number, 'hit' | 'block' | 'whiff'][] = [
    ['high', 'kaito_1', 0, 'block'], // standing still = standing guard
    ['high', 'kaito_1', P2.BACK, 'block'],
    ['high', 'kaito_1', P2.DOWN, 'whiff'], // highs whiff on crouching opponents
    ['high', 'kaito_1', P2.FORWARD, 'hit'], // walking forward doesn't guard
    ['mid', 'kaito_df1', 0, 'block'],
    ['mid', 'kaito_df1', P2.DOWN, 'hit'], // mids beat crouching guard
    ['mid', 'kaito_df1', P2.DOWN_BACK, 'hit'],
    ['low', 'kaito_d3', 0, 'hit'], // lows beat standing guard
    ['low', 'kaito_d3', P2.BACK, 'hit'],
    ['low', 'kaito_d3', P2.DOWN, 'block'],
    ['low', 'kaito_d3', P2.DOWN_BACK, 'block'],
    ['low', 'kaito_d3', P2.DOWN_FORWARD, 'hit'], // d/f crouches without guarding
  ];
  it.each(table)('%s (%s) vs hold %i → %s', (_h, move, hold, expected) => {
    expect(outcome(move, hold)).toBe(expected);
  });

  it('lows whiff on a jumping opponent', () => {
    const s = fightState('kaito', 'dummy');
    place(s, 650);
    // P2 jumps straight up; P1's shin kick (i15) arrives while P2 is airborne
    step(s, [0, BTN.UP]);
    force(s, 0, 'kaito_d3');
    let connected = false;
    for (let i = 0; i < 40; i++) {
      step(s, [0, BTN.UP]);
      if (s.recentEvents.some((e) => e.frame === s.frame && (e.type === EV.HIT || e.type === EV.BLOCK))) connected = true;
    }
    expect(connected).toBe(false);
  });

  it('a high-crushing move ducks under a high', () => {
    const s = fightState('kaito', 'kaito');
    place(s, 650);
    force(s, 1, 'kaito_b3'); // Phantom Kick: high crush frames 4–16
    step(s, [0, 0]);
    step(s, [0, 0]);
    force(s, 0, 'kaito_1'); // jab arrives on P2's frames ~12–13
    let p1Hit = false;
    for (let i = 0; i < 12; i++) {
      step(s, [0, 0]);
      if (s.recentEvents.some((e) => e.frame === s.frame && e.fighter === 0 && e.type !== EV.SWING)) p1Hit = true;
    }
    expect(p1Hit).toBe(false);
  });

  it('armor absorbs a mid but still takes damage', () => {
    const s = fightState('kaito', 'magnus');
    place(s, 700);
    force(s, 1, 'magnus_b2'); // Iron Wall Hook: armor frames 6–21
    for (let i = 0; i < 6; i++) step(s, [0, 0]);
    force(s, 0, 'kaito_df1'); // i13 mid
    let armored = false;
    for (let i = 0; i < 14; i++) {
      step(s, [0, 0]);
      if (s.recentEvents.some((e) => e.frame === s.frame && e.type === EV.ARMOR)) armored = true;
    }
    expect(armored).toBe(true);
    expect(s.fighters[1].hp).toBe(200 - 12);
    expect(s.fighters[1].state).toBe(FS.ATTACK); // the hook keeps going
  });

  it('simultaneous hits trade: both take damage, no counter hit', () => {
    const s = fightState('dummy', 'dummy');
    place(s, 650);
    force(s, 0, 'dummy_1');
    force(s, 1, 'dummy_1');
    const types: number[] = [];
    for (let i = 0; i < 12; i++) {
      step(s, [0, 0]);
      types.push(...s.recentEvents.filter((e) => e.frame === s.frame && e.type !== EV.SWING).map((e) => e.type));
    }
    expect(types).toEqual([EV.HIT, EV.HIT]);
    expect(s.fighters[0].hp).toBe(193);
    expect(s.fighters[1].hp).toBe(193);
  });
});

describe('throws', () => {
  function throwSetup(hold: number, p2Char = 'dummy'): GameState {
    const s = fightState('kaito', p2Char);
    place(s, 650);
    for (let i = 0; i < 3; i++) step(s, [0, hold]);
    place(s, 650);
    force(s, 0, 'kaito_13'); // Hip Toss, break with 1
    return s;
  }

  it('grabs a standing opponent and deals damage when not broken', () => {
    const s = throwSetup(0);
    for (let i = 0; i < 120 && s.fighters[1].state !== FS.DOWN; i++) step(s, [0, 0]);
    expect(s.fighters[1].state).toBe(FS.DOWN);
    expect(s.fighters[1].hp).toBe(200 - 35);
  });

  it('whiffs on a crouching opponent', () => {
    const s = throwSetup(BTN.DOWN);
    for (let i = 0; i < 40; i++) step(s, [0, BTN.DOWN]);
    expect(s.fighters[1].hp).toBe(200);
    expect(s.fighters[1].state).toBe(FS.CROUCH);
  });

  it('is broken by the matching button inside the window', () => {
    const s = throwSetup(0);
    for (let i = 0; i < 30 && s.fighters[1].state !== FS.THROWN; i++) step(s, [0, 0]);
    expect(s.fighters[1].state).toBe(FS.THROWN);
    step(s, [0, 0]);
    step(s, [0, BTN.B1]);
    expect(s.recentEvents.some((e) => e.type === EV.THROW_BREAK)).toBe(true);
    for (let i = 0; i < 80; i++) step(s, [0, 0]);
    expect(s.fighters[1].hp).toBe(200);
  });

  it('is not broken by the wrong button', () => {
    const s = throwSetup(0);
    for (let i = 0; i < 30 && s.fighters[1].state !== FS.THROWN; i++) step(s, [0, 0]);
    step(s, [0, BTN.B2]);
    for (let i = 0; i < 120 && s.fighters[1].state !== FS.DOWN; i++) step(s, [0, 0]);
    expect(s.fighters[1].hp).toBe(200 - 35);
  });

  it('a side-switching throw swaps the fighters', () => {
    const s = fightState('kaito', 'dummy');
    place(s, 650);
    force(s, 0, 'kaito_24'); // Scissor Takedown switches sides
    for (let i = 0; i < 120 && s.fighters[1].state !== FS.DOWN; i++) step(s, [0, 0]);
    expect(s.fighters[0].x).toBeGreaterThan(s.fighters[1].x);
    for (let i = 0; i < 10; i++) step(s, [0, 0]);
    expect(s.p1OnLeft).toBe(0);
  });

  it('a strike beats a throw on the same frame', () => {
    const s = fightState('kaito', 'kaito');
    place(s, 650);
    force(s, 0, 'kaito_13'); // throw active on frame 12
    step(s, [0, 0]);
    step(s, [0, 0]);
    force(s, 1, 'kaito_1'); // jab hits on its frame 10 = P1's frame 12
    for (let i = 0; i < 12; i++) step(s, [0, 0]);
    expect(s.fighters[0].hp).toBeLessThan(200);
    expect(s.fighters[1].hp).toBe(200);
  });
});

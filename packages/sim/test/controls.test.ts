import { describe, expect, it } from 'vitest';
import { CHARGE_FULL, CHARGE_START, EV, FS, ULT_FREEZE, ULT_MAX } from '../src/constants';
import { dirIndex } from '../src/input';
import { getCharacter } from '../src/roster';
import { step } from '../src/step';
import { BTN, eventsOf, run, setup, tap } from './helpers';

describe('movement', () => {
  it('runs in 8 screen directions (up = world −z)', () => {
    const s = setup('kaito', 'magnus', -1000, 3000);
    const a = s.fighters[0];
    run(s, 20, BTN.UP);
    expect(a.z).toBeLessThan(-1000);
    expect(a.fz).toBe(-1024);
    const z = a.z;
    const x = a.x;
    run(s, 20, BTN.DOWN | BTN.RIGHT);
    expect(a.z).toBeGreaterThan(z);
    expect(a.x).toBeGreaterThan(x);
    run(s, 2, 0);
    expect(a.state).toBe(FS.IDLE);
    expect(a.vx).toBe(0);
  });

  it('mirrored viewers get their directions turned around', () => {
    expect(dirIndex(BTN.UP, false)).toBe(0);
    expect(dirIndex(BTN.UP, true)).toBe(4);
    expect(dirIndex(BTN.LEFT, true)).toBe(2);
  });

  it('double-tapping a direction dashes faster than running', () => {
    const s = setup('kaito', 'magnus', -3000, 5000);
    const a = s.fighters[0];
    step(s, [BTN.RIGHT, 0]);
    step(s, [0, 0]);
    step(s, [BTN.RIGHT, 0]);
    expect(a.state).toBe(FS.DASH);
    const x0 = a.x;
    run(s, 8, BTN.RIGHT);
    expect(a.x - x0).toBeGreaterThan(getCharacter('kaito').speed * 8 * 1.5);
  });

  it('jumps and lands', () => {
    const s = setup();
    const a = s.fighters[0];
    tap(s, 0, BTN.JUMP);
    run(s, 10);
    expect(a.y).toBeGreaterThan(400);
    run(s, 60);
    expect(a.y).toBe(0);
    expect([FS.IDLE, FS.LAND]).toContain(a.state);
  });

  it("can't run off the roof", () => {
    const s = setup('kaito', 'magnus', 6000, -3000);
    run(s, 200, BTN.RIGHT);
    const a = s.fighters[0];
    expect(a.y).toBe(0);
    expect(a.state).toBe(FS.RUN);
    expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(7901);
  });
});

describe('attacks and skills', () => {
  it('tapping Attack strings the full basic combo', () => {
    const s = setup('kaito', 'dummy', 0, 900);
    const hits: number[] = [];
    for (let k = 0; k < 90; k++) {
      step(s, [k % 6 === 0 ? BTN.ATTACK : 0, 0]);
      if (s.fighters[0].state === 6) hits.push(s.fighters[0].action);
    }
    const kaito = getCharacter('kaito');
    for (const idx of kaito.basicIdx) expect(hits).toContain(idx);
    expect(s.fighters[1].hp).toBeLessThan(s.fighters[1].hp + 1);
  });

  it('chords fire skills: Attack+Guard, Attack+Jump, Guard+Jump', () => {
    const k = getCharacter('kaito');
    for (const [chord, slot] of [
      [BTN.ATTACK | BTN.GUARD, 0],
      [BTN.ATTACK | BTN.JUMP, 1],
      [BTN.GUARD | BTN.JUMP, 2],
    ] as const) {
      const s = setup('kaito', 'magnus', -3000, 3000);
      step(s, [chord, 0]);
      expect(s.fighters[0].action).toBe(k.skillIdx[slot]);
      expect(s.fighters[0].cd[slot]).toBeGreaterThan(0);
    }
  });

  it('a chord pressed a couple of frames apart still upgrades into the skill', () => {
    const s = setup('kaito', 'magnus', -3000, 3000);
    step(s, [BTN.ATTACK, 0]);
    expect(s.fighters[0].action).toBe(getCharacter('kaito').basicIdx[0]);
    step(s, [BTN.ATTACK, 0]);
    step(s, [BTN.ATTACK | BTN.GUARD, 0]);
    expect(s.fighters[0].action).toBe(getCharacter('kaito').skillIdx[0]);
  });

  it('skill keys work too, and cooldowns block reuse', () => {
    const s = setup('seren', 'magnus', -3000, 3000);
    tap(s, 0, BTN.SKILL1);
    const a = s.fighters[0];
    expect(eventsOf(s, EV.SKILL)).toBe(1);
    run(s, 60);
    tap(s, 0, BTN.SKILL1);
    expect(a.state).not.toBe(FS.ACTION);
    expect(a.cd[0]).toBeGreaterThan(0);
  });

  it('the ultimate needs a full meter and freezes the world for the cut-in', () => {
    const s = setup('kaito', 'magnus', -2000, 2000);
    tap(s, 0, BTN.ULT);
    expect(s.fighters[0].state).not.toBe(FS.ACTION);
    s.fighters[0].ult = ULT_MAX;
    step(s, [BTN.ATTACK | BTN.GUARD | BTN.JUMP, 0]);
    expect(s.fighters[0].action).toBe(getCharacter('kaito').ultIdx);
    expect(s.freeze).toBe(ULT_FREEZE);
    expect(s.fighters[0].ult).toBe(0);
    const bx = s.fighters[1].x;
    run(s, ULT_FREEZE - 1, 0, BTN.LEFT);
    expect(s.fighters[1].x).toBe(bx);
  });

  it('holding Attack charges a guard-breaking strike', () => {
    const s = setup('kaito', 'magnus', -1500, 0);
    run(s, 40, BTN.ATTACK);
    expect(s.fighters[0].state).toBe(FS.CHARGE);
    run(s, CHARGE_FULL - CHARGE_START, BTN.ATTACK);
    step(s, [0, 0]);
    expect(s.fighters[0].action).toBe(getCharacter('kaito').chargeIdx);
  });
});

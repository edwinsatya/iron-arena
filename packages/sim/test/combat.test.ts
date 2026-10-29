import { describe, expect, it } from 'vitest';
import { END, EV, FS, JUGGLE_LIMIT, PHASE, RING_OUT_Y, ULT_MAX } from '../src/constants';
import { getCharacter } from '../src/roster';
import { step } from '../src/step';
import { BTN, eventsOf, run, setup, tap } from './helpers';

describe('hits and guard', () => {
  it('a basic attack hits and knocks the victim back', () => {
    const s = setup('benika', 'dummy', 0, 900);
    const b = s.fighters[1];
    tap(s, 0, BTN.ATTACK);
    run(s, 12);
    expect(b.hp).toBeLessThan(1000);
    expect(b.x).toBeGreaterThan(900);
  });

  it('guard blocks attacks from the front, not from behind', () => {
    const front = setup('benika', 'dummy', 0, 900);
    front.fighters[1].fx = -1024;
    tap(front, 0, BTN.ATTACK, 1, BTN.GUARD);
    run(front, 12, 0, BTN.GUARD);
    expect(front.fighters[1].hp).toBe(1000);
    expect(eventsOf(front, EV.BLOCK)).toBeGreaterThan(0);

    const back = setup('benika', 'dummy', 0, 900);
    step(back, [0, BTN.GUARD]);
    back.fighters[1].fx = 1024; // turned away
    tap(back, 0, BTN.ATTACK, 1, BTN.GUARD);
    run(back, 12, 0, BTN.GUARD);
    expect(back.fighters[1].hp).toBeLessThan(1000);
  });

  it('charged attacks break guard', () => {
    const s = setup('hyoga', 'dummy', 0, 1100);
    run(s, 50, BTN.ATTACK, BTN.GUARD);
    run(s, 4, 0, BTN.GUARD);
    run(s, 30, 0, BTN.GUARD);
    expect(eventsOf(s, EV.GUARD_BREAK) + (s.fighters[1].state === FS.GUARD_BREAK ? 1 : 0)).toBeGreaterThan(0);
  });

  it('armor takes the hit without flinching', () => {
    const s = setup('dummy', 'hyoga', 0, 900);
    s.fighters[1].fx = -1024;
    tap(s, 1, BTN.SKILL3); // Hyōheki Bastion
    run(s, 50);
    expect(s.fighters[1].buffFrames).toBeGreaterThan(0);
    tap(s, 0, BTN.ATTACK);
    run(s, 10);
    expect(eventsOf(s, EV.ARMOR)).toBe(1);
    expect(s.fighters[1].state).not.toBe(FS.HITSTUN);
  });

  it('Kōbō Aegis turns an incoming hit into a riposte', () => {
    const s = setup('dummy', 'reo', 0, 900);
    s.fighters[1].fx = -1024;
    tap(s, 1, BTN.SKILL3);
    run(s, 4);
    tap(s, 0, BTN.ATTACK);
    run(s, 30);
    expect(s.fighters[0].hp).toBeLessThan(1000);
    expect(s.fighters[1].hp).toBe(getCharacter('reo').hp);
  });

  it('juggles end after the air-hit limit', () => {
    const s = setup('benika', 'dummy');
    const b = s.fighters[1];
    b.state = FS.LAUNCHED;
    b.y = 800;
    b.vy = 20;
    b.airHits = JUGGLE_LIMIT;
    s.fighters[0].x = b.x - 600;
    tap(s, 0, BTN.ATTACK);
    run(s, 10);
    expect(b.hp).toBe(1000);
  });
});

describe('skills', () => {
  const HEROES = ['benika', 'lysa', 'hyoga', 'reo'];

  it('arrows fly, hit at range and vanish', () => {
    const s = setup('lysa', 'dummy', -3000, 3000);
    tap(s, 0, BTN.ATTACK);
    run(s, 10);
    expect(s.projectiles.length).toBe(1);
    run(s, 40);
    expect(s.fighters[1].hp).toBeLessThan(1000);
    expect(s.projectiles.length).toBe(0);
  });

  it('the volley homes in on a target that jumps', () => {
    const s = setup('lysa', 'dummy', -5000, 3000);
    s.fighters[0].ult = ULT_MAX;
    tap(s, 0, BTN.ULT);
    run(s, 48 + 90, 0, (k) => (k % 30 === 0 ? BTN.JUMP : 0));
    expect(s.fighters[1].hp).toBeLessThan(1000);
  });

  it('Konoha Vortex vanishes away and leaves cutting leaves behind', () => {
    const s = setup('lysa', 'dummy', 0, 700);
    tap(s, 0, BTN.SKILL3);
    run(s, 60);
    expect(s.fighters[0].x).toBeLessThan(-3000);
    expect(s.fighters[1].hp).toBeLessThan(1000);
  });

  it('Fubuki Cyclone leaves the target dizzy', () => {
    const s = setup('hyoga', 'dummy', 0, 1000);
    tap(s, 0, BTN.SKILL2);
    run(s, 70);
    expect(s.fighters[1].state).toBe(FS.DIZZY);
  });

  it('War Cry grants extra damage and speed', () => {
    const s = setup('benika', 'dummy', -2000, 2000);
    tap(s, 0, BTN.SKILL3);
    run(s, 30);
    expect(s.fighters[0].buffDamagePct).toBe(25);
    expect(s.fighters[0].buffSpeedPct).toBe(10);
  });

  it('every ultimate connects from mid range', () => {
    for (const h of HEROES) {
      const s = setup(h, 'dummy', -1500, 1500);
      s.fighters[0].ult = ULT_MAX;
      tap(s, 0, BTN.ULT);
      run(s, 220);
      expect(s.fighters[1].hp, h).toBeLessThan(800);
    }
  });

  it('every attacking skill does something to a nearby dummy', () => {
    for (const h of HEROES) {
      for (const [slot, key] of [
        [0, BTN.SKILL1],
        [1, BTN.SKILL2],
      ] as const) {
        const s = setup(h, 'dummy', -1200, 1200);
        tap(s, 0, key);
        run(s, 140);
        expect(s.fighters[1].hp, `${h} skill ${slot + 1}`).toBeLessThan(1000);
      }
    }
  });

  it('skill names are unique and every hero has 3 skills + 1 ultimate', () => {
    for (const id of HEROES) {
      const h = getCharacter(id);
      expect(h.skillIdx).toHaveLength(3);
      const names = [...h.skillIdx, h.ultIdx].map((i) => h.actions[i]!.name);
      expect(new Set(names).size).toBe(4);
      for (const i of [...h.skillIdx, h.ultIdx]) expect(h.actions[i]!.blurb).toBeTruthy();
    }
  });
});

describe('rounds', () => {
  it('a knockback off the roof is a ring-out', () => {
    const s = setup('benika', 'dummy', 6600, 7300);
    s.fighters[0].fx = 1024;
    tap(s, 0, BTN.SKILL2);
    for (let k = 0; k < 200 && s.phase === PHASE.FIGHT; k++) step(s, [0, 0]);
    expect(s.fighters[1].y).toBeLessThan(RING_OUT_Y + 1);
    expect(s.endReason).toBe(END.RING_OUT);
    expect(s.endWinner).toBe(0);
  });

  it('time out: more health wins; first to 2 rounds wins the match', () => {
    const s = setup('benika', 'hyoga');
    s.fighters[1].hp = 500;
    s.timer = 2;
    run(s, 4);
    expect(s.endReason).toBe(END.TIME);
    expect(s.endWinner).toBe(0);
    for (let k = 0; k < 800 && s.phase !== PHASE.MATCH_END; k++) {
      step(s, [0, 0]);
      if (s.phase === PHASE.FIGHT) s.fighters[1].hp = 0;
    }
    expect(s.matchWinner).toBe(0);
  });

  it('KO ends the round and the next round restores health but keeps meter', () => {
    const s = setup('benika', 'dummy', 0, 900);
    s.fighters[1].hp = 5;
    s.fighters[0].ult = 400;
    tap(s, 0, BTN.ATTACK);
    run(s, 14);
    expect(s.phase).toBe(PHASE.KO);
    expect(s.endReason).toBe(END.KO);
    run(s, 400);
    expect(s.round).toBe(2);
    expect(s.fighters[1].hp).toBe(1000);
    expect(s.fighters[0].ult).toBeGreaterThanOrEqual(400);
  });
});

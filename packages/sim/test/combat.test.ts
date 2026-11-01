import { describe, expect, it } from 'vitest';
import { ARENA_WALK_R, END, EV, FS, JUGGLE_LIMIT, PHASE, ULT_MAX, WAKEUP_INVULN } from '../src/constants';
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

describe('Kamakiri and Kurage', () => {
  it('Kamae Snare catches through guard, holds the enemy, then cuts and kicks them away', () => {
    const s = setup('kamakiri', 'dummy', 0, 900);
    const d = s.fighters[1];
    let held = false;
    tap(s, 0, BTN.SKILL3, 1, BTN.GUARD);
    run(s, 70, 0, (k) => {
      if (d.state === FS.HELD) held = true;
      return k < 4 ? BTN.GUARD : 0;
    });
    expect(held).toBe(true);
    expect(d.hp).toBeLessThan(1000 - 80);
    expect(d.heldBy).toBe(-1);
  });

  it("Kamakiri's wind blades, dive and ultimate land from mid range", () => {
    for (const key of [BTN.SKILL1, BTN.SKILL2]) {
      const s = setup('kamakiri', 'dummy', -1200, 1200);
      tap(s, 0, key);
      run(s, 120);
      expect(s.fighters[1].hp, `skill ${key}`).toBeLessThan(1000);
    }
    const s = setup('kamakiri', 'dummy', -1500, 1500);
    s.fighters[0].ult = ULT_MAX;
    tap(s, 0, BTN.ULT);
    run(s, 220);
    expect(s.fighters[1].hp).toBeLessThan(800);
  });

  it('Abyssal Tether drags the enemy in from across the stage and stings again', () => {
    for (const gap of [3000, 2000]) {
      const s = setup('kurage', 'dummy', -gap / 2, gap / 2);
      const d = s.fighters[1];
      tap(s, 0, BTN.SKILL2);
      let hits = 0;
      let hp = d.hp;
      let closest = d.x;
      run(s, 60, 0, () => {
        if (d.hp !== hp) hits++;
        hp = d.hp;
        closest = Math.min(closest, d.x);
        return 0;
      });
      expect(hits, `gap ${gap}`).toBe(2);
      expect(closest, `gap ${gap}`).toBeLessThan(gap / 2 - 600);
    }
  });

  it('Hakkō Pulse leaves a close enemy reeling, and Shiden Bolt hits across the stage', () => {
    const s = setup('kurage', 'dummy', 0, 1000);
    tap(s, 0, BTN.SKILL3);
    run(s, 16);
    expect(s.fighters[1].state).toBe(FS.DIZZY);

    const far = setup('kurage', 'dummy', -3000, 3000);
    tap(far, 0, BTN.SKILL1);
    run(far, 60);
    expect(far.fighters[1].hp).toBeLessThan(1000);
  });

  it("Kurage's ultimate connects from mid range", () => {
    const s = setup('kurage', 'dummy', -1500, 1500);
    s.fighters[0].ult = ULT_MAX;
    tap(s, 0, BTN.ULT);
    run(s, 220);
    expect(s.fighters[1].hp).toBeLessThan(800);
  });
});

describe('rounds', () => {
  it('walls: a knockback into the stage end bounces off it, nobody leaves the stage', () => {
    const s = setup('benika', 'dummy', 5000, 7300);
    // Launched hard toward the right wall
    const v = s.fighters[1];
    v.state = FS.LAUNCHED;
    v.vx = 90;
    v.vy = 40;
    v.y = 200;
    let wall = false;
    for (let k = 0; k < 200 && s.phase === PHASE.FIGHT; k++) {
      step(s, [0, 0]);
      if (eventsOf(s, EV.WALL) > 0) wall = true;
      for (const f of s.fighters) {
        expect(Math.abs(f.x)).toBeLessThanOrEqual(ARENA_WALK_R);
        expect(f.y).toBeGreaterThanOrEqual(0);
      }
    }
    expect(wall).toBe(true);
    expect(v.x).toBeLessThan(ARENA_WALK_R); // bounced back off it
    expect(s.phase).toBe(PHASE.FIGHT);
  });

  it('a double jump clears the opponent: you can jump over them to the other side', () => {
    for (const [me, them] of [
      ['hyoga', 'hyoga'],
      ['kuma', 'hyoga'],
      ['benika', 'kuma'],
    ] as const) {
      const s = setup(me, them, -900, 900);
      const [a, b] = s.fighters;
      step(s, [BTN.JUMP | BTN.RIGHT, 0]);
      let k = 0;
      // Hold right; jump again near the top of the first jump
      for (; k < 200 && !(a.state === FS.AIR && a.vy <= 10); k++) step(s, [BTN.JUMP | BTN.RIGHT, 0]);
      step(s, [BTN.RIGHT, 0]);
      for (k = 0; k < 200 && (a.y > 0 || k < 5); k++) step(s, [k < 14 ? BTN.JUMP | BTN.RIGHT : BTN.RIGHT, 0]);
      expect(a.x, me).toBeGreaterThan(b.x);
    }
  });

  it('double jump: one extra jump in the air, refreshed on landing; tapping Jump makes a short hop', () => {
    const s = setup('benika', 'dummy', -3000, 3000);
    const a = s.fighters[0];
    tap(s, 0, BTN.JUMP);
    let peakTap = 0;
    for (let k = 0; k < 80; k++) {
      step(s, [0, 0]);
      peakTap = Math.max(peakTap, a.y);
    }
    expect(a.y).toBe(0);
    // Held jump goes higher than a tap
    step(s, [BTN.JUMP, 0]);
    let peakHeld = 0;
    for (let k = 0; k < 14; k++) {
      step(s, [BTN.JUMP, 0]);
      peakHeld = Math.max(peakHeld, a.y);
    }
    // Double jump near the top
    step(s, [0, 0]);
    step(s, [BTN.JUMP, 0]);
    expect(a.airJumps).toBe(1);
    expect(s.recentEvents.some((e) => e.type === EV.JUMP && e.value === 1)).toBe(true);
    for (let k = 0; k < 20; k++) {
      step(s, [BTN.JUMP, 0]);
      peakHeld = Math.max(peakHeld, a.y);
    }
    // A third jump is not allowed
    step(s, [0, 0]);
    step(s, [BTN.JUMP, 0]);
    expect(a.airJumps).toBe(1);
    for (let k = 0; k < 120 && a.y > 0; k++) step(s, [0, 0]);
    expect(a.y).toBe(0);
    expect(a.airJumps).toBe(0);
    expect(peakHeld).toBeGreaterThan(peakTap * 1.5);
  });

  it('a tapped double jump goes all the way up, higher than the first jump', () => {
    const s = setup('benika', 'dummy', -3000, 3000);
    const a = s.fighters[0];
    // A full first jump to its top
    step(s, [BTN.JUMP, 0]);
    let k = 0;
    for (; k < 200 && !(a.state === FS.AIR && a.vy <= 0); k++) step(s, [BTN.JUMP, 0]);
    const firstPeak = a.y;
    // Tap Jump for a single frame: the double jump
    step(s, [0, 0]);
    const from = a.y;
    step(s, [BTN.JUMP, 0]);
    expect(a.airJumps).toBe(1);
    let peak = a.y;
    for (k = 0; k < 120 && a.y > 0; k++) {
      step(s, [0, 0]);
      peak = Math.max(peak, a.y);
    }
    expect(peak - from).toBeGreaterThan(firstPeak);
  });

  it('wake-up: after a knockdown the fighter is protected for a moment (they blink)', () => {
    const s = setup('benika', 'dummy', 0, 900);
    const b = s.fighters[1];
    b.state = FS.DOWN;
    b.stateFrame = 0;
    for (let k = 0; k < 200 && b.state !== FS.IDLE; k++) step(s, [0, 0]);
    expect(b.state).toBe(FS.IDLE);
    expect(b.wakeup).toBeGreaterThan(WAKEUP_INVULN - 3);
    // An attack right on wake-up passes through them
    const hp = b.hp;
    tap(s, 0, BTN.ATTACK);
    run(s, 14);
    expect(b.hp).toBe(hp);
    // Once it wears off they can be hit again
    run(s, WAKEUP_INVULN);
    expect(b.wakeup).toBe(0);
    tap(s, 0, BTN.ATTACK);
    run(s, 14);
    expect(b.hp).toBeLessThan(hp);
  });

  it('wake-up: attacking ends the protection', () => {
    const s = setup('benika', 'benika', -3000, 3000);
    const b = s.fighters[1];
    b.state = FS.DOWN;
    b.stateFrame = 0;
    for (let k = 0; k < 200 && b.state !== FS.IDLE; k++) step(s, [0, 0]);
    expect(b.wakeup).toBeGreaterThan(0);
    tap(s, 1, BTN.ATTACK);
    expect(b.state).toBe(FS.ACTION);
    expect(b.wakeup).toBe(0);
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

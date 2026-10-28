import { BTN } from '@neonfist/shared';
import { describe, expect, it } from 'vitest';
import { EV, FS } from '../src/constants';
import { ROSTER } from '../src/roster';
import { step } from '../src/step';
import { fightState, force, measureAdvantage, place } from './helpers';

const BACK_FOR_P2 = BTN.RIGHT; // P2 is on the right, so "back" is RIGHT
const FORWARD_FOR_P2 = BTN.LEFT;

/** Strike moves with a top-level command that can be performed without sidestep. */
function strikes(charId: string) {
  return ROSTER.find((c) => c.id === charId)!.moves.filter(
    (m) => m.height !== 'throw' && m.cmd !== null && m.cmd.motion !== 2,
  );
}

/** Run until the attacker's move connects; returns the event type. */
function untilContact(s: ReturnType<typeof fightState>, defenderHold: number): number {
  for (let i = 0; i < 80; i++) {
    step(s, [0, defenderHold]);
    const ev = s.recentEvents.find(
      (e) => e.frame === s.frame && (e.type === EV.HIT || e.type === EV.BLOCK || e.type === EV.COUNTER),
    );
    if (ev) return ev.type;
  }
  throw new Error('move never connected');
}

describe.each(['kaito', 'magnus', 'dummy'])('%s frame data', (charId) => {
  for (const m of strikes(charId)) {
    const defenderGuard = m.height === 'low' ? BTN.DOWN : 0; // crouch guard vs lows, stand guard otherwise

    it(`${m.id} (${m.command}) is ${m.onBlock >= 0 ? '+' : ''}${m.onBlock} on block`, () => {
      const s = fightState(charId, 'dummy');
      place(s, 650);
      force(s, 0, m.id);
      expect(untilContact(s, defenderGuard)).toBe(EV.BLOCK);
      expect(measureAdvantage(s, 0, defenderGuard)).toBe(m.onBlock);
    });

    if (typeof m.onHit === 'number') {
      it(`${m.id} (${m.command}) is +${m.onHit} on hit`, () => {
        const s = fightState(charId, 'dummy');
        place(s, 650);
        force(s, 0, m.id);
        // Walking forward = not guarding
        expect(untilContact(s, FORWARD_FOR_P2)).toBe(EV.HIT);
        expect(measureAdvantage(s, 0)).toBe(m.onHit);
      });
    }
  }
});

describe('frame data details', () => {
  it('jab hits on its 10th frame (i10)', () => {
    const s = fightState();
    place(s, 650);
    force(s, 0, 'dummy_1');
    let frames = 1;
    while (!s.recentEvents.some((e) => e.type === EV.HIT || e.type === EV.BLOCK)) {
      step(s, [0, 0]);
      frames++;
    }
    expect(frames).toBe(10);
  });

  it('counter hit adds 6 frames of hitstun', () => {
    const s = fightState();
    place(s, 650);
    force(s, 1, 'dummy_df2'); // P2 starts a slow move…
    force(s, 0, 'dummy_1'); // …and gets jabbed during its startup
    const type = untilContact(s, 0);
    expect(type).toBe(EV.COUNTER);
    expect(measureAdvantage(s, 0)).toBe(8 + 6);
  });

  it('a natural combo string cannot be blocked after the first hit', () => {
    const s = fightState();
    place(s, 650);
    force(s, 0, 'dummy_1');
    let hits = 0;
    for (let i = 0; i < 60; i++) {
      // P1 presses 2 a few frames after starting the jab; P2 tries to block (holds back)
      step(s, [i === 4 ? BTN.B2 : 0, i > 12 ? BACK_FOR_P2 : FORWARD_FOR_P2]);
      hits += s.recentEvents.filter((e) => e.frame === s.frame && e.type === EV.HIT).length;
    }
    expect(hits).toBe(2);
    expect(s.fighters[1].hp).toBe(200 - 7 - 10);
  });

  it('a launcher sends the opponent airborne, and they land knocked down', () => {
    const s = fightState();
    place(s, 650);
    force(s, 0, 'dummy_df2');
    untilContact(s, FORWARD_FOR_P2);
    expect(s.fighters[1].state).toBe(FS.AIR);
    for (let i = 0; i < 120 && s.fighters[1].state === FS.AIR; i++) step(s, [0, 0]);
    expect(s.fighters[1].state).toBe(FS.DOWN);
  });
});

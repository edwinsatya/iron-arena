/**
 * Raw input bits, exactly as pressed, in the player's own screen space (PLAN §2.7).
 * Clients send these and nothing else; the simulation turns them into world directions and actions.
 *
 * Controls follow the classic arena-brawler layout: three action buttons (Attack, Guard, Jump)
 * whose chords fire skills — Attack+Guard, Attack+Jump, Guard+Jump, and all three for the ultimate.
 * The four skill bits are one-key shortcuts for those chords.
 */
export const BTN = {
  UP: 1 << 0,
  DOWN: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  ATTACK: 1 << 4,
  GUARD: 1 << 5,
  JUMP: 1 << 6,
  SKILL1: 1 << 7,
  SKILL2: 1 << 8,
  SKILL3: 1 << 9,
  ULT: 1 << 10,
} as const;

export const DIRECTION_MASK = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;
export const BUTTON_MASK = BTN.ATTACK | BTN.GUARD | BTN.JUMP | BTN.SKILL1 | BTN.SKILL2 | BTN.SKILL3 | BTN.ULT;
/** 16 bits go on the wire; 11 are used. */
export const INPUT_MASK = 0xffff;

const ARROWS: Record<string, string> = {
  '': '·',
  u: '↑',
  d: '↓',
  l: '←',
  r: '→',
  ul: '↖',
  ur: '↗',
  dl: '↙',
  dr: '↘',
};

/** Human-readable form of raw input bits, e.g. "↗ A+G" (for the input display). */
export function describeInput(bits: number): string {
  const up = (bits & BTN.UP) !== 0;
  const down = (bits & BTN.DOWN) !== 0;
  const left = (bits & BTN.LEFT) !== 0;
  const right = (bits & BTN.RIGHT) !== 0;
  const v = up && !down ? 'u' : down && !up ? 'd' : '';
  const h = left && !right ? 'l' : right && !left ? 'r' : '';
  const names: [number, string][] = [
    [BTN.ATTACK, 'A'],
    [BTN.GUARD, 'G'],
    [BTN.JUMP, 'J'],
    [BTN.SKILL1, 'S1'],
    [BTN.SKILL2, 'S2'],
    [BTN.SKILL3, 'S3'],
    [BTN.ULT, 'ULT'],
  ];
  const buttons = names
    .filter(([b]) => (bits & b) !== 0)
    .map(([, n]) => n)
    .join('+');
  return buttons ? `${ARROWS[v + h]} ${buttons}` : ARROWS[v + h]!;
}

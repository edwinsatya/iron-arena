/**
 * Raw input bits, exactly as pressed, in the player's own screen space (PLAN §2.7).
 * Clients send these and nothing else; the simulation converts them to forward/back.
 */
export const BTN = {
  UP: 1 << 0,
  DOWN: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  /** 1 = left punch */
  B1: 1 << 4,
  /** 2 = right punch */
  B2: 1 << 5,
  /** 3 = left kick */
  B3: 1 << 6,
  /** 4 = right kick */
  B4: 1 << 7,
} as const;

export const DIRECTION_MASK = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;
export const BUTTON_MASK = BTN.B1 | BTN.B2 | BTN.B3 | BTN.B4;
/** 16 bits go on the wire; only 8 are used today. */
export const INPUT_MASK = 0xffff;

/** Human-readable form of raw input bits, e.g. "↘ 1+2" (for the input display). */
export function describeInput(bits: number): string {
  const up = (bits & BTN.UP) !== 0;
  const down = (bits & BTN.DOWN) !== 0;
  const left = (bits & BTN.LEFT) !== 0;
  const right = (bits & BTN.RIGHT) !== 0;
  const v = up && !down ? 'u' : down && !up ? 'd' : '';
  const h = left && !right ? 'l' : right && !left ? 'r' : '';
  const arrows: Record<string, string> = {
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
  const buttons = [BTN.B1, BTN.B2, BTN.B3, BTN.B4]
    .map((b, i) => ((bits & b) !== 0 ? String(i + 1) : ''))
    .filter(Boolean)
    .join('+');
  return buttons ? `${arrows[v + h]} ${buttons}` : arrows[v + h]!;
}

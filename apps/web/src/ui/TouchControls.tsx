'use client';

import { BTN, DIRECTION_MASK } from '@neonfist/shared';
import { useEffect, useRef, useState } from 'react';
import { touchInput } from '../game/input/touch';

const BUTTONS: { bit: number; label: string; cls: string }[] = [
  { bit: BTN.ATTACK, label: 'ATK', cls: 'big atk' },
  { bit: BTN.GUARD, label: 'GRD', cls: 'big grd' },
  { bit: BTN.JUMP, label: 'JMP', cls: 'big jmp' },
  { bit: BTN.SKILL1, label: '1', cls: 's1' },
  { bit: BTN.SKILL2, label: '2', cls: 's2' },
  { bit: BTN.SKILL3, label: '3', cls: 's3' },
  { bit: BTN.ULT, label: 'ULT', cls: 'ult' },
];

/** Virtual stick and buttons for phones and tablets (shown only on touch screens). */
export function TouchControls() {
  const [on, setOn] = useState(false);
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    setOn(window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
    return () => touchInput.reset();
  }, []);
  if (!on) return null;

  const move = (x: number, y: number) => {
    const o = origin.current;
    if (!o) return;
    const dx = x - o.x;
    const dy = y - o.y;
    const len = Math.hypot(dx, dy);
    const max = 46;
    const k = len > max ? max / len : 1;
    if (knob.current) knob.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    let bits = 0;
    if (len > 14) {
      const a = Math.atan2(dy, dx);
      const oct = Math.round(a / (Math.PI / 4));
      const dirs = [
        BTN.RIGHT,
        BTN.RIGHT | BTN.DOWN,
        BTN.DOWN,
        BTN.DOWN | BTN.LEFT,
        BTN.LEFT,
        BTN.LEFT | BTN.UP,
        BTN.UP,
        BTN.UP | BTN.RIGHT,
      ];
      bits = dirs[(oct + 8) % 8]!;
    }
    touchInput.setDirection(bits, DIRECTION_MASK);
  };

  return (
    <div className="touch" aria-hidden="true">
      <div
        ref={stick}
        className="touch-stick"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const r = stick.current!.getBoundingClientRect();
          origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => origin.current?.id === e.pointerId && move(e.clientX, e.clientY)}
        onPointerUp={() => {
          origin.current = null;
          touchInput.setDirection(0, DIRECTION_MASK);
          if (knob.current) knob.current.style.transform = '';
        }}
        onPointerCancel={() => {
          origin.current = null;
          touchInput.setDirection(0, DIRECTION_MASK);
          if (knob.current) knob.current.style.transform = '';
        }}
      >
        <div ref={knob} className="touch-knob" />
      </div>
      <div className="touch-buttons">
        {BUTTONS.map((b) => (
          <button
            key={b.label}
            type="button"
            className={`touch-btn ${b.cls}`}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              touchInput.press(b.bit);
            }}
            onPointerUp={() => touchInput.release(b.bit)}
            onPointerCancel={() => touchInput.release(b.bit)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

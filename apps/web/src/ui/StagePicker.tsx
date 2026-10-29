'use client';

import { STAGES } from '@neonfist/shared';
import { useEffect, useState } from 'react';
import { stagePreview } from '../game/render2d/stage2d';

/** Arena cards with a painted preview of each stage. */
export function StagePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [shots, setShots] = useState<Record<string, string>>({});
  useEffect(() => {
    // Paint the previews after the first frame so the screen appears at once
    const t = window.setTimeout(() => {
      const out: Record<string, string> = {};
      for (const s of STAGES) out[s.id] = stagePreview(s.id);
      setShots(out);
    }, 30);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="stage-pick" role="group" aria-label="Arena">
      {STAGES.map((s) => (
        <button
          key={s.id}
          type="button"
          className="stage-card"
          data-stage={s.id}
          aria-pressed={value === s.id}
          onClick={() => onChange(s.id)}
        >
          {shots[s.id] && <img src={shots[s.id]} alt="" draggable={false} />}
          <span className="stage-label">
            <b>{s.name}</b>
            <span>{s.time}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

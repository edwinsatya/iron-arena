import { STAGES } from '@neonfist/shared';

export function StagePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
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
          <b>{s.name}</b>
          <span>{s.time}</span>
        </button>
      ))}
    </div>
  );
}

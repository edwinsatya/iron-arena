import { GAME_TITLE } from '@neonfist/shared';
import Link from 'next/link';

/** Screen header: back, title (with a small line above), and the game mark. */
export function Topbar({
  title,
  small,
  back = '/',
  onBack,
}: {
  title: string;
  small?: string;
  back?: string;
  onBack?: () => void;
}) {
  const [a, b] = GAME_TITLE.split(' ');
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="back" onClick={onBack}>
          Back
        </button>
      ) : (
        <Link className="back" href={back}>
          Back
        </Link>
      )}
      <div className="topbar-title">
        {small && <small>{small}</small>}
        <h1>{title}</h1>
      </div>
      <div className="brand" aria-hidden="true">
        {a}
        <b>{b}</b>
      </div>
    </header>
  );
}

/** The 01 / 02 / 03 flow indicator. */
export function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s} data-on={i === at} data-done={i < at}>
          <span className="num">{String(i + 1).padStart(2, '0')}</span> {s}
        </li>
      ))}
    </ol>
  );
}

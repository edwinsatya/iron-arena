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
      <Link className="brand" href="/" aria-label={`${GAME_TITLE}, main menu`}>
        Iron Arena
      </Link>
    </header>
  );
}

/** Where you are in the flow (hero → rival → arena): numbered discs, a tick once done. */
export function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s} data-on={i === at} data-done={i < at} aria-current={i === at ? 'step' : undefined}>
          <span className="num" aria-hidden="true">
            {i < at ? '✓' : i + 1}
          </span>
          {s}
        </li>
      ))}
    </ol>
  );
}

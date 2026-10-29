'use client';

import { getCharacter, selectableCharacters, type CompiledHero } from '@neonfist/sim';
import { useState, type ReactNode } from 'react';
import { KEY_HINTS, type KeyHintSet } from '../game/input/bindings';
import { LOOKS } from '../game/render/looks';
import { HeroShowcase } from './HeroShowcase';
import { Portrait } from './usePortrait';

export interface HeroSelectProps {
  picks: [string | null, string | null];
  /** Which side the grid is choosing for right now (null = nobody, e.g. online and locked in). */
  picking: 0 | 1 | null;
  onPick: (id: string) => void;
  /** Labels above each side, e.g. "P1, your hero" / "CPU, your rival". */
  sideLabels: [string, string];
  /** Player names (online). */
  names?: [string | null, string | null];
  ready?: [boolean, boolean];
  /** Keys shown next to each skill. */
  keys?: KeyHintSet;
  /** Offer a random pick. */
  random?: boolean;
  /** Stage picker, CPU level, buttons… */
  children?: ReactNode;
}

function SkillRows({ hero, keys }: { hero: CompiledHero; keys: KeyHintSet }) {
  const chords = [
    [keys.attack, keys.guard],
    [keys.attack, keys.jump],
    [keys.guard, keys.jump],
  ];
  return (
    <ul className="skill-list">
      {hero.skillIdx.map((idx, k) => {
        const a = hero.actions[idx]!;
        return (
          <li key={a.id}>
            <span className="combo" aria-label={`Key ${keys.skills[k]}`}>
              <span className="kbd">{keys.skills[k]}</span>
              <span className="muted" style={{ fontSize: '0.75rem', alignSelf: 'center' }}>
                or
              </span>
              <span className="kbd dark">{chords[k]!.join('+')}</span>
            </span>
            <div>
              <b>{a.name}</b>
              <span>{a.blurb}</span>
            </div>
          </li>
        );
      })}
      <li className="ult">
        <span className="combo">
          <span className="kbd">{keys.ult}</span>
        </span>
        <div>
          <b>{hero.actions[hero.ultIdx]!.name}</b>
          <span>{hero.actions[hero.ultIdx]!.blurb}. Needs a full meter.</span>
        </div>
      </li>
    </ul>
  );
}

function Side({
  side,
  heroId,
  label,
  name,
  ready,
  alt,
}: {
  side: 0 | 1;
  heroId: string | null;
  label: string;
  name: string | null;
  ready: boolean;
  alt: boolean;
}) {
  const hero = heroId ? getCharacter(heroId) : null;
  const look = heroId ? LOOKS[heroId] : null;
  return (
    <section
      className={`side ${side === 0 ? 'p1' : 'p2'}`}
      style={{ '--hero': look?.color } as React.CSSProperties}
      aria-label={label}
    >
      <span className="side-label">{label}</span>
      <div className="showcase">
        {hero ? (
          <>
            <span className="kana-mark" aria-hidden="true">
              {hero.kana}
            </span>
            <HeroShowcase heroId={hero.id} side={side} alt={alt} />
          </>
        ) : (
          <div className="empty" aria-hidden="true">
            ?
          </div>
        )}
      </div>
      {hero ? (
        <div>
          <h2 className="side-name">{hero.name.split(' ')[0]!.toUpperCase()}</h2>
          <p className="side-title">{hero.title}</p>
          <p className="side-meta">
            {hero.role}
            {name ? `, played by ${name}` : ''}
          </p>
          {ready && <span className="ready-flag">Ready</span>}
        </div>
      ) : (
        <div>
          <h2 className="side-name">???</h2>
          <p className="side-meta">{name ? `${name} is choosing` : 'Waiting for a challenger'}</p>
        </div>
      )}
    </section>
  );
}

/** Hero select: your hero on the left, the grid and their skills in the middle, the rival on the right. */
export function HeroSelect({
  picks,
  picking,
  onPick,
  sideLabels,
  names,
  ready = [false, false],
  keys = KEY_HINTS.solo,
  random,
  children,
}: HeroSelectProps) {
  const heroes = selectableCharacters();
  const [hover, setHover] = useState<string | null>(null);
  const preview = getCharacter(
    hover ?? (picking !== null ? picks[picking] : null) ?? picks[0] ?? heroes[0]!.id,
  );
  const look = LOOKS[preview.id]!;
  const same = picks[0] !== null && picks[0] === picks[1];

  return (
    <div className="select">
      <Side
        side={0}
        heroId={picks[0]}
        label={sideLabels[0]}
        name={names?.[0] ?? null}
        ready={ready[0]}
        alt={false}
      />
      <div className="picker">
        <div className="picker-head">
          <span className="who" style={{ color: picking === 1 ? 'var(--p2)' : 'var(--p1)' }}>
            {picking === null ? 'Locked in' : picking === 0 ? 'Player 1' : 'Player 2'}
          </span>
          <span className="muted">{picking === null ? '' : 'Choose a hero'}</span>
        </div>
        <div className="tiles" role="group" aria-label="Heroes">
          {heroes.map((h) => (
            <button
              key={h.id}
              type="button"
              className="tile"
              style={{ '--hero': LOOKS[h.id]!.color } as React.CSSProperties}
              aria-label={h.name}
              aria-pressed={picking !== null && picks[picking] === h.id}
              data-p1={picks[0] === h.id}
              data-p2={picks[1] === h.id}
              disabled={picking === null}
              onMouseEnter={() => setHover(h.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(h.id)}
              onBlur={() => setHover(null)}
              onClick={() => onPick(h.id)}
            >
              <Portrait heroId={h.id} kind="face" />
              <span className="tile-name">{h.name.split(' ')[0]!.toUpperCase()}</span>
              {picks[0] === h.id && <span className="tag p1">P1</span>}
              {picks[1] === h.id && <span className="tag p2">P2</span>}
            </button>
          ))}
          {random &&
            [0, 1, 2, 3].slice(heroes.length % 4 === 0 ? 4 : heroes.length % 4).map((k) => (
              <span key={k} className="tile random" aria-hidden="true">
                ?
              </span>
            ))}
        </div>
        <div className="hero-detail panel" style={{ '--hero': look.color } as React.CSSProperties}>
          <h3>
            {preview.name} <span style={{ color: look.color }}>{preview.title}</span>
          </h3>
          <div className="role">
            <span>{preview.role}</span>
            <span>
              Difficulty{' '}
              <span className="dots">
                {'■'.repeat(preview.difficulty)}
                {'□'.repeat(3 - preview.difficulty)}
              </span>
            </span>
            <span>{preview.hp} HP</span>
          </div>
          <SkillRows hero={preview} keys={keys} />
        </div>
        {children}
      </div>
      <Side
        side={1}
        heroId={picks[1]}
        label={sideLabels[1]}
        name={names?.[1] ?? null}
        ready={ready[1]}
        alt={same}
      />
    </div>
  );
}

'use client';

import { getCharacter, selectableCharacters, type CompiledHero } from '@neonfist/sim';
import { useMemo, useState, type ReactNode } from 'react';
import { KEY_HINTS, type KeyHintSet } from '../game/input/bindings';
import { LOOKS } from '../game/looks';
import { HeroShowcase } from './HeroShowcase';
import { uiSound } from './uiSound';
import { Portrait } from './usePortrait';

export interface HeroSelectProps {
  picks: [string | null, string | null];
  /** Which side the grid is choosing for right now (null = nobody, e.g. online and locked in). */
  picking: 0 | 1 | null;
  onPick: (id: string) => void;
  /** Labels above each side, e.g. "Player 1" / "The CPU". */
  sideLabels: [string, string];
  /** Player names (online). */
  names?: [string | null, string | null];
  /** Sides that are locked in: they get the wax seal. */
  ready?: [boolean, boolean];
  /** Keys shown next to each skill. */
  keys?: KeyHintSet;
  /** Buttons under the grid (random, etc.). */
  children?: ReactNode;
  /** Heroes are locked in: show this (arena, CPU level, Fight) in place of the grid. */
  arena?: ReactNode;
  /** What to tell each side while it picks. */
  prompts?: [string, string];
}

const COLS = 6;

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
              <span className="muted">or</span>
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

/** 1–5 pips for health, speed and jump, scaled across the roster; difficulty out of 3. */
function useRanges() {
  return useMemo(() => {
    const all = selectableCharacters();
    const span = (f: (h: CompiledHero) => number) => {
      const v = all.map(f);
      return [Math.min(...v), Math.max(...v)] as const;
    };
    return { hp: span((h) => h.hp), speed: span((h) => h.speed), jump: span((h) => h.jumpVy) };
  }, []);
}

function Pips({ value, range, max = 5 }: { value: number; range?: readonly [number, number]; max?: number }) {
  const n = range
    ? Math.max(
        1,
        Math.min(max, 1 + Math.round(((value - range[0]) / Math.max(1, range[1] - range[0])) * (max - 1))),
      )
    : value;
  return (
    <dd aria-label={`${n} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? 'on' : ''} />
      ))}
    </dd>
  );
}

function Side({
  side,
  heroId,
  previewId,
  label,
  name,
  sealed,
  alt,
}: {
  side: 0 | 1;
  heroId: string | null;
  previewId: string | null;
  label: string;
  name: string | null;
  sealed: boolean;
  alt: boolean;
}) {
  const shownId = heroId ?? previewId;
  const hero = shownId ? getCharacter(shownId) : null;
  const look = shownId ? LOOKS[shownId] : null;
  const ranges = useRanges();
  return (
    <section
      className={`side ${side === 0 ? 'p1' : 'p2'}`}
      style={{ '--hero': look?.color } as React.CSSProperties}
      aria-label={label}
    >
      <span className="side-label">{label}</span>
      <div className="niche">
        {hero ? (
          <>
            <span className="kana-mark" aria-hidden="true">
              {hero.kana}
            </span>
            <HeroShowcase
              key={hero.id}
              heroId={hero.id}
              side={side}
              alt={alt}
              mode={heroId ? (sealed ? 'locked' : 'idle') : 'preview'}
            />
          </>
        ) : (
          <div className="empty" aria-hidden="true">
            ?
          </div>
        )}
        {sealed && heroId && (
          <span className="seal" aria-hidden="true">
            {side === 0 ? 'P1' : 'P2'}
          </span>
        )}
      </div>
      {hero ? (
        <div>
          <h2 className="side-name">{hero.name}</h2>
          <p className="side-title">{hero.title}</p>
          <p className="side-meta">
            {hero.role}
            {name ? `, played by ${name}` : ''}
            {!heroId && ' (choosing)'}
          </p>
          <dl className="stats">
            <div className="stat">
              <dt>Health</dt>
              <Pips value={hero.hp} range={ranges.hp} />
            </div>
            <div className="stat">
              <dt>Speed</dt>
              <Pips value={hero.speed} range={ranges.speed} />
            </div>
            <div className="stat">
              <dt>Jump</dt>
              <Pips value={hero.jumpVy} range={ranges.jump} />
            </div>
            <div className="stat">
              <dt>Difficulty</dt>
              <Pips value={hero.difficulty} max={3} />
            </div>
          </dl>
          {sealed && heroId && name && <span className="ready-flag">Ready</span>}
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

/** Hero select: your alcove on the left, the portraits and their skills in the middle, the rival on the right. */
export function HeroSelect({
  picks,
  picking,
  onPick,
  sideLabels,
  names,
  ready = [false, false],
  keys = KEY_HINTS.solo,
  children,
  arena,
  prompts = ['Pick your hero', 'Pick your rival'],
}: HeroSelectProps) {
  const heroes = selectableCharacters();
  const [hover, setHover] = useState<string | null>(null);
  const preview = getCharacter(
    hover ?? (picking !== null ? picks[picking] : null) ?? picks[0] ?? heroes[0]!.id,
  );
  const look = LOOKS[preview.id]!;
  const same = picks[0] !== null && picks[0] === picks[1];
  const previewFor = (side: 0 | 1) => (picking === side && !picks[side] ? hover : null);

  // Arrow keys move the cursor around the grid
  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS };
    const d = moves[e.key];
    if (d === undefined) return;
    const tiles = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button.tile')];
    const at = tiles.indexOf(document.activeElement as HTMLButtonElement);
    const next = at < 0 ? 0 : Math.max(0, Math.min(tiles.length - 1, at + d));
    tiles[next]?.focus();
    e.preventDefault();
  };

  return (
    <div className="select">
      <Side
        side={0}
        heroId={picks[0]}
        previewId={previewFor(0)}
        label={sideLabels[0]}
        name={names?.[0] ?? null}
        sealed={ready[0]}
        alt={false}
      />
      <div className="picker">
        <div className="picker-head">
          <span
            className="who"
            style={{
              color: arena
                ? 'var(--gold)'
                : picking === 1
                  ? '#7aa8ff'
                  : picking === 0
                    ? '#ff7a6a'
                    : 'var(--bone)',
            }}
          >
            {arena ? 'Choose the arena' : picking === null ? 'Locked in' : prompts[picking]}
          </span>
          <span className="muted">
            {arena ? '' : picking === null ? '' : 'Arrows to browse, Enter to choose'}
          </span>
        </div>
        {arena ? (
          <div className="arena-step">{arena}</div>
        ) : (
          <>
            <div className="tiles" role="group" aria-label="Heroes" onKeyDown={onGridKey}>
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
                  onMouseEnter={() => {
                    setHover(h.id);
                    uiSound('move');
                  }}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => {
                    setHover(h.id);
                    uiSound('move');
                  }}
                  onBlur={() => setHover(null)}
                  onClick={() => {
                    uiSound('stamp');
                    onPick(h.id);
                  }}
                >
                  <Portrait heroId={h.id} kind="face" />
                  <span className="tile-name">{h.name}</span>
                  {picks[0] === h.id && <span className="tag p1">P1</span>}
                  {picks[1] === h.id && <span className="tag p2">P2</span>}
                </button>
              ))}
            </div>
            <div className="hero-detail parchment" style={{ '--hero': look.color } as React.CSSProperties}>
              <h3>
                {preview.name}
                <span style={{ color: '#9a2a14' }}>{preview.title}</span>
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
                <span>{preview.hp} health</span>
              </div>
              <SkillRows hero={preview} keys={keys} />
            </div>
            {children}
          </>
        )}
      </div>
      <Side
        side={1}
        heroId={picks[1]}
        previewId={previewFor(1)}
        label={sideLabels[1]}
        name={names?.[1] ?? null}
        sealed={ready[1]}
        alt={same}
      />
    </div>
  );
}

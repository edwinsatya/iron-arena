'use client';

import { getCharacter, selectableCharacters, type CompiledHero } from '@neonfist/sim';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KEY_HINTS, type KeyHintSet } from '../game/input/bindings';
import { LOOKS } from '../game/looks';
import { HeroShowcase } from './HeroShowcase';
import { uiSound } from './uiSound';
import { Portrait } from './usePortrait';

export interface HeroSelectProps {
  picks: [string | null, string | null];
  /** Which side the grid is choosing for right now (null = nobody, e.g. online and locked in). */
  picking: 0 | 1 | null;
  /** A hero was chosen for the side that is picking. */
  onPick: (id: string) => void;
  /** Labels above each side, e.g. "Player 1" / "The CPU". */
  sideLabels: [string, string];
  /** Player names (online). */
  names?: [string | null, string | null];
  /** Sides that are locked in: they get the wax seal. */
  ready?: [boolean, boolean];
  /** Keys shown next to each skill. */
  keys?: KeyHintSet;
  /** Words on the confirm button, e.g. `Choose ${name}` (default) or `Lock in ${name}`. */
  confirmLabel?: (heroName: string) => string;
  /** More buttons beside the confirm button (random…). */
  actions?: ReactNode;
  /** Shown in place of the confirm row while nobody is picking (online, locked in). */
  locked?: ReactNode;
  /** A locked-in side can be changed: a "Change" button appears under it. */
  onChange?: (side: 0 | 1) => void;
  /** Which sides get that button (online: only your own). */
  changeable?: [boolean, boolean];
  /** Heroes are locked in: show this (arena, CPU level, Fight) in place of the grid. */
  arena?: ReactNode;
  /** What to tell each side while it picks. */
  prompts?: [string, string];
}

const COLS = 6;

/** Phones and tablets: tap wording, and skill art in place of keyboard keys. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(pointer: coarse)');
    const on = () => setCoarse(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return coarse;
}

function SkillRows({ hero, keys, touch }: { hero: CompiledHero; keys: KeyHintSet; touch: boolean }) {
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
            {touch ? (
              <Portrait heroId={hero.id} kind={`skill:${a.id}`} className="skill-ico" />
            ) : (
              <span className="combo" aria-label={`Key ${keys.skills[k]}`}>
                <span className="kbd">{keys.skills[k]}</span>
                <span className="muted">or</span>
                <span className="kbd dark">{chords[k]!.join('+')}</span>
              </span>
            )}
            <div>
              <b>{a.name}</b>
              <span>{a.blurb}</span>
            </div>
          </li>
        );
      })}
      <li className="ult">
        {touch ? (
          <Portrait
            heroId={hero.id}
            kind={`skill:${hero.actions[hero.ultIdx]!.id}`}
            className="skill-ico ult"
          />
        ) : (
          <span className="combo">
            <span className="kbd">{keys.ult}</span>
          </span>
        )}
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
  onChange,
}: {
  side: 0 | 1;
  heroId: string | null;
  previewId: string | null;
  label: string;
  name: string | null;
  sealed: boolean;
  alt: boolean;
  onChange?: () => void;
}) {
  // While a side is choosing it shows the hero being looked at, faintly
  const shownId = previewId ?? heroId;
  const previewing = !!previewId && previewId !== heroId;
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
              mode={previewing ? 'preview' : sealed ? 'locked' : 'idle'}
            />
          </>
        ) : (
          <div className="empty" aria-hidden="true">
            ?
          </div>
        )}
        {sealed && heroId && !previewing && (
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
            {previewing && ' (looking)'}
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
          {sealed && heroId && !previewing && onChange && (
            <button
              type="button"
              className="btn ghost small change"
              onClick={() => {
                uiSound('back');
                onChange();
              }}
            >
              Change
            </button>
          )}
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

/**
 * Hero select: your alcove on the left, the portraits and their skills in the middle, the rival
 * on the right. Pointing at or clicking a portrait only looks at that hero (their skills, their
 * alcove); the hero is chosen with the confirm button, a second click, or Enter.
 */
export function HeroSelect({
  picks,
  picking,
  onPick,
  sideLabels,
  names,
  ready = [false, false],
  keys = KEY_HINTS.solo,
  confirmLabel = (n) => `Choose ${n}`,
  actions,
  locked,
  onChange,
  changeable = [true, true],
  arena,
  prompts = ['Pick your hero', 'Pick your rival'],
}: HeroSelectProps) {
  const heroes = selectableCharacters();
  // The hero being looked at (clicked or keyboard-focused) and the one under the pointer
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const touch = useCoarsePointer();
  const current = picking !== null ? picks[picking] : null;
  // Each side starts by looking at its current hero (or at nobody)
  useEffect(() => setFocus(current), [picking]); // eslint-disable-line react-hooks/exhaustive-deps
  const looking = hover ?? focus;
  const detail = getCharacter(looking ?? current ?? picks[0] ?? heroes[0]!.id);
  const look = LOOKS[detail.id]!;
  const same = picks[0] !== null && picks[0] === picks[1];
  const previewFor = (side: 0 | 1) => (picking === side ? looking : null);
  const target = focus ?? current;

  const confirm = (id: string) => {
    uiSound('stamp');
    setHover(null);
    onPick(id);
  };

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
        onChange={onChange && changeable[0] && picking !== 0 ? () => onChange(0) : undefined}
      />
      <div className="picker">
        <div className="picker-head">
          <span
            className="who"
            style={{
              color: arena
                ? 'var(--gold)'
                : picking === 1
                  ? 'var(--p2-hi)'
                  : picking === 0
                    ? 'var(--p1-hi)'
                    : 'var(--bone)',
            }}
          >
            {arena ? 'Choose the arena' : picking === null ? 'Locked in' : prompts[picking]}
          </span>
          <span className="muted">
            {arena || picking === null
              ? ''
              : touch
                ? 'Tap a hero to see their skills, tap again to choose'
                : 'Click a hero to see their skills, click again to choose'}
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
                  aria-pressed={focus === h.id}
                  data-looking={looking === h.id}
                  data-p1={picks[0] === h.id}
                  data-p2={picks[1] === h.id}
                  disabled={picking === null}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== 'mouse') return;
                    setHover(h.id);
                    uiSound('move');
                  }}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                  onFocus={(e) => {
                    // Keyboard focus looks at the hero; a click is handled below
                    if (e.currentTarget.matches(':focus-visible')) {
                      setFocus(h.id);
                      uiSound('move');
                    }
                  }}
                  onClick={() => {
                    if (focus === h.id) confirm(h.id);
                    else {
                      setFocus(h.id);
                      uiSound('move');
                    }
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
                {detail.name}
                <span style={{ color: 'var(--ink-red)' }}>{detail.title}</span>
              </h3>
              <div className="role">
                <span>{detail.role}</span>
                <span>
                  Difficulty{' '}
                  <span className="dots">
                    {'■'.repeat(detail.difficulty)}
                    {'□'.repeat(3 - detail.difficulty)}
                  </span>
                </span>
                <span>{detail.hp} health</span>
              </div>
              <SkillRows hero={detail} keys={keys} touch={touch} />
            </div>
            {picking !== null ? (
              <div className="picker-actions confirm-row">
                <button
                  type="button"
                  className="btn confirm"
                  disabled={!target}
                  onClick={() => target && confirm(target)}
                >
                  {target
                    ? confirmLabel(getCharacter(target).name)
                    : touch
                      ? 'Tap a hero first'
                      : 'Click a hero first'}
                </button>
                {actions}
              </div>
            ) : (
              locked
            )}
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
        onChange={onChange && changeable[1] && picking !== 1 ? () => onChange(1) : undefined}
      />
    </div>
  );
}

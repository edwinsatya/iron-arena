'use client';

import { isValidRoomCode } from '@neonfist/shared';
import { checksum, getCharacter, PHASE, type GameState } from '@neonfist/sim';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GameView } from '../game/GameView';
import { KEY_HINTS } from '../game/input/bindings';
import { RoomController } from '../net/room';
import { HeroSelect } from './HeroSelect';
import { ResultCard } from './ResultCard';
import { cleanName, loadSettings, saveSettings } from './settings';
import { Topbar } from './Topbar';

/** Online room: name → invite → hero select → connect → fight → results (PLAN §2.9). */
export function RoomScreen({ code }: { code: string }) {
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const saved = loadSettings().name;
    if (saved) setName(saved);
  }, []);

  if (!isValidRoomCode(code)) {
    return (
      <main className="screen">
        <Topbar title="No such room" small="Online" />
        <div className="card panel" style={{ margin: '0 auto' }}>
          <p style={{ marginTop: 0 }}>Room codes are 6 letters and numbers, like K7Q2XM.</p>
          <Link className="btn" href="/">
            Back to the start
          </Link>
        </div>
      </main>
    );
  }

  if (!name) {
    return (
      <main className="screen">
        <Topbar title={`Room ${code}`} small="You've been challenged" />
        <form
          className="card panel"
          style={{ margin: '6vh auto 0', display: 'grid', gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            const n = cleanName(draft) || 'Player';
            saveSettings({ name: n });
            setName(n);
          }}
        >
          <h2>Pick a fighter name</h2>
          <label htmlFor="room-name" className="muted">
            Your opponent sees this above your health bar.
          </label>
          <input
            id="room-name"
            className="field"
            autoFocus
            maxLength={16}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn" type="submit">
            Enter the room
          </button>
        </form>
      </main>
    );
  }
  return <Room code={code} name={name} />;
}

function Room({ code, name }: { code: string; name: string }) {
  const [controller, setController] = useState<RoomController | null>(null);
  useEffect(() => {
    const relay = new URLSearchParams(window.location.search).has('relay');
    const c = new RoomController(code, name, { forceRelay: relay });
    setController(c);
    return () => c.dispose();
  }, [code, name]);
  if (!controller) return <main className="screen" />;
  return <RoomView controller={controller} />;
}

type View = ReturnType<RoomController['getSnapshot']>;

function playerName(v: View, i: 0 | 1) {
  return v.players[i]?.name ?? (i === 0 ? 'Player 1' : 'Player 2');
}

function RoomView({ controller }: { controller: RoomController }) {
  const v = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [copied, setCopied] = useState(false);
  const [matchOver, setMatchOver] = useState(false);
  const reported = useRef(false);

  useEffect(() => {
    if (v.status === 'fighting') {
      reported.current = false;
      setMatchOver(false);
    }
  }, [v.status, v.driver]);

  const onFrame = useCallback(
    (s: GameState) => {
      if (s.phase === PHASE.MATCH_END && s.phaseFrame > 120 && !reported.current) {
        reported.current = true;
        setMatchOver(true);
        controller.reportResult(s.matchWinner as 0 | 1 | -1, checksum(s));
      }
    },
    [controller],
  );

  const you = v.you ?? 0;
  const names = useMemo(() => ({ p1: playerName(v, 0), p2: playerName(v, 1) }), [v]);
  const hud = useMemo(
    () => ({
      names,
      trays: (you === 0 ? [KEY_HINTS.solo, null] : [null, KEY_HINTS.solo]) as [
        typeof KEY_HINTS.solo | null,
        typeof KEY_HINTS.solo | null,
      ],
      stats: false,
      stage: v.config?.stage,
      badges: (you === 0 ? ['YOU', 'P2'] : ['P1', 'YOU']) as [string, string],
    }),
    [names, you, v.config?.stage],
  );

  if (v.status === 'error') {
    return (
      <main className="screen">
        <Topbar title="Can't join" small="Online" />
        <div className="card panel" style={{ margin: '0 auto' }}>
          <p className="notice" style={{ marginTop: 0 }}>
            {v.error}
          </p>
          <Link className="btn" href="/">
            Back to the start
          </Link>
        </div>
      </main>
    );
  }

  if ((v.status === 'fighting' || v.status === 'results') && v.driver) {
    const state = v.driver.state;
    return (
      <GameView driver={v.driver} hud={hud} mirrored={!!v.config?.viewMirrored[you]} onFrame={onFrame} touch>
        {v.peerPaused && (
          <div className="corner-menu left" style={{ top: 'auto', bottom: 140 }}>
            <span className="notice">
              Your opponent switched away from the game. The fight waits for them.
            </span>
          </div>
        )}
        {v.notice && !matchOver && (
          <div className="overlay">
            <div className="card panel">
              <h2>Connection</h2>
              <p>{v.notice}</p>
              <div className="actions">
                <button className="btn" onClick={() => controller.reselect()}>
                  Back to the room
                </button>
                <Link className="btn ghost" href="/">
                  Leave
                </Link>
              </div>
            </div>
          </div>
        )}
        {v.desync && <DesyncNotice bundle={v.desync} />}
        {(matchOver || v.status === 'results') && (
          <ResultCard state={state} names={[names.p1, names.p2]}>
            {v.players.map((p, i) =>
              p?.rematch && i !== you ? (
                <p key={i} className="notice" style={{ width: '100%', margin: '0 0 6px' }}>
                  {p.name} wants a rematch
                </p>
              ) : null,
            )}
            <button className="btn" onClick={() => controller.rematch()} disabled={!!v.players[you]?.rematch}>
              {v.players[you]?.rematch ? 'Waiting for your opponent…' : 'Rematch'}
            </button>
            <button className="btn ghost" onClick={() => controller.reselect()}>
              Change hero
            </button>
          </ResultCard>
        )}
      </GameView>
    );
  }

  if (v.status === 'linking' || v.status === 'syncing' || v.status === 'fighting') {
    const c = v.config;
    return (
      <main className="screen">
        <div className="status-steps panel">
          <h1>Get ready</h1>
          {c && (
            <p className="vs-line">
              <span style={{ color: 'var(--p1)' }}>{getCharacter(c.fighters[0]).name.split(' ')[0]}</span>
              <span className="vs">VS</span>
              <span style={{ color: 'var(--p2)' }}>{getCharacter(c.fighters[1]).name.split(' ')[0]}</span>
            </p>
          )}
          <ol aria-live="polite">
            {v.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
            <li className="now">{v.status === 'syncing' ? 'Waiting for both players…' : 'Connecting…'}</li>
          </ol>
          {v.notice && <p className="notice">{v.notice}</p>}
        </div>
      </main>
    );
  }

  // Lobby: waiting for a friend, then hero select
  const me = v.players[you];
  const other = v.players[1 - you];
  const link = typeof window !== 'undefined' ? `${window.location.origin}/room/${v.code}` : '';
  const picks: [string | null, string | null] = [
    v.players[0]?.fighter ?? null,
    v.players[1]?.fighter ?? null,
  ];
  const ready: [boolean, boolean] = [!!v.players[0]?.ready, !!v.players[1]?.ready];

  return (
    <main className="screen">
      <Topbar
        title={other ? 'Choose your fighter' : 'Invite your friend'}
        small={`Online room ${v.code}`}
        onBack={() => {
          controller.leave();
          window.location.href = '/';
        }}
      />
      {v.notice && (
        <p className="notice" style={{ maxWidth: 980, margin: '0 auto 20px' }}>
          {v.notice}
        </p>
      )}
      {!other && (
        <section className="invite panel" aria-label="Invite">
          <span className="invite-code">{v.code}</span>
          <div>
            <p>Send this link to your friend. Hero select opens as soon as they join.</p>
            <button
              className="btn p2"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
            <p className="link">{link}</p>
          </div>
        </section>
      )}
      <HeroSelect
        picks={picks}
        picking={v.phase === 'waiting' && !other ? you : me?.ready ? null : you}
        onPick={(id) => controller.select(id)}
        sideLabels={[
          you === 0 ? 'P1, you' : 'P1, your opponent',
          you === 1 ? 'P2, you' : 'P2, your opponent',
        ]}
        names={[v.players[0]?.name ?? null, v.players[1]?.name ?? null]}
        ready={ready}
      >
        {other && (
          <div className="picker-actions">
            <button className="btn" disabled={!me?.fighter} onClick={() => controller.ready(!me?.ready)}>
              {me?.ready ? 'Cancel ready' : 'Ready'}
            </button>
          </div>
        )}
      </HeroSelect>
    </main>
  );
}

function DesyncNotice({ bundle }: { bundle: NonNullable<View['desync']> }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `desync-${bundle.frame}.json`;
    a.click();
  };
  return (
    <div className="overlay">
      <div className="card panel">
        <h2>Out of sync</h2>
        <p>
          The two games stopped matching at frame {bundle.frame}. That&apos;s a bug in the game, not your
          connection. Download the report and run <code>pnpm replay</code> on it to find the cause.
        </p>
        <div className="actions">
          <button className="btn" onClick={download}>
            Download desync report
          </button>
          <Link className="btn ghost" href="/">
            Leave
          </Link>
        </div>
      </div>
    </div>
  );
}

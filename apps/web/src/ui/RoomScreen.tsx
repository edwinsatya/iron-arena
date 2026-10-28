'use client';

import { isValidRoomCode, type MatchConfig } from '@neonfist/shared';
import { checksum, getCharacter, PHASE, type GameState } from '@neonfist/sim';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GameView } from '../game/GameView';
import { RoomController } from '../net/room';
import { Controls } from './Controls';
import { FighterSelect } from './FighterSelect';
import { cleanName, loadSettings, saveSettings } from './settings';

/** Online room: name → lobby/character select → connect → fight → results (PLAN §2.9). */
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
        <h1 className="screen-title display">No such room</h1>
        <p>Room codes are 6 letters and numbers, like K7Q2XM.</p>
        <Link className="btn" href="/">
          Back to the start
        </Link>
      </main>
    );
  }

  if (!name) {
    return (
      <main className="screen">
        <div className="overlay-card slab" style={{ margin: '12vh auto 0' }}>
          <h1 className="screen-title display">Room {code}</h1>
          <form
            className="home-form"
            onSubmit={(e) => {
              e.preventDefault();
              const n = cleanName(draft) || 'Player';
              saveSettings({ name: n });
              setName(n);
            }}
          >
            <label className="home-label" htmlFor="room-name">
              Your fighter name
            </label>
            <input id="room-name" className="field" autoFocus maxLength={16} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn" type="submit">
              Enter the room
            </button>
          </form>
        </div>
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

function playerName(v: ReturnType<RoomController['getSnapshot']>, i: 0 | 1) {
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
      if (s.phase === PHASE.MATCH_END && s.phaseFrame > 150 && !reported.current) {
        reported.current = true;
        setMatchOver(true);
        controller.reportResult(s.matchWinner as 0 | 1 | -1, checksum(s));
      }
    },
    [controller],
  );

  const names = useMemo(() => ({ p1: playerName(v, 0).toUpperCase(), p2: playerName(v, 1).toUpperCase() }), [v]);

  if (v.status === 'error') {
    return (
      <main className="screen">
        <h1 className="screen-title display">Can&apos;t join</h1>
        <p className="notice">{v.error}</p>
        <Link className="btn" href="/">
          Back to the start
        </Link>
      </main>
    );
  }

  if ((v.status === 'fighting' || v.status === 'results') && v.driver) {
    const winner = v.driver.state.matchWinner;
    return (
      <GameView driver={v.driver} names={names} mirrored={!!v.config?.viewMirrored[v.you ?? 0]} onFrame={onFrame}>
        {v.peerPaused && (
          <div className="corner-menu left">
            <span className="notice">Your opponent switched away from the game window. The fight waits for them.</span>
          </div>
        )}
        {v.notice && !matchOver && (
          <div className="overlay">
            <div className="overlay-card slab">
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
          <div className="overlay">
            <div className="overlay-card slab">
              <h2 className="results-title display">
                {winner < 0 ? 'Draw' : winner === v.you ? 'You win' : `${playerName(v, winner as 0 | 1)} wins`}
              </h2>
              <p className="muted">
                Rounds {v.driver.state.fighters[0].roundsWon}–{v.driver.state.fighters[1].roundsWon}
              </p>
              {v.players.map((p, i) =>
                p?.rematch ? (
                  <p key={i} className="muted">
                    {p.name} wants a rematch
                  </p>
                ) : null,
              )}
              <div className="actions">
                <button className="btn" onClick={() => controller.rematch()} disabled={!!v.players[v.you ?? 0]?.rematch}>
                  {v.players[v.you ?? 0]?.rematch ? 'Waiting for your opponent…' : 'Rematch'}
                </button>
                <button className="btn ghost" onClick={() => controller.reselect()}>
                  Change fighter
                </button>
              </div>
            </div>
          </div>
        )}
      </GameView>
    );
  }

  if (v.status === 'linking' || v.status === 'syncing' || v.status === 'fighting') {
    return (
      <main className="screen">
        <h1 className="screen-title display">Get ready</h1>
        <ConfigSummary config={v.config} v={v} />
        <ul className="status-list" aria-live="polite">
          {v.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
          <li>{v.status === 'syncing' ? 'Waiting for both players…' : 'Connecting…'}</li>
        </ul>
        {v.notice && <p className="notice">{v.notice}</p>}
      </main>
    );
  }

  // Lobby: waiting for a friend, then character select
  const you = v.you ?? 0;
  const me = v.players[you];
  const other = v.players[1 - you];
  const link = typeof window !== 'undefined' ? `${window.location.origin}/room/${v.code}` : '';
  const picks: [string | null, string | null] = [v.players[0]?.fighter ?? null, v.players[1]?.fighter ?? null];

  return (
    <main className="screen">
      <div className="screen-head">
        <h1 className="screen-title display">{other ? 'Choose your fighter' : 'Invite your friend'}</h1>
        <button
          className="back"
          onClick={() => {
            controller.leave();
            window.location.href = '/';
          }}
        >
          Leave room
        </button>
      </div>

      {v.notice && <p className="notice">{v.notice}</p>}

      {!other && (
        <div className="slab" style={{ marginBottom: 26 }}>
          <p style={{ marginTop: 0 }}>Send this link to your friend. The fight starts once you both pick a fighter.</p>
          <div className="share">
            <span className="share-code display">{v.code}</span>
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
          </div>
          <p className="muted" style={{ marginBottom: 0, wordBreak: 'break-all' }}>
            {link}
          </p>
        </div>
      )}

      {v.phase !== 'waiting' && (
        <FighterSelect
          picks={picks}
          active={you}
          locked={[!!v.players[0]?.ready, !!v.players[1]?.ready]}
          onPick={(_p, id) => controller.select(id)}
        />
      )}

      <div className="panel-row">
        <div>
          {([0, 1] as const).map((i) => {
            const p = v.players[i];
            return (
              <div key={i} className="player-chip" style={{ '--c': i === 0 ? 'var(--p1)' : 'var(--p2)' } as React.CSSProperties}>
                <span>
                  P{i + 1} {p ? p.name : '—'} {i === you && <span className="muted">(you)</span>}
                </span>
                <span className="muted">
                  {!p ? 'Waiting to join' : p.ready ? `Ready — ${getCharacter(p.fighter!).short}` : p.fighter ? getCharacter(p.fighter).name : 'Choosing'}
                </span>
              </div>
            );
          })}
          {other && (
            <div className="actions">
              <button className="btn amber" disabled={!me?.fighter} onClick={() => controller.ready(!me?.ready)}>
                {me?.ready ? 'Cancel ready' : 'Ready'}
              </button>
            </div>
          )}
        </div>
        <div className="slab">
          <Controls />
          <p className="muted" style={{ marginBottom: 0 }}>
            Gamepads work too. F1 hitboxes · F2 frame data · F3 network.
          </p>
        </div>
      </div>
    </main>
  );
}

function ConfigSummary({ config, v }: { config: MatchConfig | null; v: ReturnType<RoomController['getSnapshot']> }) {
  if (!config) return null;
  return (
    <p className="muted">
      {playerName(v, 0)} as {getCharacter(config.fighters[0]).name} vs {playerName(v, 1)} as{' '}
      {getCharacter(config.fighters[1]).name} · first to {config.roundsToWin}
    </p>
  );
}

function DesyncNotice({ bundle }: { bundle: NonNullable<ReturnType<RoomController['getSnapshot']>['desync']> }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `desync-${bundle.frame}.json`;
    a.click();
  };
  return (
    <div className="overlay">
      <div className="overlay-card slab">
        <h2 className="display" style={{ fontSize: '2.4rem', margin: 0 }}>
          Out of sync
        </h2>
        <p>
          The two games stopped matching at frame {bundle.frame}. That&apos;s a bug in the game, not your connection. Download
          the report and run <code>pnpm replay</code> on it to find the cause.
        </p>
        <div className="actions">
          <button className="btn amber" onClick={download}>
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

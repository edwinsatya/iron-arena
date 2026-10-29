'use client';

import { isValidRoomCode, normalizeRoomCode } from '@neonfist/shared';
import { selectableCharacters } from '@neonfist/sim';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LOOKS } from '../src/game/looks';
import { createRoom } from '../src/net/lobby';
import { AttractMode } from '../src/ui/AttractMode';
import { cleanName, loadSettings, saveSettings } from '../src/ui/settings';
import { Portrait } from '../src/ui/usePortrait';

const MENU: { href: string; name: string; hint: string }[] = [
  { href: '/versus', name: 'Versus CPU', hint: 'Against the computer' },
  { href: '/local', name: 'Local versus', hint: 'Two players, one keyboard' },
  { href: '/training', name: 'Training', hint: 'Combos on a dummy' },
  { href: '/how-to-play', name: 'Heroes & keys', hint: 'Every skill and key' },
  { href: '/settings', name: 'Settings', hint: 'Name, sound, graphics' },
];

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(loadSettings().name);
  }, []);

  const keepName = () => saveSettings({ name: cleanName(name) || 'Player' });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    keepName();
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom();
      router.push(`/room/${room}`);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error && err.message.startsWith("Couldn't")
          ? err.message
          : "Couldn't reach the lobby server. Start it with pnpm dev, or check NEXT_PUBLIC_LOBBY_URL.",
      );
    }
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (!isValidRoomCode(c)) {
      setError('Room codes are 6 letters and numbers, like K7Q2XM.');
      return;
    }
    keepName();
    router.push(`/room/${c}`);
  }

  return (
    <main className="home">
      <AttractMode className="home-bg" />
      <div className="home-shade" />
      <div className="home-left">
        <h1 className="logo" aria-label="NEON FIST">
          <span>NEON</span>
          <span className="l2">FIST</span>
          <span className="logo-kana" aria-hidden="true">
            ネオンフィスト
          </span>
        </h1>
        <p className="tagline">
          {selectableCharacters().length} heroes. Three skills and an ultimate each. Walls at both ends, so there is
          nowhere to run.
        </p>

        <section className="online-box panel" aria-label="Play online">
          <h2 className="online-title">Play a friend online</h2>
          <form onSubmit={onCreate} style={{ display: 'grid', gap: 8 }}>
            <label htmlFor="name">Your fighter name</label>
            <div className="row">
              <input
                id="name"
                className="field"
                value={name}
                maxLength={16}
                placeholder="Edwin"
                autoComplete="nickname"
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create a room'}
              </button>
            </div>
          </form>
          <form className="row" onSubmit={onJoin}>
            <input
              className="field code"
              value={code}
              placeholder="ROOM CODE"
              aria-label="Room code"
              maxLength={6}
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            />
            <button className="btn p2" type="submit">
              Join
            </button>
          </form>
          {error && (
            <p className="home-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <nav aria-label="More ways to play">
          <ul className="menu">
            {MENU.map((m) => (
              <li key={m.href}>
                <Link className="menu-item" href={m.href}>
                  <span className="name">{m.name}</span>
                  <span className="hint">{m.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="home-foot">
          Free, no install, rollback netcode. Hero sprites and art by{' '}
          <a href="https://elie-automata.itch.io/" target="_blank" rel="noreferrer">
            elie automata
          </a>
          .
        </p>
      </div>
      <nav className="home-roster" aria-label="Heroes">
        {selectableCharacters().map((h) => (
          <Link
            key={h.id}
            href={`/how-to-play#${h.id}`}
            aria-label={h.name}
            style={{ '--hero': LOOKS[h.id]!.color } as React.CSSProperties}
          >
            <Portrait heroId={h.id} kind="face" />
            <span>{h.name.split(' ')[0]!.toUpperCase()}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}

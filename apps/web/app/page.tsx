'use client';

import { GAME_TITLE, isValidRoomCode, normalizeRoomCode } from '@neonfist/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createRoom } from '../src/net/lobby';
import { AttractMode } from '../src/ui/AttractMode';
import { cleanName, loadSettings, saveSettings } from '../src/ui/settings';

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
      <div className="home-panel">
        <h1 className="home-title display">{GAME_TITLE}</h1>
        <p className="home-tagline">Rooftop fights with a friend. Send a link, pick a fighter, and go — no install.</p>

        <form className="home-form" onSubmit={onCreate}>
          <label className="home-label" htmlFor="name">
            Your fighter name
          </label>
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
            {busy ? 'Creating room…' : 'Create a room'}
          </button>
        </form>

        <form className="home-join" onSubmit={onJoin}>
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

        <nav className="home-links" aria-label="More ways to play">
          <Link href="/local">Local versus</Link>
          <Link href="/training">Training</Link>
          <Link href="/how-to-play">How to play</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </div>
    </main>
  );
}

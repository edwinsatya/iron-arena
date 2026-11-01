'use client';

import { isValidRoomCode, normalizeRoomCode } from '@neonfist/shared';
import { selectableCharacters } from '@neonfist/sim';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoom } from '../src/net/lobby';
import { cleanName, loadSettings, saveSettings } from '../src/ui/settings';
import { TitleScene } from '../src/ui/TitleScene';
import { uiSound } from '../src/ui/uiSound';

const MENU: { href: string; name: string; hint: string }[] = [
  { href: '/versus', name: 'Versus CPU', hint: 'Fight the computer' },
  { href: '/local', name: 'Local versus', hint: 'Two players, one keyboard' },
  { href: '/training', name: 'Training', hint: 'Practise combos on a dummy' },
  { href: '/how-to-play', name: 'Heroes & keys', hint: 'Every skill and every key' },
  { href: '/settings', name: 'Settings', hint: 'Name, sound, graphics' },
];

export default function Home() {
  const router = useRouter();
  const heroes = useMemo(() => selectableCharacters(), []);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menu = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setName(loadSettings().name);
  }, []);

  const keepName = () => saveSettings({ name: cleanName(name) || 'Player' });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    keepName();
    uiSound('confirm');
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
    uiSound('confirm');
    router.push(`/room/${c}`);
  }

  // Up and down move the cursor through the menu, like a console title screen
  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(menu.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLAnchorElement);
    const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  }

  return (
    <main className="title">
      <TitleScene heroes={heroes} />
      <div className="title-shade" />
      <div className="title-inner">
        <header className="title-head">
          <h1 className="logo">Iron Arena</h1>
          <p className="logo-kana" aria-hidden="true">
            アイアン・アリーナ
          </p>
          <p className="tagline">
            {heroes.length} heroes, three skills and an ultimate each. Stone walls at both ends, so nobody
            gets away.
          </p>
        </header>

        <div className="title-panels">
          <nav className="title-menu panel" aria-label="Play">
            <ul ref={menu} onKeyDown={onMenuKey}>
              {MENU.map((m) => (
                <li key={m.href}>
                  <Link
                    className="menu-item"
                    href={m.href}
                    onMouseEnter={() => uiSound('move')}
                    onFocus={() => uiSound('move')}
                    onClick={() => uiSound('confirm')}
                  >
                    <span className="name">{m.name}</span>
                    <span className="hint">{m.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section className="challenge parchment" aria-label="Play online">
            <h2>Challenge a friend</h2>
            <form onSubmit={onCreate} style={{ display: 'grid', gap: 6 }}>
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
                  {busy ? 'Opening…' : 'Create a room'}
                </button>
              </div>
            </form>
            <form className="row" onSubmit={onJoin}>
              <input
                className="field code"
                value={code}
                placeholder="Room code"
                aria-label="Room code"
                maxLength={6}
                onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
              />
              <button className="btn p2" type="submit">
                Join
              </button>
            </form>
            {error && (
              <p className="title-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
      <p className="title-foot">
        Free, no install, rollback netcode. Heroes drawn by{' '}
        <a href="https://elie-automata.itch.io/" target="_blank" rel="noreferrer">
          elie automata
        </a>
        .
      </p>
    </main>
  );
}

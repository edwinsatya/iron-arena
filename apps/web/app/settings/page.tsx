'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cleanName, loadSettings, saveSettings, type Settings } from '../../src/ui/settings';

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => setS(loadSettings()), []);
  if (!s) return <main className="screen" />;
  const update = (patch: Partial<Settings>) => setS(saveSettings(patch));
  return (
    <main className="screen">
      <div className="screen-head">
        <h1 className="screen-title display">Settings</h1>
        <Link className="back" href="/">
          Back
        </Link>
      </div>
      <div className="prose" style={{ display: 'grid', gap: 22 }}>
        <label>
          <span className="home-label">Fighter name</span>
          <input className="field" maxLength={16} value={s.name} onChange={(e) => update({ name: cleanName(e.target.value) })} />
        </label>
        <div>
          <span className="home-label">Graphics quality</span>
          <div className="toggle-row">
            {(['low', 'medium', 'high'] as const).map((q) => (
              <button key={q} className="chip-btn" aria-pressed={s.quality === q} onClick={() => update({ quality: q })}>
                {q[0]!.toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="home-label">Volume {Math.round(s.volume * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => update({ volume: Number(e.target.value) })} style={{ width: '100%' }} />
        </label>
        <div className="toggle-row">
          <button className="chip-btn" aria-pressed={s.announcer} onClick={() => update({ announcer: !s.announcer })}>
            Announcer voice
          </button>
          <button className="chip-btn" aria-pressed={s.alwaysLeft} onClick={() => update({ alwaysLeft: !s.alwaysLeft })}>
            Always on the left (online)
          </button>
        </div>
        <div>
          <span className="home-label">Input delay (online)</span>
          <div className="toggle-row">
            {[0, 1, 2, 3, 4].map((d) => (
              <button key={d} className="chip-btn" aria-pressed={s.inputDelay === d} onClick={() => update({ inputDelay: d })}>
                {d === 0 ? 'Automatic' : `${d} frame${d > 1 ? 's' : ''}`}
              </button>
            ))}
          </div>
          <p className="muted">Automatic picks a delay from your ping. The room host&apos;s setting is used for both players.</p>
        </div>
      </div>
    </main>
  );
}

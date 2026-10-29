'use client';

import { useEffect, useState } from 'react';
import { cleanName, loadSettings, saveSettings, type Settings } from '../../src/ui/settings';
import { Topbar } from '../../src/ui/Topbar';

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => setS(loadSettings()), []);
  const update = (patch: Partial<Settings>) => setS(saveSettings(patch));
  return (
    <main className="screen">
      <Topbar title="Settings" small="Saved in this browser" />
      {s && (
        <div className="settings panel">
          <label>
            <span className="label">Fighter name</span>
            <input
              className="field"
              maxLength={16}
              value={s.name}
              onChange={(e) => update({ name: cleanName(e.target.value) })}
            />
          </label>
          <div className="group">
            <span className="label">Graphics quality</span>
            <div className="chips">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  className="chip"
                  aria-pressed={s.quality === q}
                  onClick={() => update({ quality: q })}
                >
                  {q[0]!.toUpperCase() + q.slice(1)}
                </button>
              ))}
            </div>
            <p className="help">Low turns off shadows and anti-aliasing for older laptops.</p>
          </div>
          <label>
            <span className="label">Volume {Math.round(s.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
            />
          </label>
          <div className="group">
            <span className="label">Voices and view</span>
            <div className="chips">
              <button
                className="chip"
                aria-pressed={s.announcer}
                onClick={() => update({ announcer: !s.announcer })}
              >
                Announcer
              </button>
              <button
                className="chip"
                aria-pressed={s.alwaysLeft}
                onClick={() => update({ alwaysLeft: !s.alwaysLeft })}
              >
                See the arena from my side (online)
              </button>
            </div>
          </div>
          <div className="group">
            <span className="label">Input delay (online)</span>
            <div className="chips">
              {[0, 1, 2, 3, 4].map((d) => (
                <button
                  key={d}
                  className="chip"
                  aria-pressed={s.inputDelay === d}
                  onClick={() => update({ inputDelay: d })}
                >
                  {d === 0 ? 'Automatic' : `${d} frame${d > 1 ? 's' : ''}`}
                </button>
              ))}
            </div>
            <p className="help">
              Automatic picks a delay from your ping. The room host&apos;s setting is used for both players.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

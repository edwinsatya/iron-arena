'use client';

import { createInitialState, FS, ROSTER } from '@neonfist/sim';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildArena } from '../../../src/game/render/arena';
import { LOOKS } from '../../../src/game/render/looks';
import { Mannequin } from '../../../src/game/render/mannequin';
import { poseFor } from '../../../src/game/render/poses';
import { loadVrm, VrmFighter } from '../../../src/game/render/vrm-fighter';

/** Pose check: the mannequin and the VRM model side by side, frozen on any move frame. */
export default function Poses() {
  const host = useRef<HTMLDivElement>(null);
  const [move, setMove] = useState('kaito_1');
  const [frame, setFrame] = useState(10);
  const api = useRef<{ set: (id: string, fr: number) => void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const dispose = buildArena(scene);
    const cam = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.1, 200);
    cam.position.set(0.9, 1.35, 4.6);
    cam.lookAt(0.9, 0.95, 0);
    const man = new Mannequin(LOOKS.kaito!, '#ff2e88');
    scene.add(man.root);
    let vrmView: VrmFighter | null = null;
    const s = createInitialState({ seed: 1, fighters: ['kaito', 'magnus'], roundsToWin: 2, roundFrames: 3600, viewMirrored: [false, false] });
    const draw = () => {
      const pose = poseFor({ state: s, index: 0 });
      man.update(-300, 0, 0, 0, 1024, pose);
      vrmView?.update(1800, 0, 0, 0, 1024, pose, 1 / 60);
      renderer.render(scene, cam);
    };
    api.current = {
      set: (id, fr) => {
        const f = s.fighters[0];
        const ch = ROSTER[f.char]!;
        const i = ch.moves.findIndex((m) => m.id === id);
        f.state = FS.ATTACK;
        f.moveId = i;
        f.moveFrame = fr;
        for (let k = 0; k < 20; k++) draw();
      },
    };
    void loadVrm('/models/stand-in-a.vrm').then((vrm) => {
      vrmView = new VrmFighter(vrm, '#2ee6ff', 1.62);
      (window as unknown as { __vrm: unknown }).__vrm = vrm;
      scene.add(vrmView.root);
      api.current?.set(move, frame);
      (window as unknown as { __posesReady: boolean }).__posesReady = true;
    });
    return () => {
      renderer.dispose();
      dispose();
      el.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => api.current?.set(move, frame), [move, frame]);

  const moves = ROSTER.find((c) => c.id === 'kaito')!.moves;
  return (
    <main style={{ height: '100svh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <div style={{ padding: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
        <select id="move" value={move} onChange={(e) => setMove(e.target.value)}>
          {moves.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} {m.name}
            </option>
          ))}
        </select>
        <input id="frame" type="range" min={1} max={60} value={frame} onChange={(e) => setFrame(Number(e.target.value))} />
        frame {frame}
      </div>
      <div ref={host} style={{ minHeight: 0 }} />
    </main>
  );
}

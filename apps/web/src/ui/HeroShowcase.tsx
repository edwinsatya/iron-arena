'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { makeModel, renderDisabled, type Posable } from '../game/render/portraits';
import { lookFor } from '../game/render/looks';
import { stancePose, withPose } from '../game/render/poses';

/**
 * A live 3D hero on the select screen: idle stance with breathing and a slow turn, lit in the
 * hero's colour. One small WebGL canvas per side.
 */
export function HeroShowcase({ heroId, side, alt = false }: { heroId: string; side: 0 | 1; alt?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    rim: THREE.DirectionalLight;
    model: Posable | null;
    want: string;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || renderDisabled) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff3e6', '#2b2140', 1.5));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(side === 0 ? 2 : -2, 3, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#ffffff', 3);
    rim.position.set(side === 0 ? -3 : 3, 2, -2.5);
    scene.add(rim);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 48),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 40);
    camera.position.set(0, 1.05, 5.0);
    camera.lookAt(0, 0.92, 0);
    stateRef.current = { renderer, scene, camera, rim, model: null, want: '' };

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w / h < 0.75 ? 5.6 : 5.0;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    let last = performance.now();
    let t = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const st = stateRef.current;
      if (st?.model) {
        const base = stancePose(st.want, 'idle');
        const pose = withPose(base, {
          lean: base.lean + Math.sin(t * 2) * 0.03,
          head: -Math.sin(t * 2) * 0.03,
        });
        const turn = (side === 0 ? 0.55 : -0.55) + Math.sin(t * 0.6) * 0.12;
        st.model.update(
          0,
          0,
          0,
          Math.round(Math.sin(turn) * 1024),
          Math.round(Math.cos(turn) * 1024),
          pose,
          dt,
        );
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stateRef.current?.model?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stateRef.current = null;
    };
  }, [side]);

  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    st.want = heroId;
    st.rim.color.set(lookFor(heroId, alt).color);
    let live = true;
    void makeModel(heroId, alt).then((m) => {
      const cur = stateRef.current;
      if (!live || !cur || cur.want !== heroId) {
        m.dispose();
        return;
      }
      if (cur.model) {
        cur.scene.remove(cur.model.root);
        cur.model.dispose();
      }
      cur.model = m;
      cur.scene.add(m.root);
    });
    return () => {
      live = false;
    };
  }, [heroId, alt]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />;
}

import * as THREE from 'three';
import { EV, EVENT_WINDOW, type GameState, type SimEvent } from '@neonfist/sim';

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  age: number;
  life: number;
  ring?: THREE.Mesh;
}

const COLORS: Record<number, string> = {
  [EV.HIT]: '#ffd9a0',
  [EV.COUNTER]: '#ff3355',
  [EV.BLOCK]: '#6ff1ff',
  [EV.ARMOR]: '#ffb43a',
  [EV.THROW]: '#ffe2f0',
  [EV.THROW_BREAK]: '#f2eeff',
  [EV.LAND]: '#9c95c9',
  [EV.KO]: '#ffffff',
};

export interface EffectCallbacks {
  /** Rollback-safe: called once per real event (PLAN §5.6). */
  onEvent?: (e: SimEvent) => void;
  /** The event turned out never to have happened (a rollback undid it). */
  onCancel?: (e: SimEvent) => void;
}

/**
 * Hit sparks, shockwave rings and screen shake. Effects are driven by GameState.recentEvents
 * and diffed against what has been shown, so a rollback never doubles or ghosts an effect.
 */
export class Effects {
  private bursts: Burst[] = [];
  private shown = new Map<string, { frame: number; burst: Burst | null; event: SimEvent }>();
  private geo = new THREE.BufferGeometry();
  private ringGeo = new THREE.RingGeometry(0.05, 0.11, 32);
  shake = 0;

  constructor(
    private scene: THREE.Scene,
    private cb: EffectCallbacks = {},
  ) {}

  sync(state: GameState): void {
    const live = new Set<string>();
    for (const e of state.recentEvents) {
      const key = `${e.frame}:${e.fighter}:${e.type}`;
      live.add(key);
      if (this.shown.has(key)) continue;
      const burst = this.spawn(e);
      this.shown.set(key, { frame: e.frame, burst, event: e });
      this.cb.onEvent?.(e);
    }
    for (const [key, s] of this.shown) {
      const inWindow = s.frame > state.frame - EVENT_WINDOW;
      if (inWindow && !live.has(key)) {
        // Rolled back: it never happened.
        if (s.burst) s.burst.age = s.burst.life;
        this.cb.onCancel?.(s.event);
        this.shown.delete(key);
      } else if (!inWindow && state.frame - s.frame > 120) {
        this.shown.delete(key);
      }
    }
  }

  private spawn(e: SimEvent): Burst | null {
    if (e.type === EV.SWING || e.type === EV.STEP || e.type === EV.JUMP) return null;
    const big = e.type === EV.COUNTER || e.type === EV.KO || e.type === EV.THROW || e.value >= 18;
    const n = e.type === EV.LAND ? 14 : big ? 46 : e.type === EV.BLOCK ? 22 : 30;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = e.x / 1000;
      pos[i * 3 + 1] = e.y / 1000;
      pos[i * 3 + 2] = e.z / 1000;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.3) * Math.PI;
      const sp = (e.type === EV.LAND ? 1.2 : big ? 5.5 : 3.6) * (0.4 + Math.random());
      vel[i * 3] = Math.cos(a) * Math.cos(b) * sp;
      vel[i * 3 + 1] = Math.sin(b) * sp * (e.type === EV.LAND ? 0.4 : 1);
      vel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = COLORS[e.type] ?? '#ffffff';
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color,
        size: big ? 0.09 : 0.065,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(points);
    let ring: THREE.Mesh | undefined;
    if (e.type !== EV.LAND) {
      ring = new THREE.Mesh(
        this.ringGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      ring.position.set(e.x / 1000, e.y / 1000, e.z / 1000);
      this.scene.add(ring);
    }
    if (e.type === EV.HIT || e.type === EV.COUNTER || e.type === EV.THROW || e.type === EV.KO) {
      this.shake = Math.max(this.shake, big ? 0.12 : 0.05 + e.value / 400);
    } else if (e.type === EV.BLOCK) {
      this.shake = Math.max(this.shake, 0.025);
    }
    const burst = { points, velocities: vel, age: 0, life: big ? 0.45 : 0.3, ring };
    this.bursts.push(burst);
    return burst;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.shake *= Math.pow(0.0015, dt);
    if (this.shake < 0.002) this.shake = 0;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.age += dt;
      const k = b.age / b.life;
      if (k >= 1) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        if (b.ring) {
          this.scene.remove(b.ring);
          (b.ring.material as THREE.Material).dispose();
        }
        this.bursts.splice(i, 1);
        continue;
      }
      const pos = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j < pos.count; j++) {
        b.velocities[j * 3 + 1]! -= 9 * dt;
        pos.setXYZ(
          j,
          pos.getX(j) + b.velocities[j * 3]! * dt,
          pos.getY(j) + b.velocities[j * 3 + 1]! * dt,
          pos.getZ(j) + b.velocities[j * 3 + 2]! * dt,
        );
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = 1 - k * k;
      if (b.ring) {
        b.ring.scale.setScalar(1 + k * 9);
        b.ring.quaternion.copy(camera.quaternion);
        (b.ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      }
    }
  }

  dispose(): void {
    for (const b of this.bursts) {
      this.scene.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
      if (b.ring) {
        this.scene.remove(b.ring);
        (b.ring.material as THREE.Material).dispose();
      }
    }
    this.bursts = [];
    this.geo.dispose();
    this.ringGeo.dispose();
  }
}

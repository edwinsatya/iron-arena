import * as THREE from 'three';
import {
  actionOf,
  areaSpec,
  EV,
  EVENT_WINDOW,
  FS,
  projectileSpec,
  ROSTER,
  type GameState,
  type SimEvent,
} from '@neonfist/sim';
import { LOOKS } from './looks';
import { impactFrame } from './poses';

export interface EffectCallbacks {
  /** Rollback-safe: called once per real event (PLAN §5.6). */
  onEvent?: (e: SimEvent) => void;
  /** The event turned out never to have happened (a rollback undid it). */
  onCancel?: (e: SimEvent) => void;
}

interface OneShot {
  obj: THREE.Object3D;
  age: number;
  life: number;
  tick: (o: THREE.Object3D, t: number, dt: number) => void;
}

/** Anything that can show where a hero's weapon is (for trails). */
export interface TrailSource {
  trailPoints(out: { base: THREE.Vector3; tip: THREE.Vector3 }[]): number;
}

const TRAIL_N = 9;

class Trail {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(TRAIL_N * 2 * 3);
  private col = new Float32Array(TRAIL_N * 2 * 4);
  private hist: { b: THREE.Vector3; t: THREE.Vector3 }[] = [];
  private geo = new THREE.BufferGeometry();
  private strength = 0;
  constructor(
    private color: THREE.Color,
    mat: THREE.Material,
  ) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }
  push(base: THREE.Vector3, tip: THREE.Vector3, active: boolean, dt: number) {
    if (active && this.strength === 0) this.hist.length = 0; // start a fresh arc
    this.strength = active ? Math.min(1, this.strength + dt * 20) : Math.max(0, this.strength - dt * 8);
    this.hist.unshift({ b: base.clone(), t: tip.clone() });
    if (this.hist.length > TRAIL_N) this.hist.length = TRAIL_N;
    for (let i = 0; i < TRAIL_N; i++) {
      const h = this.hist[Math.min(i, this.hist.length - 1)]!;
      this.pos.set([h.b.x, h.b.y, h.b.z], i * 6);
      this.pos.set([h.t.x, h.t.y, h.t.z], i * 6 + 3);
      const a = this.strength * (1 - i / TRAIL_N) ** 1.6;
      this.col.set([this.color.r, this.color.g, this.color.b, 0], i * 8);
      this.col.set(
        [0.6 + this.color.r * 0.4, 0.6 + this.color.g * 0.4, 0.6 + this.color.b * 0.4, a * 0.75],
        i * 8 + 4,
      );
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
    this.mesh.visible = this.strength > 0.01;
  }
  dispose() {
    this.geo.dispose();
  }
}

/** Damage numbers and callouts drawn as camera-facing sprites. */
function textSprite(text: string, color: string, size: number, stroke = '#120f1c'): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `${size}px "Dela Gothic One", "Arial Black", sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width + size * 0.6);
  c.width = w;
  c.height = Math.ceil(size * 1.5);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.22;
  g.strokeStyle = stroke;
  g.strokeText(text, w / 2, c.height / 2);
  g.fillStyle = color;
  g.fillText(text, w / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  const h = size / 220;
  s.scale.set((h * c.width) / c.height, h, 1);
  s.renderOrder = 1000;
  return s;
}

const disposeSprite = (o: THREE.Object3D) => {
  const s = o as THREE.Sprite;
  s.material.map?.dispose();
  s.material.dispose();
};

/**
 * Everything flashy: sparks, damage numbers, weapon trails, projectiles, skill areas, auras.
 * One-shot effects come from GameState.recentEvents and are diffed against what has been shown,
 * so a rollback never doubles or ghosts an effect. Persistent visuals (projectiles, areas) are
 * redrawn from the state every frame.
 */
export class Effects {
  private oneShots: OneShot[] = [];
  private shown = new Map<string, { frame: number; event: SimEvent; objs: OneShot[] }>();
  private projPools = new Map<string, THREE.Object3D[]>();
  private projUsed = new Map<string, number>();
  private areaPool: THREE.Group[] = [];
  private areaUsed = 0;
  private trails: Trail[] = [];
  private stars: THREE.Group[] = [];
  private disposables: { dispose(): void }[] = [];
  private geo: Record<string, THREE.BufferGeometry> = {};
  private mats = new Map<string, THREE.Material>();
  private trailMat: THREE.MeshBasicMaterial;
  shake = 0;
  /** White screen flash strength (0–1), read by the renderer's overlay. */
  flash = 0;
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    private cb: EffectCallbacks = {},
  ) {
    const keep = <T extends { dispose(): void }>(x: T) => (this.disposables.push(x), x);
    this.geo = {
      sphere: keep(new THREE.SphereGeometry(1, 16, 12)),
      ring: keep(new THREE.RingGeometry(0.9, 1, 64)),
      disc: keep(new THREE.CircleGeometry(1, 64)),
      bullet: keep(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6).rotateX(Math.PI / 2)),
      cone: keep(new THREE.ConeGeometry(0.18, 1, 6)),
      lance: keep(new THREE.ConeGeometry(0.28, 2.4, 10).rotateX(Math.PI / 2)),
      shard: keep(new THREE.OctahedronGeometry(0.16)),
      mine: keep(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 16)),
      star: keep(new THREE.OctahedronGeometry(0.07)),
      bolt: keep(new THREE.BufferGeometry()),
      box: keep(new THREE.BoxGeometry(1, 1, 1)),
    };
    this.trailMat = keep(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
  }

  private mat(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.mats.get(key);
    if (!m) {
      m = make();
      this.mats.set(key, m);
    }
    return m;
  }

  private glow(color: string, opacity = 1): THREE.MeshBasicMaterial {
    return this.mat(`glow:${color}:${opacity}`, () => {
      return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
    }) as THREE.MeshBasicMaterial;
  }

  /* ------------------------------------------------------------- events */

  sync(state: GameState): void {
    const live = new Set<string>();
    for (const e of state.recentEvents) {
      const key = `${e.frame}:${e.fighter}:${e.type}:${e.value}`;
      live.add(key);
      if (this.shown.has(key)) continue;
      const before = this.oneShots.length;
      this.spawn(e, state);
      this.shown.set(key, { frame: e.frame, event: e, objs: this.oneShots.slice(before) });
      this.cb.onEvent?.(e);
    }
    for (const [key, s] of this.shown) {
      const inWindow = s.frame > state.frame - EVENT_WINDOW;
      if (inWindow && !live.has(key)) {
        for (const o of s.objs) o.age = o.life; // rolled back: it never happened
        this.cb.onCancel?.(s.event);
        this.shown.delete(key);
      } else if (!inWindow && state.frame - s.frame > 120) {
        this.shown.delete(key);
      }
    }
  }

  private colorOf(state: GameState, fighter: number): string {
    const f = state.fighters[fighter];
    return f ? (LOOKS[ROSTER[f.char]!.id]?.color ?? '#ffffff') : '#ffffff';
  }

  private spawn(e: SimEvent, state: GameState): void {
    const p = new THREE.Vector3(e.x / 1000, e.y / 1000, e.z / 1000);
    const atkColor = this.colorOf(state, 1 - e.fighter);
    switch (e.type) {
      case EV.HIT: {
        const big = e.value >= 60;
        this.sparks(p, big ? 46 : 26, atkColor, big ? 7 : 5, 0.35);
        this.sparks(p, 10, '#ffffff', 4, 0.2);
        this.ringPop(p, atkColor, big ? 1.6 : 0.9, 0.22, true);
        this.popup(p, String(e.value), big ? '#ffd23f' : '#ffffff', big ? 92 : 70);
        this.shake = Math.max(this.shake, big ? 0.16 : 0.06);
        if (big) this.flash = Math.max(this.flash, 0.18);
        break;
      }
      case EV.BLOCK:
        this.sparks(p, 16, '#9fe8ff', 3.5, 0.25);
        this.ringPop(p, '#9fe8ff', 0.7, 0.18, true);
        if (e.value > 0) this.popup(p, String(e.value), '#9fb6d8', 54);
        break;
      case EV.GUARD_BREAK:
        this.sparks(p, 40, '#ffb43a', 7, 0.4);
        this.ringPop(p, '#ffb43a', 1.8, 0.3, true);
        this.popup(p.clone().add(new THREE.Vector3(0, 0.5, 0)), 'GUARD BREAK', '#ffb43a', 64);
        this.shake = Math.max(this.shake, 0.14);
        break;
      case EV.ARMOR:
        this.sparks(p, 14, '#ffd27a', 3, 0.25);
        this.popup(p, 'ARMOR', '#ffd27a', 48);
        break;
      case EV.COUNTER:
        this.ringPop(p, '#ffffff', 2.2, 0.3, true);
        this.popup(p.clone().add(new THREE.Vector3(0, 0.4, 0)), 'COUNTER!', '#ff4b6e', 80);
        this.flash = Math.max(this.flash, 0.35);
        break;
      case EV.FIRE:
        this.sparks(p, 6, this.colorOf(state, e.fighter), 2.5, 0.12);
        break;
      case EV.EXPLODE:
        this.sparks(p, 30, '#ffb066', 6, 0.4, -6);
        this.ringPop(p.setY(0.05), '#ffb066', 1.6, 0.35, false);
        this.shake = Math.max(this.shake, 0.12);
        break;
      case EV.TELEPORT: {
        const c = this.colorOf(state, e.fighter);
        this.pillar(p, c);
        break;
      }
      case EV.DASH:
      case EV.JUMP:
        this.dust(p, 10);
        break;
      case EV.LAND:
        this.dust(p, e.value < -60 ? 18 : 8);
        if (e.value < -100) this.shake = Math.max(this.shake, 0.08);
        break;
      case EV.SKILL:
        this.ringPop(p.setY(0.05), this.colorOf(state, e.fighter), 1.2, 0.3, false);
        break;
      case EV.ULT: {
        const c = this.colorOf(state, e.fighter);
        this.ringPop(p.setY(0.05), c, 4, 0.8, false);
        this.pillar(p, c, 3);
        this.flash = Math.max(this.flash, 0.5);
        break;
      }
      case EV.CHARGED:
        this.ringPop(p.setY(1), this.colorOf(state, e.fighter), 1.0, 0.25, true);
        break;
      case EV.KO:
        this.sparks(p, 70, '#ffffff', 9, 0.6);
        this.ringPop(p, '#ffffff', 3, 0.5, true);
        this.shake = Math.max(this.shake, 0.3);
        this.flash = Math.max(this.flash, 0.6);
        break;
      case EV.RING_OUT:
      case EV.FALL:
        this.shake = Math.max(this.shake, 0.1);
        break;
      case EV.GRAB:
        this.ringPop(p, '#ffd27a', 1.2, 0.25, true);
        break;
      case EV.DIZZY:
        this.popup(p.clone().add(new THREE.Vector3(0, 0.6, 0)), 'STUN', '#c9f0ff', 52);
        break;
    }
  }

  private sparks(at: THREE.Vector3, n: number, color: string, speed: number, life: number, gravity = -9) {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.35) * Math.PI;
      const v = speed * (0.4 + Math.random() * 0.8);
      vel.set([Math.cos(a) * Math.cos(b) * v, Math.sin(b) * v + 1.5, Math.sin(a) * Math.cos(b) * v], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color,
      size: 0.12,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(g, m);
    points.frustumCulled = false;
    this.scene.add(points);
    this.oneShots.push({
      obj: points,
      age: 0,
      life,
      tick: (o, t, dt) => {
        const attr = (o as THREE.Points).geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          vel[i + 1]! += gravity * dt;
          arr[i]! += vel[i]! * dt;
          arr[i + 1]! += vel[i + 1]! * dt;
          arr[i + 2]! += vel[i + 2]! * dt;
        }
        attr.needsUpdate = true;
        ((o as THREE.Points).material as THREE.PointsMaterial).opacity = 1 - t;
      },
    });
  }

  private dust(at: THREE.Vector3, n: number) {
    const p = at.clone().setY(0.05);
    this.sparks(p, n, '#d9cfc4', 1.8, 0.35, 1);
  }

  private ringPop(at: THREE.Vector3, color: string, size: number, life: number, facing: boolean) {
    const m = new THREE.Mesh(this.geo.ring!, this.glow(color).clone());
    m.position.copy(at);
    if (!facing) m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    this.oneShots.push({
      obj: m,
      age: 0,
      life,
      tick: (o, t) => {
        o.scale.setScalar(0.2 + t * size);
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - t;
        if (facing) o.userData.face = true;
      },
    });
  }

  private pillar(at: THREE.Vector3, color: string, scale = 1) {
    const m = new THREE.Mesh(this.geo.sphere!, this.glow(color).clone());
    m.position.set(at.x, 1, at.z);
    this.scene.add(m);
    this.oneShots.push({
      obj: m,
      age: 0,
      life: 0.25 * scale,
      tick: (o, t) => {
        o.scale.set(0.16 * scale * (1 - t), 1.3 * scale * (1 + t * 0.6), 0.16 * scale * (1 - t));
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
      },
    });
  }

  private popup(at: THREE.Vector3, text: string, color: string, size: number) {
    const s = textSprite(text, color, size);
    s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3, 0));
    this.scene.add(s);
    const y0 = s.position.y;
    const sc = s.scale.clone();
    this.oneShots.push({
      obj: s,
      age: 0,
      life: 0.8,
      tick: (o, t) => {
        o.position.y = y0 + t * 0.7;
        const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (t - 0.12) * 0.6);
        o.scale.set(sc.x * pop, sc.y * pop, 1);
        (o as THREE.Sprite).material.opacity = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      },
    });
  }

  /* ------------------------------------------------- persistent visuals */

  private poolGet(kind: string, make: () => THREE.Object3D): THREE.Object3D {
    let pool = this.projPools.get(kind);
    if (!pool) {
      pool = [];
      this.projPools.set(kind, pool);
    }
    const used = this.projUsed.get(kind) ?? 0;
    let o = pool[used];
    if (!o) {
      o = make();
      pool.push(o);
      this.scene.add(o);
    }
    this.projUsed.set(kind, used + 1);
    o.visible = true;
    return o;
  }

  /** Projectiles, areas, trails and status effects, straight from the state. */
  world(state: GameState, sources: (TrailSource | undefined)[]): void {
    for (const k of this.projUsed.keys()) this.projUsed.set(k, 0);
    const v = new THREE.Vector3();
    for (const p of state.projectiles) {
      const spec = projectileSpec(p.char, p.action, p.spec);
      const look = LOOKS[ROSTER[p.char]!.id]!;
      const pos = v.set(p.x / 1000, p.y / 1000, p.z / 1000);
      const dir = new THREE.Vector3(p.vx, p.vy, p.vz);
      switch (spec.kind) {
        case 'bullet':
        case 'slug': {
          const o = this.poolGet(`${spec.kind}:${look.color}`, () => {
            const g = new THREE.Group();
            const core = new THREE.Mesh(this.geo.bullet!, this.glow('#ffffff'));
            const halo = new THREE.Mesh(this.geo.bullet!, this.glow(look.color, 0.7));
            halo.scale.set(2.6, 2.6, 1.3);
            g.add(core, halo);
            if (spec.kind === 'slug') g.scale.set(2.2, 2.2, 2.4);
            return g;
          });
          o.position.copy(pos);
          if (dir.lengthSq() > 0) o.lookAt(pos.clone().add(dir));
          break;
        }
        case 'orb':
        case 'foxfire': {
          const color = spec.kind === 'foxfire' ? '#8fd8ff' : look.glow;
          const o = this.poolGet(`${spec.kind}:${color}`, () => {
            const g = new THREE.Group();
            g.add(new THREE.Mesh(this.geo.sphere!, this.glow('#ffffff')));
            const halo = new THREE.Mesh(
              this.geo.sphere!,
              this.glow(spec.kind === 'foxfire' ? '#3aa8ff' : look.color, 0.45),
            );
            halo.scale.setScalar(2.1);
            g.add(halo);
            return g;
          });
          const flick = spec.kind === 'foxfire' ? 1 + Math.sin(this.time * 30 + p.age) * 0.15 : 1;
          o.scale.setScalar((spec.r / 1000) * 0.45 * flick);
          o.position.copy(pos);
          break;
        }
        case 'lance': {
          const o = this.poolGet(`lance:${look.color}`, () => {
            const g = new THREE.Group();
            g.add(new THREE.Mesh(this.geo.lance!, this.glow('#ffffff')));
            const halo = new THREE.Mesh(this.geo.lance!, this.glow(look.color, 0.5));
            halo.scale.set(1.8, 1.8, 1.1);
            g.add(halo);
            return g;
          });
          o.position.copy(pos);
          if (dir.lengthSq() > 0) o.lookAt(pos.clone().add(dir));
          break;
        }
        case 'shard': {
          const o = this.poolGet(
            `shard:${look.color}`,
            () => new THREE.Mesh(this.geo.shard!, this.glow(look.glow)),
          );
          o.position.copy(pos);
          o.rotation.set(this.time * 20, this.time * 13, 0);
          break;
        }
        case 'mine':
        case 'grenade': {
          const o = this.poolGet(spec.kind, () => {
            const g = new THREE.Group();
            const body = new THREE.Mesh(
              spec.kind === 'mine' ? this.geo.mine! : this.geo.sphere!,
              this.mat('mineBody', () => new THREE.MeshToonMaterial({ color: '#2e2a3d' })),
            );
            if (spec.kind === 'grenade') body.scale.setScalar(0.13);
            const light = new THREE.Mesh(this.geo.sphere!, this.glow('#ff3d6e'));
            light.scale.setScalar(0.07);
            light.position.y = spec.kind === 'mine' ? 0.08 : 0.12;
            light.name = 'light';
            g.add(body, light);
            return g;
          });
          o.position.copy(pos);
          const armed = p.age >= (spec.armAfter ?? 0) && spec.armAfter !== 999;
          const blink =
            spec.kind === 'grenade'
              ? Math.sin(p.age * (0.3 + p.age / 60)) > 0
              : armed && Math.sin(p.age * 0.25) > 0;
          o.getObjectByName('light')!.visible = blink;
          break;
        }
        case 'wave':
          break;
      }
    }
    for (const [k, pool] of this.projPools) {
      const used = this.projUsed.get(k) ?? 0;
      for (let i = used; i < pool.length; i++) pool[i]!.visible = false;
    }

    // Areas
    this.areaUsed = 0;
    for (const a of state.areas) this.drawArea(state, a);
    for (let i = this.areaUsed; i < this.areaPool.length; i++) this.areaPool[i]!.visible = false;

    // Weapon trails
    const tmp: { base: THREE.Vector3; tip: THREE.Vector3 }[] = [];
    for (let i = 0; i < 2; i++) {
      const f = state.fighters[i]!;
      const look = LOOKS[ROSTER[f.char]!.id]!;
      if (!this.trails[i]) {
        this.trails[i] = new Trail(new THREE.Color(look.color), this.trailMat);
        this.scene.add(this.trails[i]!.mesh);
      }
      const src = sources[i];
      const n = src ? src.trailPoints(tmp) : 0;
      const a = actionOf(f);
      let active = false;
      if (f.state === FS.ACTION && a?.strikes?.length) {
        const imp = impactFrame(a);
        active = f.actionFrame >= imp.at - 4 && f.actionFrame <= imp.until + 3;
        if (
          a.strikes.some((st) => st.rehit && f.actionFrame >= st.frames[0] && f.actionFrame <= st.frames[1])
        )
          active = true;
      }
      if (n) this.trails[i]!.push(tmp[0]!.base, tmp[0]!.tip, active, 1 / 60);
      else this.trails[i]!.mesh.visible = false;

      // Dizzy stars
      if (!this.stars[i]) {
        const g = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const st = new THREE.Mesh(this.geo.star!, this.glow('#fff4a8'));
          st.position.set(Math.cos((k * Math.PI * 2) / 3) * 0.3, 0, Math.sin((k * Math.PI * 2) / 3) * 0.3);
          g.add(st);
        }
        this.stars[i] = g;
        this.scene.add(g);
      }
      const stars = this.stars[i]!;
      stars.visible = f.state === FS.DIZZY || f.state === FS.GUARD_BREAK;
      if (stars.visible) {
        stars.position.set(f.x / 1000, f.y / 1000 + 1.95, f.z / 1000);
        stars.rotation.y = this.time * 5;
      }
    }
  }

  private drawArea(state: GameState, a: GameState['areas'][number]) {
    const spec = areaSpec(a.char, a.action, a.spec);
    const look = LOOKS[ROSTER[a.char]!.id]!;
    let g = this.areaPool[this.areaUsed];
    if (!g) {
      g = new THREE.Group();
      const ring = new THREE.Mesh(this.geo.ring!, this.glow('#ffffff').clone());
      ring.rotation.x = -Math.PI / 2;
      ring.name = 'ring';
      const fill = new THREE.Mesh(this.geo.disc!, this.glow('#ffffff', 0.25).clone());
      fill.rotation.x = -Math.PI / 2;
      fill.name = 'fill';
      const body = new THREE.Mesh(this.geo.sphere!, this.glow('#ffffff').clone());
      body.name = 'body';
      const cones = new THREE.Group();
      cones.name = 'cones';
      for (let k = 0; k < 14; k++) {
        const c = new THREE.Mesh(this.geo.cone!, this.glow('#bfefff', 0.85).clone());
        cones.add(c);
      }
      const bolt = new THREE.Mesh(this.geo.box!, this.glow('#fffbe0').clone());
      bolt.name = 'bolt';
      g.add(ring, fill, body, cones, bolt);
      this.areaPool.push(g);
      this.scene.add(g);
    }
    this.areaUsed++;
    g.visible = true;
    const r = spec.r / 1000;
    g.position.set(a.x / 1000, 0.03, a.z / 1000);
    const ring = g.getObjectByName('ring') as THREE.Mesh;
    const fill = g.getObjectByName('fill') as THREE.Mesh;
    const body = g.getObjectByName('body') as THREE.Mesh;
    const cones = g.getObjectByName('cones') as THREE.Group;
    const bolt = g.getObjectByName('bolt') as THREE.Mesh;
    const ringMat = ring.material as THREE.MeshBasicMaterial;
    const fillMat = fill.material as THREE.MeshBasicMaterial;
    const bodyMat = body.material as THREE.MeshBasicMaterial;
    const telegraph = a.age < spec.delay;
    const k = telegraph ? a.age / Math.max(1, spec.delay) : (a.age - spec.delay) / Math.max(1, spec.active);
    const color =
      spec.kind === 'frost'
        ? '#9fe6ff'
        : spec.kind === 'moon'
          ? '#fff1c4'
          : spec.kind === 'quake'
            ? '#ffb066'
            : look.color;
    ringMat.color.set(color);
    fillMat.color.set(color);
    bodyMat.color.set(spec.kind === 'moon' ? '#fff6dc' : color);
    ring.visible = true;
    fill.visible = true;
    body.visible = false;
    cones.visible = false;
    bolt.visible = false;
    ring.scale.setScalar(r);
    if (telegraph) {
      // Warning circle that fills up
      ringMat.opacity = 0.6 + Math.sin(this.time * 20) * 0.25;
      fill.scale.setScalar(r * k);
      fillMat.opacity = 0.25;
      if (spec.kind === 'moon') {
        body.visible = true;
        const h = 28 * (1 - k * k);
        body.position.set(0, h + r * 0.55, 0);
        body.scale.setScalar(r * 0.6);
        bodyMat.opacity = 0.95;
      }
      return;
    }
    fill.scale.setScalar(r);
    fillMat.opacity = 0.4 * (1 - k);
    ringMat.opacity = 1 - k;
    switch (spec.kind) {
      case 'quake':
      case 'burst':
      case 'blast':
      case 'moon':
        ring.scale.setScalar(r * (0.4 + k * 0.8));
        body.visible = true;
        body.position.set(0, spec.kind === 'quake' ? 0 : r * 0.25, 0);
        body.scale.set(
          r * (0.4 + k * 0.7),
          r * (spec.kind === 'quake' ? 0.15 : 0.5 + k * 0.4),
          r * (0.4 + k * 0.7),
        );
        bodyMat.opacity = 0.75 * (1 - k);
        if (a.age === spec.delay)
          this.shake = Math.max(this.shake, spec.kind === 'moon' ? 0.45 : spec.kind === 'burst' ? 0.06 : 0.2);
        if (spec.kind === 'moon' && a.age === spec.delay) this.flash = Math.max(this.flash, 0.7);
        break;
      case 'frost':
        cones.visible = true;
        cones.children.forEach((c, i) => {
          const ang = (i / cones.children.length) * Math.PI * 2 + i;
          const d = r * (0.25 + ((i * 37) % 10) / 14);
          c.position.set(Math.cos(ang) * d, 0.3, Math.sin(ang) * d);
          const s = Math.min(1, k * 4) * (0.6 + ((i * 13) % 7) / 7);
          c.scale.set(s * 1.6, s * 2.2, s * 1.6);
          ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k * 0.6);
        });
        break;
      case 'barrage':
      case 'thunder':
      case 'storm': {
        bolt.visible = true;
        const jitter = spec.kind === 'barrage' ? r * 0.8 : 0.15;
        const t = this.time * 40;
        bolt.position.set(Math.sin(t * 1.7) * jitter, 8, Math.cos(t * 1.3) * jitter);
        bolt.scale.set(spec.kind === 'thunder' ? 0.35 : 0.06, 16, spec.kind === 'thunder' ? 0.35 : 0.06);
        (bolt.material as THREE.MeshBasicMaterial).opacity = spec.kind === 'thunder' ? 1 - k : 0.9;
        if (spec.kind === 'thunder' && a.age === spec.delay) {
          this.flash = Math.max(this.flash, 0.8);
          this.shake = Math.max(this.shake, 0.35);
        }
        if (spec.kind === 'barrage') this.shake = Math.max(this.shake, 0.03);
        break;
      }
    }
    void state;
  }

  /** Advance one-shots and particles. */
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    for (const o of this.oneShots) {
      o.age += dt;
      const t = Math.min(1, o.age / o.life);
      o.tick(o.obj, t, dt);
      if (o.obj.userData.face) o.obj.quaternion.copy(camera.quaternion);
    }
    // Remove finished
    const alive: OneShot[] = [];
    for (const o of this.oneShots) {
      if (o.age < o.life) {
        alive.push(o);
        continue;
      }
      this.scene.remove(o.obj);
      if ((o.obj as THREE.Sprite).isSprite) disposeSprite(o.obj);
      else if ((o.obj as THREE.Points).isPoints) {
        (o.obj as THREE.Points).geometry.dispose();
        ((o.obj as THREE.Points).material as THREE.Material).dispose();
      } else if ((o.obj as THREE.Mesh).isMesh) ((o.obj as THREE.Mesh).material as THREE.Material).dispose();
    }
    this.oneShots = alive;
    this.shake = Math.max(0, this.shake - dt * 0.9);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  dispose(): void {
    for (const o of this.oneShots) this.scene.remove(o.obj);
    for (const d of this.disposables) d.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.trails) t.dispose();
  }
}

import * as THREE from 'three';
import { END, PHASE, ROSTER, type GameState, type SimEvent } from '@neonfist/sim';
import { buildArena, PALETTE } from './arena';
import { HitboxOverlay } from './debug';
import { Effects } from './effects';
import { lookFor } from './looks';
import { Mannequin } from './mannequin';
import { loadVrm, VrmFighter } from './vrm-fighter';
import { poseFor } from './poses';

export type Quality = 'low' | 'medium' | 'high';

export interface RendererOptions {
  /** This viewer uses the "always on the left" view (the camera sits on the other side). */
  mirrored?: boolean;
  quality?: Quality;
  onEvent?: (e: SimEvent) => void;
  onCancel?: (e: SimEvent) => void;
  /** Slow orbit for menus (landing page hero). */
  showcase?: boolean;
  /** Load character models from /models/manifest.json (default true). */
  models?: boolean;
}

interface FighterView {
  readonly root: THREE.Object3D;
  update(x: number, y: number, z: number, dirX: number, dirZ: number, pose: ReturnType<typeof poseFor>, dt: number): void;
  dispose(): void;
}

type Manifest = Record<string, { file: string; height: number }>;
let manifestPromise: Promise<Manifest> | null = null;
function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch('/models/manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
    .catch(() => ({}));
  return manifestPromise;
}

/** Owns the three.js scene: arena, two fighters, camera, effects, debug overlay (PLAN §5.1). */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 300);
  private fighters: FighterView[] = [];
  private disposed = false;
  private chars: number[] = [-1, -1];
  private effects: Effects;
  private overlay = new HitboxOverlay();
  private disposeArena: () => void;
  private camPos = new THREE.Vector3(0, 1.5, 6);
  private camTarget = new THREE.Vector3(0, 1, 0);
  private resizeObs: ResizeObserver;
  private time = 0;
  showHitboxes = false;
  mirrored: boolean;

  constructor(
    private host: HTMLElement,
    private opts: RendererOptions = {},
  ) {
    const quality = opts.quality ?? 'medium';
    this.mirrored = !!opts.mirrored;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    host.appendChild(this.renderer.domElement);

    this.disposeArena = buildArena(this.scene);
    this.effects = new Effects(this.scene, { onEvent: opts.onEvent, onCancel: opts.onCancel });
    this.scene.add(this.overlay.group);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep both fighters in frame on narrow (portrait) screens
    this.camera.fov = w / h < 1.2 ? 55 : 38;
    this.camera.updateProjectionMatrix();
  }

  private ensureFighters(s: GameState) {
    for (let i = 0; i < 2; i++) {
      const c = s.fighters[i]!.char;
      if (this.chars[i] === c) continue;
      if (this.fighters[i]) {
        this.scene.remove(this.fighters[i]!.root);
        this.fighters[i]!.dispose();
      }
      const id = ROSTER[c]!.id;
      const same = i === 1 && s.fighters[0].char === c;
      const color = i === 0 ? PALETTE.p1 : PALETTE.p2;
      const look = lookFor(id, same);
      const m = new Mannequin(look, color);
      this.fighters[i] = m;
      this.chars[i] = c;
      this.scene.add(m.root);
      if (this.opts.models !== false) void this.upgrade(i, c, id, color, look.scale);
    }
  }

  /** Swap the mannequin for the character's anime model once it has loaded. */
  private async upgrade(i: number, char: number, id: string, color: string, scale: number) {
    try {
      const entry = (await loadManifest())[id];
      if (!entry) return;
      const vrm = await loadVrm(`/models/${entry.file}`);
      if (this.disposed || this.chars[i] !== char) return;
      const view = new VrmFighter(vrm, color, entry.height * scale);
      const old = this.fighters[i]!;
      this.scene.remove(old.root);
      old.dispose();
      this.fighters[i] = view;
      this.scene.add(view.root);
    } catch (err) {
      console.warn(`[render] keeping the mannequin for ${id}:`, err);
    }
  }

  /** Draw the newest state (rollbacks already applied). `dt` in ms of real time. */
  render(s: GameState, dtMs: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    this.time += dt;
    this.ensureFighters(s);
    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i]!;
      this.fighters[i]!.update(f.x, f.y, f.z, f.dirX, f.dirZ, poseFor({ state: s, index: i }), dt);
    }
    this.effects.sync(s);
    this.effects.update(dt, this.camera);
    this.overlay.group.visible = this.showHitboxes;
    if (this.showHitboxes) this.overlay.update(s);
    this.updateCamera(s, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Camera (PLAN §2.8): perpendicular to the line between the fighters, distance from their
   * separation, critically damped. Render-only — it never affects the simulation.
   */
  private updateCamera(s: GameState, dt: number) {
    const [a, b] = s.fighters;
    const left = s.p1OnLeft ? a : b;
    const right = s.p1OnLeft ? b : a;
    const mx = (a.x + b.x) / 2000;
    const mz = (a.z + b.z) / 2000;
    let dx = (right.x - left.x) / 1000;
    let dz = (right.z - left.z) / 1000;
    const sep = Math.hypot(dx, dz);
    if (sep < 0.01) {
      dx = 1;
      dz = 0;
    } else {
      dx /= sep;
      dz /= sep;
    }
    // Camera forward f = up × d → position = midpoint − f · distance
    let px = -dz;
    let pz = dx;
    if (this.mirrored) {
      px = -px;
      pz = -pz;
    }
    let dist = Math.min(6.5, Math.max(3.0, 2.2 + 0.55 * sep));
    let height = 1.45;
    let lookY = 1.0;
    let orbit = 0;

    if (this.opts.showcase) {
      orbit = Math.sin(this.time * 0.18) * 0.55;
      dist = 5.2;
      height = 1.25;
    } else if (s.phase === PHASE.INTRO) {
      const t = Math.min(1, s.phaseFrame / 110);
      const e = 1 - (1 - t) ** 3;
      orbit = (1 - e) * 1.1;
      dist += (1 - e) * 2.5;
      height += (1 - e) * 1.2;
    } else if (s.phase === PHASE.KO && s.endReason !== END.TIME) {
      const t = Math.min(1, s.phaseFrame / 70);
      dist -= 0.7 * Math.sin(t * Math.PI * 0.5);
      orbit = 0.35 * t;
      lookY = 0.8;
    } else if (s.phase === PHASE.MATCH_END || s.phase === PHASE.ROUND_END) {
      const w = s.phase === PHASE.MATCH_END ? s.matchWinner : s.endWinner;
      const winner = w >= 0 ? s.fighters[w]! : null;
      if (winner) {
        const t = Math.min(1, s.phaseFrame / 60);
        orbit = 0.5 * t;
        dist -= 0.8 * t;
        this.camTarget.lerp(new THREE.Vector3(winner.x / 1000, 1.1, winner.z / 1000), 0.04);
      }
    }
    if (orbit) {
      const c = Math.cos(orbit);
      const sn = Math.sin(orbit);
      const ox = px * c - pz * sn;
      const oz = px * sn + pz * c;
      px = ox;
      pz = oz;
    }
    // Showcase: shift the view so the fight sits right of the menu panel
    const side = this.opts.showcase ? -1.7 : 0;
    const want = new THREE.Vector3(mx + px * dist + dx * side, height, mz + pz * dist + dz * side);
    const k = 1 - Math.exp(-dt * (s.phase === PHASE.INTRO ? 10 : 6));
    this.camPos.lerp(want, k);
    if (!(s.phase === PHASE.MATCH_END || s.phase === PHASE.ROUND_END)) {
      this.camTarget.lerp(new THREE.Vector3(mx + dx * side, lookY, mz + dz * side), k);
    }
    this.camera.position.copy(this.camPos);
    if (this.effects.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.effects.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.effects.shake;
    }
    this.camera.lookAt(this.camTarget);
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObs.disconnect();
    this.effects.dispose();
    this.overlay.dispose();
    for (const f of this.fighters) f.dispose();
    this.disposeArena();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

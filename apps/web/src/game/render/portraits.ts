import * as THREE from 'three';
import { getCharacter } from '@neonfist/sim';
import { HeroModel, loadManifest, loadVrm } from './hero-model';
import { lookFor, WEAPON_OF } from './looks';
import { Mannequin } from './mannequin';
import { actionHitPose, stancePose, type Pose } from './poses';

/**
 * Hero portraits rendered from the 3D models at runtime (no painted art needed, all free):
 * head shots for the HUD, full-body for select screens, action shots for skill cards and the
 * ultimate cut-in. Results are cached as image URLs. Drop a PNG with the same name into
 * /public/portraits/ (and list it in manifest.json) to replace any of them with hand-made art.
 */

export type PortraitKind = 'face' | 'full' | 'cutin' | `skill:${string}`;

let renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

export interface Posable {
  root: THREE.Object3D;
  update(x: number, y: number, z: number, fx: number, fz: number, pose: Pose, dt: number): void;
  headWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

/** A posable hero (anime model, or the mannequin if the model can't load). */
export async function makeModel(heroId: string, alt = false): Promise<Posable> {
  const look = lookFor(heroId, alt);
  const weapon = WEAPON_OF[heroId] ?? 'none';
  try {
    const entry = (await loadManifest())[heroId];
    if (entry) {
      const vrm = await loadVrm(`/models/${entry.file}`);
      return new HeroModel(vrm, look, weapon, entry.height * look.scale);
    }
  } catch (err) {
    console.warn(`[portraits] ${heroId}: using the mannequin`, err);
  }
  return new Mannequin(look, weapon) as unknown as Posable;
}

let customList: Promise<string[]> | null = null;

/** Hand-made portraits listed in /portraits/manifest.json, e.g. ["kaito-face.png"]. */
async function custom(heroId: string, kind: PortraitKind): Promise<string | null> {
  customList ??= fetch('/portraits/manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
    .catch(() => []);
  const name = `${heroId}-${kind.replace(':', '-')}.png`;
  return (await customList).includes(name) ? `/portraits/${name}` : null;
}

function kindsFor(heroId: string): PortraitKind[] {
  const h = getCharacter(heroId);
  return [
    'face',
    'full',
    'cutin',
    ...[...h.skillIdx, h.ultIdx].map((i) => `skill:${h.actions[i]!.id}` as PortraitKind),
  ];
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 16));

/** Render every portrait of one hero with a single model load, yielding between renders. */
async function renderHero(heroId: string): Promise<Map<PortraitKind, string>> {
  const out = new Map<PortraitKind, string>();
  const kinds = kindsFor(heroId);
  for (const k of kinds) {
    const hand = await custom(heroId, k);
    if (hand) out.set(k, hand);
  }
  if (out.size === kinds.length) return out;
  const look = lookFor(heroId, false);
  const model = await makeModel(heroId);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff3e6', '#3a2d55', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(1.5, 3, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(look.color, 3.2);
  rim.position.set(-2.5, 2, -2.5);
  scene.add(rim);
  scene.add(model.root);
  const r = getRenderer();
  for (const kind of kinds) {
    if (out.has(kind)) continue;
    await nextFrame();
    let pose: Pose = stancePose(heroId, 'idle');
    if (kind === 'full') pose = stancePose(heroId, 'win');
    if (kind === 'cutin') pose = actionHitPose(heroId, getCharacter(heroId).ultimate);
    if (kind.startsWith('skill:')) pose = actionHitPose(heroId, kind.slice(6));
    for (let i = 0; i < 30; i++) model.update(0, 0, 0, 0, 1024, pose, 1 / 30); // settle hair springs
    model.root.updateMatrixWorld(true);
    const head = model.headWorld(new THREE.Vector3());
    const size = kind === 'cutin' ? [900, 450] : kind === 'full' ? [480, 720] : [320, 320];
    r.setSize(size[0]!, size[1]!, false);
    const cam = new THREE.PerspectiveCamera(kind === 'face' ? 24 : 30, size[0]! / size[1]!, 0.05, 50);
    if (kind === 'face') {
      cam.position.set(head.x + 0.35, head.y + 0.02, head.z + 1.15);
      cam.lookAt(head.x, head.y - 0.06, head.z);
    } else if (kind === 'full') {
      cam.position.set(0.9, 1.0, 4.4);
      cam.lookAt(0, 0.95, 0);
    } else if (kind === 'cutin') {
      cam.position.set(head.x + 1.3, head.y - 0.25, head.z + 1.7);
      cam.lookAt(head.x - 0.2, head.y - 0.35, head.z);
    } else {
      cam.position.set(head.x + 0.9, head.y - 0.2, head.z + 2.0);
      cam.lookAt(head.x, head.y - 0.45, head.z);
    }
    r.render(scene, cam);
    out.set(kind, r.domElement.toDataURL('image/png'));
  }
  model.dispose();
  return out;
}

const batches = new Map<string, Promise<Map<PortraitKind, string>>>();
const pending: {
  id: string;
  resolve: (m: Map<PortraitKind, string>) => void;
  reject: (e: unknown) => void;
}[] = [];
let working = false;
let focus: string[] | null = null;

/**
 * While a fight runs, only that fight's heroes are rendered; everyone else waits until the menus,
 * so the 60 Hz loop never stalls on a model load it doesn't need.
 */
export function setPortraitFocus(ids: string[] | null): void {
  focus = ids;
  void work();
}

async function work() {
  if (working) return;
  working = true;
  try {
    for (;;) {
      const i = pending.findIndex((p) => !focus || focus.includes(p.id));
      if (i < 0) break;
      const job = pending.splice(i, 1)[0]!;
      try {
        job.resolve(await renderHero(job.id));
      } catch (e) {
        job.reject(e);
      }
    }
  } finally {
    working = false;
  }
}

/** `?render=0` (automated tests without a GPU) turns every 3D extra off. */
export const renderDisabled =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('render') === '0';

let enabled = !renderDisabled;
/** Turn portrait rendering off (automated tests without a GPU). */
export function setPortraitsEnabled(on: boolean): void {
  enabled = on;
}

/** A portrait image URL (rendered once per page, then cached). */
export function portrait(heroId: string, kind: PortraitKind): Promise<string> {
  if (!enabled) return Promise.reject(new Error('portraits disabled'));
  let b = batches.get(heroId);
  if (!b) {
    // One hero at a time keeps the GPU and the main thread calm
    b = new Promise<Map<PortraitKind, string>>((resolve, reject) =>
      pending.push({ id: heroId, resolve, reject }),
    );
    batches.set(heroId, b);
    b.catch(() => batches.delete(heroId));
    void work();
  }
  return b.then((m) => {
    const url = m.get(kind);
    if (!url) throw new Error(`no portrait ${heroId}:${kind}`);
    return url;
  });
}

/** Resolves once every portrait of these heroes is ready (or failed). */
export function portraitsReady(heroIds: string[]): Promise<void> {
  if (!enabled) return Promise.resolve();
  return Promise.allSettled(heroIds.map((id) => portrait(id, 'face'))).then(() => undefined);
}

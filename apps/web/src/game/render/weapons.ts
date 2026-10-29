import * as THREE from 'three';

/**
 * Procedural weapons. Each is built in "grip space": the grip at the origin, the blade / barrel /
 * shaft along +Y. `tip` and `base` are the points weapon trails are drawn between.
 */
export interface WeaponPart {
  group: THREE.Group;
  /** Trail endpoints in grip space (null = no trail). */
  base: THREE.Vector3 | null;
  tip: THREE.Vector3 | null;
}

export interface WeaponSet {
  right: WeaponPart | null;
  left: WeaponPart | null;
  dispose(): void;
}

function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function buildWeapons(kind: string, color: string, glow: string): WeaponSet {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const grad = keep(toonGradient());
  const toon = (c: string, emissive = 0) => {
    const m = keep(new THREE.MeshToonMaterial({ color: c, gradientMap: grad }));
    if (emissive) {
      m.emissive = new THREE.Color(c);
      m.emissiveIntensity = emissive;
    }
    return m;
  };
  const glowMat = keep(new THREE.MeshBasicMaterial({ color: glow, toneMapped: false }));
  const outline = keep(new THREE.MeshBasicMaterial({ color: '#0b0a14', side: THREE.BackSide }));
  const box = (w: number, h: number, d: number, m: THREE.Material, y = 0, ol = true) => {
    const g = keep(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = y;
    mesh.castShadow = true;
    if (ol) {
      const hull = new THREE.Mesh(g, outline);
      hull.scale.set(1 + 0.012 / w, 1 + 0.012 / h, 1 + 0.012 / d);
      mesh.add(hull);
    }
    return mesh;
  };
  const cyl = (r: number, h: number, m: THREE.Material, y = 0) => {
    const g = keep(new THREE.CylinderGeometry(r, r, h, 10));
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = y;
    mesh.castShadow = true;
    return mesh;
  };

  let right: WeaponPart | null = null;
  let left: WeaponPart | null = null;

  if (kind === 'katana') {
    const g = new THREE.Group();
    g.add(cyl(0.017, 0.26, toon('#1d1a2a'), 0));
    const guard = cyl(0.045, 0.012, toon('#c9a24a'), 0.135);
    g.add(guard);
    g.add(box(0.03, 0.86, 0.008, toon('#e9edf7'), 0.57));
    g.add(box(0.006, 0.84, 0.01, glowMat, 0.57, false)); // glowing edge
    const tipGeo = keep(new THREE.ConeGeometry(0.016, 0.07, 4));
    const tip = new THREE.Mesh(tipGeo, toon('#e9edf7'));
    tip.position.y = 1.03;
    tip.scale.z = 0.3;
    g.add(tip);
    right = { group: g, base: new THREE.Vector3(0, 0.45, 0), tip: new THREE.Vector3(0, 1.05, 0) };
  } else if (kind === 'gauntlets') {
    const make = () => {
      const g = new THREE.Group();
      const fist = box(0.15, 0.13, 0.19, toon('#5b6278'), 0.02);
      g.add(fist);
      const plate = box(0.16, 0.05, 0.12, toon(color, 0.15), 0.08);
      g.add(plate);
      const knuckles = box(0.155, 0.04, 0.05, toon('#c9cbd6'), 0.03);
      knuckles.position.z = 0.09;
      g.add(knuckles);
      const cuff = cyl(0.07, 0.12, toon('#3a3f52'), -0.08);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(0, 0, -0.1);
      g.add(cuff);
      return g;
    };
    right = { group: make(), base: new THREE.Vector3(0, 0, 0), tip: new THREE.Vector3(0, 0, 0.12) };
    left = { group: make(), base: new THREE.Vector3(0, 0, 0), tip: new THREE.Vector3(0, 0, 0.12) };
  } else if (kind === 'pistols') {
    const make = () => {
      const g = new THREE.Group();
      g.add(box(0.035, 0.24, 0.05, toon('#26232f'), 0.1));
      const slide = box(0.04, 0.2, 0.03, toon(color, 0.2), 0.12);
      slide.position.z = 0.03;
      g.add(slide);
      const grip = box(0.032, 0.05, 0.11, toon('#3b3646'), -0.01);
      grip.position.z = -0.05;
      g.add(grip);
      const muzzle = cyl(0.012, 0.02, glowMat, 0.23);
      g.add(muzzle);
      return g;
    };
    right = { group: make(), base: null, tip: new THREE.Vector3(0, 0.24, 0) };
    left = { group: make(), base: null, tip: new THREE.Vector3(0, 0.24, 0) };
  } else if (kind === 'staff') {
    const g = new THREE.Group();
    g.add(cyl(0.02, 1.75, toon('#efe7d4'), 0.2));
    for (const y of [-0.5, 0.05, 0.75]) g.add(cyl(0.026, 0.05, toon('#c9a24a'), y));
    // Crescent moon head
    const moonGeo = keep(new THREE.TorusGeometry(0.13, 0.025, 8, 24, Math.PI * 1.35));
    const moon = new THREE.Mesh(moonGeo, toon('#fff4cf', 0.35));
    moon.position.y = 1.2;
    moon.rotation.z = -Math.PI * 0.18;
    g.add(moon);
    const orbGeo = keep(new THREE.SphereGeometry(0.06, 16, 12));
    const orb = new THREE.Mesh(orbGeo, glowMat);
    orb.position.y = 1.17;
    g.add(orb);
    right = { group: g, base: new THREE.Vector3(0, 0.9, 0), tip: new THREE.Vector3(0, 1.25, 0) };
  }

  return {
    right,
    left,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

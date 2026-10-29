import * as THREE from 'three';
import {
  actionOf,
  areaSpec,
  FS,
  hurtCylinder,
  localToWorld,
  projectileSpec,
  type GameState,
} from '@neonfist/sim';

/** F1 overlay: active hit spheres (red), projectiles (orange), areas and hurt cylinders (cyan), from sim data. */
export class HitboxOverlay {
  readonly group = new THREE.Group();
  private sphereGeo = new THREE.SphereGeometry(1, 16, 10);
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  private hitMat = new THREE.MeshBasicMaterial({
    color: '#ff3355',
    wireframe: true,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  private projMat = new THREE.MeshBasicMaterial({
    color: '#ffa033',
    wireframe: true,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  private hurtMat = new THREE.MeshBasicMaterial({
    color: '#2ee6ff',
    wireframe: true,
    transparent: true,
    opacity: 0.35,
    depthTest: false,
  });
  private pool: THREE.Mesh[] = [];

  constructor() {
    this.group.renderOrder = 999;
  }

  private mesh(i: number, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    let m = this.pool[i];
    if (!m) {
      m = new THREE.Mesh(geo, mat);
      m.renderOrder = 999;
      this.pool.push(m);
      this.group.add(m);
    }
    m.geometry = geo;
    m.material = mat;
    m.visible = true;
    return m;
  }

  update(s: GameState): void {
    let i = 0;
    for (const f of s.fighters) {
      const c = hurtCylinder(f);
      const h = (c.y1 - c.y0) / 1000;
      const m = this.mesh(i++, this.cylGeo, this.hurtMat);
      m.scale.set(c.r / 1000, h, c.r / 1000);
      m.position.set(f.x / 1000, c.y0 / 1000 + h / 2, f.z / 1000);
      const a = actionOf(f);
      if (f.state === FS.ACTION && a?.strikes) {
        for (const st of a.strikes) {
          if (f.actionFrame < st.frames[0] || f.actionFrame > st.frames[1] || st.release) continue;
          const p = localToWorld(f, st.at[0], st.at[1], st.at[2]);
          const sm = this.mesh(i++, this.sphereGeo, this.hitMat);
          sm.scale.setScalar(st.r / 1000);
          sm.position.set(p.x / 1000, p.y / 1000, p.z / 1000);
        }
      }
    }
    for (const p of s.projectiles) {
      const spec = projectileSpec(p.char, p.action, p.spec);
      const m = this.mesh(i++, this.sphereGeo, this.projMat);
      m.scale.setScalar(spec.r / 1000);
      m.position.set(p.x / 1000, p.y / 1000, p.z / 1000);
    }
    for (const a of s.areas) {
      const spec = areaSpec(a.char, a.action, a.spec);
      const active = a.age >= spec.delay;
      const m = this.mesh(i++, this.cylGeo, active ? this.hitMat : this.projMat);
      m.scale.set(spec.r / 1000, 0.3, spec.r / 1000);
      m.position.set(a.x / 1000, 0.15, a.z / 1000);
    }
    for (; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  dispose(): void {
    this.sphereGeo.dispose();
    this.cylGeo.dispose();
    this.hitMat.dispose();
    this.projMat.dispose();
    this.hurtMat.dispose();
  }
}

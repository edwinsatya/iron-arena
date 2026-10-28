import * as THREE from 'three';
import { FS, hurtCylinders, localToWorld, moveOf, type GameState } from '@neonfist/sim';

/** F1 overlay: active hitboxes (red spheres) and hurt cylinders (cyan), straight from sim data. */
export class HitboxOverlay {
  readonly group = new THREE.Group();
  private sphereGeo = new THREE.SphereGeometry(1, 16, 10);
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  private hitMat = new THREE.MeshBasicMaterial({ color: '#ff3355', wireframe: true, transparent: true, opacity: 0.9, depthTest: false });
  private hurtMat = new THREE.MeshBasicMaterial({ color: '#2ee6ff', wireframe: true, transparent: true, opacity: 0.35, depthTest: false });
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
      for (const c of hurtCylinders(f)) {
        const m = this.mesh(i++, this.cylGeo, this.hurtMat);
        const h = (c.y1 - c.y0) / 1000;
        m.scale.set(c.r / 1000, h, c.r / 1000);
        m.position.set(f.x / 1000, (f.y + c.y0) / 1000 + h / 2, f.z / 1000);
      }
      const mv = moveOf(f);
      if (f.state === FS.ATTACK && mv) {
        for (const hb of mv.hitboxes) {
          if (f.moveFrame < hb.frames[0] || f.moveFrame > hb.frames[1]) continue;
          const p = localToWorld(f, hb.at[0], hb.at[1], hb.at[2]);
          const m = this.mesh(i++, this.sphereGeo, this.hitMat);
          m.scale.setScalar(hb.r / 1000);
          m.position.set(p.x / 1000, p.y / 1000, p.z / 1000);
        }
      }
    }
    for (; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  dispose(): void {
    this.sphereGeo.dispose();
    this.cylGeo.dispose();
    this.hitMat.dispose();
    this.hurtMat.dispose();
  }
}

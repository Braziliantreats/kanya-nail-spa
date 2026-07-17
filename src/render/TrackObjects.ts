/**
 * TrackObjects.ts — obstacle visuals + instanced crystal field (spec §6, §7, §9).
 *
 * Telegraphing (spec §6/§16): every archetype has a DISTINCT SILHOUETTE and a
 * glowing chevron/cross ICON, so obstacle class is never signaled by color
 * alone. Signal colors by required action:
 *   slide → amber ∨   jump → cyan ∧   lane-change → magenta ✕
 *
 * COMPLIANCE: all props are brand-neutral urban/abstract shapes — no plant
 * forms, no consumption references, nothing kid-styled.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Config } from '../core/Config';
import type { ObstacleType } from '../data/patterns';
import type { ToonMaterialFactory } from './ToonMaterialFactory';

export const SIGNAL_COLORS = {
  slide: 0xffd166, // amber
  jump: 0x29e6ff, // cyan
  lane: 0xff3f5c, // magenta-red
};

const BODY_DARK = 0x3a2f63;
const BODY_DARKER = 0x2b2350;

export class TrackObjectFactory {
  private geoCache = new Map<string, THREE.BufferGeometry>();

  constructor(private materials: ToonMaterialFactory) {}

  private geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geoCache.get(key);
    if (!g) {
      g = make();
      this.geoCache.set(key, g);
    }
    return g;
  }

  /** ∧ / ∨ chevron plate (two angled bars merged into one geometry). */
  private chevronGeo(up: boolean): THREE.BufferGeometry {
    return this.geo(`chevron-${up ? 'up' : 'down'}`, () => {
      const angle = up ? 0.6 : -0.6;
      const left = new THREE.BoxGeometry(0.42, 0.1, 0.06);
      left.rotateZ(angle);
      left.translate(-0.16, 0, 0);
      const right = new THREE.BoxGeometry(0.42, 0.1, 0.06);
      right.rotateZ(-angle);
      right.translate(0.16, 0, 0);
      const merged = mergeGeometries([left, right]);
      left.dispose();
      right.dispose();
      return merged;
    });
  }

  private crossGeo(): THREE.BufferGeometry {
    return this.geo('cross', () => {
      const a = new THREE.BoxGeometry(0.95, 0.14, 0.06);
      a.rotateZ(Math.PI / 4);
      const b = new THREE.BoxGeometry(0.95, 0.14, 0.06);
      b.rotateZ(-Math.PI / 4);
      const merged = mergeGeometries([a, b]);
      a.dispose();
      b.dispose();
      return merged;
    });
  }

  /** Builds the visual group for an archetype (origin at lane center, y=0). */
  build(type: ObstacleType): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = this.materials.get(BODY_DARK);
    const darkMat = this.materials.get(BODY_DARKER);

    switch (type) {
      case 'low': {
        // Beam on two posts — slide under (amber ∨).
        const glow = this.materials.basic(SIGNAL_COLORS.slide);
        const posts = new THREE.Mesh(
          this.geo('low-posts', () => {
            const l = new THREE.CylinderGeometry(0.07, 0.09, 1.25, 8);
            l.translate(-0.82, 0.625, 0);
            const r = new THREE.CylinderGeometry(0.07, 0.09, 1.25, 8);
            r.translate(0.82, 0.625, 0);
            const m = mergeGeometries([l, r]);
            l.dispose();
            r.dispose();
            return m;
          }),
          darkMat,
        );
        const beam = new THREE.Mesh(this.geo('low-beam', () => new RoundedBoxGeometry(1.9, 1.35, 0.36, 2, 0.09)), bodyMat);
        beam.position.y = 1.925;
        const strip = new THREE.Mesh(
          this.geo('low-strip', () => new THREE.BoxGeometry(1.9, 0.07, 0.4)),
          glow,
        );
        strip.position.y = 1.28; // marks the duck-under edge
        const icon = new THREE.Mesh(this.chevronGeo(false), glow);
        icon.position.set(0, 1.95, 0.21);
        group.add(posts, beam, strip, icon);
        break;
      }
      case 'overhead': {
        // Gantry with a hanging sign — jump is blocked, slide under (amber ∨).
        const glow = this.materials.basic(SIGNAL_COLORS.slide);
        const frame = new THREE.Mesh(
          this.geo('oh-frame', () => {
            const l = new THREE.CylinderGeometry(0.06, 0.08, 3.5, 8);
            l.translate(-0.88, 1.75, 0);
            const r = new THREE.CylinderGeometry(0.06, 0.08, 3.5, 8);
            r.translate(0.88, 1.75, 0);
            const bar = new THREE.BoxGeometry(2.0, 0.18, 0.3);
            bar.translate(0, 3.45, 0);
            const m = mergeGeometries([l, r, bar]);
            l.dispose();
            r.dispose();
            bar.dispose();
            return m;
          }),
          darkMat,
        );
        const sign = new THREE.Mesh(this.geo('oh-sign', () => new RoundedBoxGeometry(1.7, 2.0, 0.4, 2, 0.11)), bodyMat);
        sign.position.y = 2.3;
        const strip = new THREE.Mesh(
          this.geo('oh-strip', () => new THREE.BoxGeometry(1.7, 0.07, 0.44)),
          glow,
        );
        strip.position.y = 1.34;
        const icon = new THREE.Mesh(this.chevronGeo(false), glow);
        icon.position.set(0, 2.3, 0.23);
        group.add(frame, sign, strip, icon);
        break;
      }
      case 'hurdle': {
        // Knee/waist block — jump (cyan ∧).
        const glow = this.materials.basic(SIGNAL_COLORS.jump);
        const block = new THREE.Mesh(this.geo('hurdle-block', () => new RoundedBoxGeometry(1.8, 0.72, 0.5, 2, 0.1)), bodyMat);
        block.position.y = 0.36;
        const top = new THREE.Mesh(
          this.geo('hurdle-top', () => new THREE.BoxGeometry(1.8, 0.07, 0.54)),
          glow,
        );
        top.position.y = 0.75;
        const icon = new THREE.Mesh(this.chevronGeo(true), glow);
        icon.position.set(0, 0.42, 0.28);
        group.add(block, top, icon);
        break;
      }
      case 'full': {
        // Impassable panel — lane change only (magenta ✕).
        const glow = this.materials.basic(SIGNAL_COLORS.lane);
        const panel = new THREE.Mesh(this.geo('full-panel', () => new RoundedBoxGeometry(1.85, 3.4, 0.6, 2, 0.14)), bodyMat);
        panel.position.y = 1.7;
        const frame = new THREE.Mesh(
          this.geo('full-frame', () => {
            const t = new THREE.BoxGeometry(1.95, 0.14, 0.64);
            t.translate(0, 3.35, 0);
            const b = new THREE.BoxGeometry(1.95, 0.14, 0.64);
            b.translate(0, 0.07, 0);
            const m = mergeGeometries([t, b]);
            t.dispose();
            b.dispose();
            return m;
          }),
          darkMat,
        );
        const icon = new THREE.Mesh(this.crossGeo(), glow);
        icon.position.set(0, 1.8, 0.33);
        group.add(panel, frame, icon);
        break;
      }
      case 'mover': {
        // Brand-neutral maintenance hover-drone crossing lanes (magenta).
        const glow = this.materials.basic(SIGNAL_COLORS.lane);
        const body = new THREE.Mesh(this.geo('mover-body', () => new RoundedBoxGeometry(1.5, 0.7, 0.95, 2, 0.16)), bodyMat);
        body.position.y = 0.75;
        const canopy = new THREE.Mesh(this.geo('mover-canopy', () => new RoundedBoxGeometry(1.1, 0.34, 0.7, 2, 0.1)), darkMat);
        canopy.position.y = 1.27;
        const skirt = new THREE.Mesh(
          this.geo('mover-skirt', () => new THREE.BoxGeometry(1.6, 0.14, 1.05)),
          glow,
        );
        skirt.position.y = 0.32; // hover glow
        const beacon = new THREE.Mesh(this.geo('mover-beacon', () => new THREE.BoxGeometry(0.16, 0.16, 0.16)), glow);
        beacon.position.y = 1.55;
        group.add(body, canopy, skirt, beacon);
        break;
      }
      case 'gap': {
        // Missing track section — jump it or fall (cyan edges).
        const glow = this.materials.basic(SIGNAL_COLORS.jump);
        const hole = new THREE.Mesh(
          this.geo('gap-hole', () => new THREE.BoxGeometry(1.9, 0.02, 2.4)),
          this.materials.basic(0x05030f),
        );
        hole.position.y = 0.015; // sits on the road → reads as a void
        const edges = new THREE.Mesh(
          this.geo('gap-edges', () => {
            const near = new THREE.BoxGeometry(1.9, 0.05, 0.14);
            near.translate(0, 0.03, 1.2);
            const far = new THREE.BoxGeometry(1.9, 0.05, 0.14);
            far.translate(0, 0.03, -1.2);
            const m = mergeGeometries([near, far]);
            near.dispose();
            far.dispose();
            return m;
          }),
          glow,
        );
        group.add(hole, edges);
        break;
      }
    }

    group.visible = false;
    return group;
  }

  dispose(): void {
    for (const g of this.geoCache.values()) g.dispose();
    this.geoCache.clear();
  }
}

// ---------------------------------------------------------------------------

interface CrystalEntry {
  active: boolean;
  collected: boolean;
  x: number;
  y: number;
  z: number;
  popT: number;
}

const M4 = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const EULER = new THREE.Euler();
const POS = new THREE.Vector3();
const SCL = new THREE.Vector3();

/**
 * CrystalField — ALL crystals in one InstancedMesh: one draw call for up to
 * 96 gems (spec §18). Slots are recycled; collect plays a pop-scale animation.
 */
export class CrystalField {
  static readonly CAPACITY = 96;

  readonly mesh: THREE.InstancedMesh;
  private entries: CrystalEntry[] = [];
  private spin = 0;

  constructor(scene: THREE.Scene, materials: ToonMaterialFactory) {
    const geo = new THREE.OctahedronGeometry(0.26, 0);
    // Hot emissive so the bloom pass makes the gems genuinely glow.
    const mat = materials.get(0x9fe8ff, { emissive: 0x55d4ff, emissiveIntensity: 1.4 });
    this.mesh = new THREE.InstancedMesh(geo, mat, CrystalField.CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; // instances span the whole track
    for (let i = 0; i < CrystalField.CAPACITY; i++) {
      this.entries.push({ active: false, collected: false, x: 0, y: 0, z: 0, popT: 0 });
      this.writeMatrix(i, 0, -999, 0, 0);
    }
    scene.add(this.mesh);
  }

  private writeMatrix(i: number, x: number, y: number, z: number, scale: number): void {
    EULER.set(0.4, this.spin, 0);
    QUAT.setFromEuler(EULER);
    POS.set(x, y, z);
    SCL.setScalar(scale);
    M4.compose(POS, QUAT, SCL);
    this.mesh.setMatrixAt(i, M4);
  }

  spawn(x: number, y: number, z: number): void {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (!e.active) {
        e.active = true;
        e.collected = false;
        e.popT = 0;
        e.x = x;
        e.y = y;
        e.z = z;
        return;
      }
    }
    // Capacity exhausted — skip silently (pool sized generously; debug overlay
    // exposes counts so tuning catches this).
  }

  update(dt: number, move: number): void {
    this.spin += dt * 2.6;
    const despawnZ = Config.spawn.despawnBehindUnits;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (!e.active) continue;
      e.z += move;
      if (e.z > despawnZ) {
        e.active = false;
        this.writeMatrix(i, 0, -999, 0, 0);
        continue;
      }
      let scale = 1;
      if (e.collected) {
        // Pop: swell then vanish over ~0.28s.
        e.popT += dt;
        const t = e.popT / 0.28;
        if (t >= 1) {
          e.active = false;
          this.writeMatrix(i, 0, -999, 0, 0);
          continue;
        }
        scale = t < 0.35 ? 1 + t * 1.2 : (1 - t) * 2.15;
      }
      this.writeMatrix(i, e.x, e.y + Math.sin(this.spin + i) * 0.06, e.z, scale);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Sphere pickup test; fires the callback per collected crystal. */
  tryCollect(
    px: number,
    py: number,
    pz: number,
    radius: number,
    onCollect: (x: number, y: number, z: number) => void,
  ): void {
    const r2 = radius * radius;
    for (const e of this.entries) {
      if (!e.active || e.collected) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      const dz = e.z - pz;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        e.collected = true;
        e.popT = 0;
        onCollect(e.x, e.y, e.z);
      }
    }
  }

  /** Magnet support: pull nearby crystals toward the player (spec §7). */
  attract(px: number, py: number, pz: number, radius: number, pull: number, dt: number): void {
    const r2 = radius * radius;
    for (const e of this.entries) {
      if (!e.active || e.collected) continue;
      const dx = px - e.x;
      const dy = py - e.y;
      const dz = pz - e.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2 || d2 < 1e-4) continue;
      const d = Math.sqrt(d2);
      const step = Math.min((pull * dt) / d, 1);
      e.x += dx * step;
      e.y += dy * step;
      e.z += dz * step;
    }
  }

  releaseAll(): void {
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].active = false;
      this.writeMatrix(i, 0, -999, 0, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get activeCount(): number {
    let n = 0;
    for (const e of this.entries) if (e.active) n++;
    return n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

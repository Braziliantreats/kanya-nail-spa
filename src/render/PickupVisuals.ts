/**
 * PickupVisuals — floating power-up tokens (spec §7): a glowing ring with a
 * distinct inner icon shape per type. Distinct color + distinct geometry so
 * type is never color-only (spec §16).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PICKUP_COLORS, type PowerupType } from '../data/powerups';
import type { ToonMaterialFactory } from './ToonMaterialFactory';

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function iconGeometry(type: PowerupType): THREE.BufferGeometry {
  switch (type) {
    case 'magnet':
      // Horseshoe.
      return cached('icon-magnet', () =>
        new THREE.TorusGeometry(0.17, 0.06, 8, 12, Math.PI).rotateZ(Math.PI),
      );
    case 'doubleUp':
      // Two stacked bars.
      return cached('icon-doubleup', () => {
        const a = new THREE.BoxGeometry(0.3, 0.09, 0.08);
        a.translate(0, 0.09, 0);
        const b = new THREE.BoxGeometry(0.3, 0.09, 0.08);
        b.translate(0, -0.09, 0);
        const m = mergeGeometries([a, b]);
        a.dispose();
        b.dispose();
        return m;
      });
    case 'liftoff':
      // Upswept wings.
      return cached('icon-liftoff', () => {
        const l = new THREE.BoxGeometry(0.26, 0.07, 0.08);
        l.rotateZ(0.5);
        l.translate(-0.12, 0, 0);
        const r = new THREE.BoxGeometry(0.26, 0.07, 0.08);
        r.rotateZ(-0.5);
        r.translate(0.12, 0, 0);
        const m = mergeGeometries([l, r]);
        l.dispose();
        r.dispose();
        return m;
      });
    case 'glider':
      // Deck seen edge-on.
      return cached('icon-glider', () => new THREE.BoxGeometry(0.4, 0.07, 0.14));
    case 'zen':
      // Flat halo.
      return cached('icon-zen', () => new THREE.TorusGeometry(0.16, 0.05, 8, 16).rotateX(Math.PI / 2.4));
    case 'dash':
      // Double chevron ».
      return cached('icon-dash', () => {
        const parts: THREE.BoxGeometry[] = [];
        for (const off of [-0.09, 0.13]) {
          const up = new THREE.BoxGeometry(0.2, 0.07, 0.08);
          up.rotateZ(-0.7);
          up.translate(off, 0.07, 0);
          const dn = new THREE.BoxGeometry(0.2, 0.07, 0.08);
          dn.rotateZ(0.7);
          dn.translate(off, -0.07, 0);
          parts.push(up, dn);
        }
        const m = mergeGeometries(parts);
        parts.forEach((p) => p.dispose());
        return m;
      });
  }
}

export function buildPickupVisual(type: PowerupType, materials: ToonMaterialFactory): THREE.Group {
  const group = new THREE.Group();
  const glow = materials.basic(PICKUP_COLORS[type]);
  const ring = new THREE.Mesh(cached('pickup-ring', () => new THREE.TorusGeometry(0.42, 0.055, 10, 22)), glow);
  const icon = new THREE.Mesh(iconGeometry(type), glow);
  icon.position.z = 0.02;
  group.add(ring, icon);
  group.visible = false;
  return group;
}

export function disposePickupGeometries(): void {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}

/**
 * ToonMaterialFactory — cel/toon-shaded materials (spec §9).
 * MeshToonMaterial with a shared N-step gradient map. Materials are cached
 * and shared by parameter key to keep draw-call/program counts low (§18).
 */

import * as THREE from 'three';
import { Config } from '../core/Config';

export interface ToonMaterialOptions {
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

export class ToonMaterialFactory {
  private gradientMap: THREE.DataTexture | null = null;
  private cache = new Map<string, THREE.MeshToonMaterial>();

  /** Shared 3–4 step gradient map for the banded toon look. */
  private getGradientMap(): THREE.DataTexture {
    if (this.gradientMap) return this.gradientMap;
    const steps = Config.render.toonSteps;
    const data = new Uint8Array(steps);
    for (let i = 0; i < steps; i++) {
      // Lift the darkest band so shadows stay colorful, not muddy.
      data[i] = Math.round(90 + (165 * i) / (steps - 1));
    }
    const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.gradientMap = tex;
    return tex;
  }

  get(color: number, opts: ToonMaterialOptions = {}): THREE.MeshToonMaterial {
    const key = `${color}|${opts.emissive ?? -1}|${opts.emissiveIntensity ?? 1}|${
      opts.transparent ? 1 : 0
    }|${opts.opacity ?? 1}`;
    let mat = this.cache.get(key);
    if (!mat) {
      mat = new THREE.MeshToonMaterial({
        color,
        gradientMap: this.getGradientMap(),
      });
      if (opts.emissive !== undefined) {
        mat.emissive = new THREE.Color(opts.emissive);
        mat.emissiveIntensity = opts.emissiveIntensity ?? 1;
      }
      if (opts.transparent) {
        mat.transparent = true;
        mat.opacity = opts.opacity ?? 1;
      }
      this.cache.set(key, mat);
    }
    return mat;
  }

  /** Unlit glow material (lane lines, crystals' inner core, UI-ish 3D bits). */
  basic(color: number, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshBasicMaterial {
    const key = `basic|${color}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}`;
    let mat = this.basicCache.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color });
      if (opts.transparent) {
        mat.transparent = true;
        mat.opacity = opts.opacity ?? 1;
      }
      this.basicCache.set(key, mat);
    }
    return mat;
  }
  private basicCache = new Map<string, THREE.MeshBasicMaterial>();

  /** Dispose every cached material + the gradient map (spec §18 teardown). */
  disposeAll(): void {
    for (const mat of this.cache.values()) mat.dispose();
    for (const mat of this.basicCache.values()) mat.dispose();
    this.cache.clear();
    this.basicCache.clear();
    this.gradientMap?.dispose();
    this.gradientMap = null;
  }
}

/**
 * Renderer.ts — WebGL2 renderer + chase camera shell (spec §1, §11, §18).
 * Pixel ratio capped at 2 with an adaptive-quality scale hook.
 */

import * as THREE from 'three';
import { Config } from '../core/Config';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  /** Extra multiplier applied by adaptive quality (1.0 = full). */
  private ratioScale = 1;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Toon shading wants flat, unfiltered color.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.applyPixelRatio();
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      Config.camera.fovDeg,
      1,
      Config.camera.near,
      // Far plane tuned to fog distance (spec §11) — a margin past max fogFar.
      120,
    );

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private applyPixelRatio(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, Config.render.pixelRatioCap);
    this.renderer.setPixelRatio(dpr * this.ratioScale);
  }

  /** Adaptive quality hook: 1.0 → step down toward 0.7 under load. */
  setPixelRatioScale(scale: number): void {
    if (scale === this.ratioScale) return;
    this.ratioScale = scale;
    this.applyPixelRatio();
    this.resize();
  }

  resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  render(scene: THREE.Scene): void {
    this.renderer.render(scene, this.camera);
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  get triangles(): number {
    return this.renderer.info.render.triangles;
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

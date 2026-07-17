/**
 * Renderer.ts — WebGL2 renderer + chase camera shell (spec §1, §11, §18).
 * Pixel ratio capped at 2 with an adaptive-quality scale hook.
 *
 * A selective bloom pass gives the neon glow its actual glow — it's the
 * single biggest contributor to the "professional cartoon finish" (spec §9).
 * Adaptive quality disables it under load (L1+) and falls back to a plain
 * render, so mid-range mobile never pays for it while struggling.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Config } from '../core/Config';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  /** Extra multiplier applied by adaptive quality (1.0 = full). */
  private ratioScale = 1;

  private composer: EffectComposer | null = null;
  private renderPass!: RenderPass;
  private bloomPass!: UnrealBloomPass;
  private bloomEnabled = true;
  private composerScene: THREE.Scene | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Toon shading wants flat, unfiltered color.
    this.renderer.toneMapping = THREE.NoToneMapping;
    // Manual info reset so draw-call counts stay truthful across the
    // multi-pass composer frame (auto-reset would only report the last pass).
    this.renderer.info.autoReset = false;
    this.applyPixelRatio();
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      Config.camera.fovDeg,
      1,
      Config.camera.near,
      // Far plane tuned to fog distance (spec §11) — a margin past max fogFar.
      160,
    );

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private ensureComposer(scene: THREE.Scene): void {
    if (this.composer && this.composerScene === scene) return;
    const b = Config.render.bloom;
    this.renderPass = new RenderPass(scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(256, 256),
      b.strength,
      b.radius,
      b.threshold,
    );
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.composerScene = scene;
    this.resize();
  }

  /** Adaptive quality: bloom is the first thing to go under load. */
  setBloomEnabled(enabled: boolean): void {
    this.bloomEnabled = enabled;
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
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  render(scene: THREE.Scene): void {
    this.renderer.info.reset();
    if (this.bloomEnabled) {
      this.ensureComposer(scene);
      this.composer!.render();
    } else {
      this.renderer.render(scene, this.camera);
    }
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

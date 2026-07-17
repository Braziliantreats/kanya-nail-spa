/**
 * ParticleSystem — pooled, instanced, capped (spec §9/§18).
 *
 * One additive-blended InstancedMesh drives ALL point particles (crystal
 * pops, power-up bursts, near-miss sparkles, crash debris, ambient theme
 * particles, Zen sparkle trail) = 1 draw call. A second small InstancedMesh
 * renders Dash motion streaks (elongated, not billboarded) = 1 draw call.
 *
 * Zero allocation during play: fixed-capacity typed arrays + free stacks;
 * counts scale with adaptive quality and reduced-motion settings.
 */

import * as THREE from 'three';

export type AmbientMode = 'sparks' | 'embers' | 'fireflies' | 'dust' | 'stars' | 'none';

const MAX = 512;
const STREAK_MAX = 40;

const M4 = new THREE.Matrix4();
const POS = new THREE.Vector3();
const SCL = new THREE.Vector3();
const COLOR = new THREE.Color();
const IDENTITY_QUAT = new THREE.Quaternion();

export interface BurstOptions {
  count: number;
  color: number;
  speed?: number;
  spread?: number;
  ttl?: number;
  size?: number;
  gravity?: number;
  upBias?: number;
}

export class ParticleSystem {
  private mesh: THREE.InstancedMesh;
  private streaks: THREE.InstancedMesh;

  // Structure-of-arrays particle state.
  private px = new Float32Array(MAX);
  private py = new Float32Array(MAX);
  private pz = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private vz = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private ttl = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private freeList: number[] = [];

  private streakZ = new Float32Array(STREAK_MAX);
  private streakX = new Float32Array(STREAK_MAX);
  private streakY = new Float32Array(STREAK_MAX);
  private streakLive = new Uint8Array(STREAK_MAX);
  private dashActive = false;
  private streakAccum = 0;

  private ambient: AmbientMode = 'none';
  private ambientAccum = 0;

  /** Adaptive quality multiplier (phase-10 governor writes this). */
  qualityScale = 1;
  reducedMotion = false;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(0.22, 0.22);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.freeList.push(i);
      this.mesh.setMatrixAt(i, M4.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, COLOR.setHex(0xffffff));
    }
    scene.add(this.mesh);

    const streakGeo = new THREE.BoxGeometry(0.045, 0.045, 2.0);
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xaef7ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.streaks = new THREE.InstancedMesh(streakGeo, streakMat, STREAK_MAX);
    this.streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.streaks.frustumCulled = false;
    for (let i = 0; i < STREAK_MAX; i++) this.streaks.setMatrixAt(i, M4.makeScale(0, 0, 0));
    scene.add(this.streaks);
  }

  setAmbient(mode: AmbientMode): void {
    this.ambient = mode;
  }

  setDash(active: boolean): void {
    this.dashActive = active;
  }

  burst(x: number, y: number, z: number, opts: BurstOptions): void {
    const scale = this.qualityScale * (this.reducedMotion ? 0.35 : 1);
    const n = Math.max(1, Math.round(opts.count * scale));
    const speed = opts.speed ?? 3.2;
    const spread = opts.spread ?? 1;
    const upBias = opts.upBias ?? 0.6;
    COLOR.setHex(opts.color);
    for (let k = 0; k < n; k++) {
      const i = this.freeList.pop();
      if (i === undefined) return; // hard cap reached — drop silently
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      const theta = Math.random() * Math.PI * 2;
      const r = (0.4 + Math.random() * 0.6) * speed;
      this.vx[i] = Math.cos(theta) * r * spread;
      this.vy[i] = (Math.random() * 0.9 + upBias) * speed * 0.75;
      this.vz[i] = Math.sin(theta) * r * spread * 0.6;
      this.ttl[i] = this.life[i] = (opts.ttl ?? 0.55) * (0.7 + Math.random() * 0.6);
      this.size[i] = (opts.size ?? 1) * (0.7 + Math.random() * 0.7);
      this.grav[i] = opts.gravity ?? 6;
      this.mesh.setColorAt(i, COLOR);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Continuous Zen sparkle trail around the player (COMPLIANCE: abstract). */
  zenTrail(x: number, y: number, z: number, dt: number): void {
    if (this.reducedMotion) return;
    if (Math.random() < dt * 26 * this.qualityScale) {
      this.burst(x + (Math.random() - 0.5) * 1.1, y + Math.random() * 1.6, z + 0.4, {
        count: 1,
        color: Math.random() < 0.5 ? 0xc9a6ff : 0xaef7ff,
        speed: 0.7,
        gravity: -0.6, // gentle rise
        ttl: 0.9,
        size: 0.8,
        upBias: 0.2,
      });
    }
  }

  private spawnAmbient(dt: number): void {
    if (this.ambient === 'none' || this.reducedMotion) return;
    const rates: Record<AmbientMode, number> = {
      sparks: 3,
      embers: 5,
      fireflies: 6,
      dust: 4,
      stars: 7,
      none: 0,
    };
    const colors: Record<AmbientMode, number> = {
      sparks: 0x7de8ff,
      embers: 0xff8f5c,
      fireflies: 0xd9ffb0,
      dust: 0xffe0b0,
      stars: 0xffffff,
      none: 0xffffff,
    };
    this.ambientAccum += dt * rates[this.ambient] * this.qualityScale;
    while (this.ambientAccum >= 1) {
      this.ambientAccum -= 1;
      const i = this.freeList.pop();
      if (i === undefined) return;
      this.px[i] = (Math.random() - 0.5) * 14;
      this.py[i] = 0.4 + Math.random() * 4.2;
      this.pz[i] = -55 + Math.random() * 45;
      this.vx[i] = (Math.random() - 0.5) * 0.5;
      this.vy[i] = this.ambient === 'embers' ? 0.7 : (Math.random() - 0.5) * 0.4;
      this.vz[i] = 0;
      this.ttl[i] = this.life[i] = 2.5 + Math.random() * 2.5;
      this.size[i] = this.ambient === 'stars' ? 0.45 : 0.65;
      this.grav[i] = 0;
      this.mesh.setColorAt(i, COLOR.setHex(colors[this.ambient]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, worldMove: number, cameraQuat: THREE.Quaternion): void {
    this.spawnAmbient(dt);

    // --- Point particles (billboarded toward the camera) ---
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.freeList.push(i);
        this.mesh.setMatrixAt(i, M4.makeScale(0, 0, 0));
        continue;
      }
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt + worldMove;
      const t = this.life[i] / this.ttl[i];
      POS.set(this.px[i], this.py[i], this.pz[i]);
      SCL.setScalar(this.size[i] * (0.4 + 0.6 * t));
      M4.compose(POS, cameraQuat, SCL);
      this.mesh.setMatrixAt(i, M4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // --- Dash streaks ---
    if (this.dashActive && !this.reducedMotion) {
      this.streakAccum += dt * 26;
      while (this.streakAccum >= 1) {
        this.streakAccum -= 1;
        for (let i = 0; i < STREAK_MAX; i++) {
          if (!this.streakLive[i]) {
            this.streakLive[i] = 1;
            this.streakX[i] = (Math.random() - 0.5) * 9;
            this.streakY[i] = 0.4 + Math.random() * 3.4;
            this.streakZ[i] = -46 - Math.random() * 18;
            break;
          }
        }
      }
    }
    for (let i = 0; i < STREAK_MAX; i++) {
      if (!this.streakLive[i]) continue;
      this.streakZ[i] += worldMove * 2.4 + dt * 6;
      if (this.streakZ[i] > 10) {
        this.streakLive[i] = 0;
        this.streaks.setMatrixAt(i, M4.makeScale(0, 0, 0));
        continue;
      }
      POS.set(this.streakX[i], this.streakY[i], this.streakZ[i]);
      SCL.set(1, 1, 1);
      M4.compose(POS, IDENTITY_QUAT, SCL);
      this.streaks.setMatrixAt(i, M4);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }

  get activeCount(): number {
    return MAX - this.freeList.length;
  }

  releaseAll(): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] > 0) {
        this.life[i] = 0;
        this.freeList.push(i);
        this.mesh.setMatrixAt(i, M4.makeScale(0, 0, 0));
      }
    }
    for (let i = 0; i < STREAK_MAX; i++) {
      this.streakLive[i] = 0;
      this.streaks.setMatrixAt(i, M4.makeScale(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.streaks.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.streaks.geometry.dispose();
    (this.streaks.material as THREE.Material).dispose();
    this.streaks.dispose();
  }
}

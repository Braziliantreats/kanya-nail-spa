/**
 * CameraSystem — chase cam with soft catch-up (spec §11).
 * Lerped follow (never hard-parented), lateral lookahead + ~2° roll on lane
 * changes, subtle FOV creep with speed. FOV kick + shake hooks land with the
 * power-up/juice phases; reduced-motion damping arrives with settings.
 */

import type * as THREE from 'three';
import { Config } from '../core/Config';
import { damp, lerp } from '../core/easing';
import type { MovementSystem } from './MovementSystem';

const DEG2RAD = Math.PI / 180;

export class CameraSystem {
  private roll = 0;
  /** Extra FOV added by Dash kicks. */
  fovKickDeg = 0;
  /** Shake amplitude (crash feedback). */
  private shakeAmp = 0;
  private shakeTimeS = 0;
  /** Dash FOV envelope timer (-1 = idle). */
  private kickT = -1;

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Dash FOV kick (spec §11): +kick over 150ms, hold, ease back over 400ms. */
  dashKick(): void {
    this.kickT = 0;
  }

  private updateKick(dt: number): void {
    if (this.kickT < 0) return;
    this.kickT += dt;
    const { inMs, holdMs, outMs } = Config.camera.dashFov;
    const kick = Config.powerups.dash.fovKickDeg;
    const tIn = inMs / 1000;
    const tHold = tIn + holdMs / 1000;
    const tOut = tHold + outMs / 1000;
    if (this.kickT <= tIn) {
      this.fovKickDeg = kick * (this.kickT / tIn);
    } else if (this.kickT <= tHold) {
      this.fovKickDeg = kick;
    } else if (this.kickT <= tOut) {
      const t = (this.kickT - tHold) / (tOut - tHold);
      this.fovKickDeg = kick * (1 - t * t); // ease back
    } else {
      this.fovKickDeg = 0;
      this.kickT = -1;
    }
  }

  update(dt: number, movement: MovementSystem, speed: number): void {
    const cfg = Config.camera;
    const k = damp(cfg.followLerp, dt);
    this.updateKick(dt);

    // Soft catch-up toward the player's lateral position + jump height.
    const targetX = movement.visualX * cfg.lateralLookahead;
    const targetY = cfg.offset.y + movement.y * 0.3;
    this.camera.position.x = lerp(this.camera.position.x, targetX, k);
    this.camera.position.y = lerp(this.camera.position.y, targetY, k);
    this.camera.position.z = cfg.offset.z;

    // Look slightly ahead of the player, biased toward their lane.
    this.camera.lookAt(
      movement.visualX * 0.8,
      cfg.lookAt.y + movement.y * 0.45,
      cfg.lookAt.z,
    );

    // Roll on lane changes (applied after lookAt, which resets orientation).
    const targetRoll = -movement.laneChangeDir * cfg.rollDeg * DEG2RAD;
    this.roll = lerp(this.roll, targetRoll, damp(10, dt));
    this.camera.rotation.z += this.roll;

    // Decaying directional shake (fed by crashes later).
    if (this.shakeAmp > 0.001) {
      this.shakeTimeS += dt;
      const falloff = this.shakeAmp * Math.exp(-10 * this.shakeTimeS);
      this.camera.position.x += Math.sin(this.shakeTimeS * 71) * falloff;
      this.camera.position.y += Math.cos(this.shakeTimeS * 57) * falloff * 0.7;
      if (falloff < 0.002) this.shakeAmp = 0;
    }

    // FOV: base + speed creep + kick. Only touch the projection on change.
    const speedNorm = Math.min(
      Math.max((speed - Config.run.baseSpeed) / (Config.run.maxSpeed - Config.run.baseSpeed), 0),
      1,
    );
    const targetFov = cfg.fovDeg + cfg.fovSpeedCreepDeg * speedNorm + this.fovKickDeg;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = lerp(this.camera.fov, targetFov, damp(8, dt));
      this.camera.updateProjectionMatrix();
    }
  }

  /** Directional crash shake (spec §11: ~200ms, decaying). */
  shake(magnitude: number): void {
    this.shakeAmp = magnitude;
    this.shakeTimeS = 0;
  }
}

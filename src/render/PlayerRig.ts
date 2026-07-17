/**
 * PlayerRig — procedural, toon-shaded character visuals + animation (spec §9/§10).
 *
 * Code-driven articulation instead of baked GLTF clips (no binary assets):
 * run/air/slide poses are blended continuously (cross-fade equivalent), with
 * squash-and-stretch impulses on takeoff/landing. The rig is purely visual —
 * MovementSystem owns all logic; the rig reads its state each frame.
 */

import * as THREE from 'three';
import { Config } from '../core/Config';
import { damp, lerp } from '../core/easing';
import type { EventBus } from '../core/Events';
import { CHARACTERS } from '../data/characters';
import type { MovementSystem } from '../systems/MovementSystem';
import type { ToonMaterialFactory } from './ToonMaterialFactory';

export class PlayerRig {
  readonly group = new THREE.Group();

  /** Inner body group (torso/head/arms) — pitched during slides. */
  private body = new THREE.Group();
  private head!: THREE.Group;
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private legL!: THREE.Group;
  private legR!: THREE.Group;
  private pistonL!: THREE.Mesh;
  private pistonR!: THREE.Mesh;

  private shadow: THREE.Mesh;
  private shadowMat: THREE.MeshBasicMaterial;
  private gliderBoard!: THREE.Mesh;

  private runPhase = 0;
  private slideBlend = 0;
  private airBlend = 0;
  /** Squash (+) / stretch (−) impulse, decays exponentially. */
  private squashImpulse = 0;
  /** Post-revive invincibility flicker time remaining (spec §15). */
  flickerRemainS = 0;

  private geometries: THREE.BufferGeometry[] = [];

  constructor(
    private scene: THREE.Scene,
    private materials: ToonMaterialFactory,
    bus: EventBus,
    characterId: string = 'sprocket',
  ) {
    this.buildCharacter(characterId);
    this.group.add(this.body);
    scene.add(this.group);

    // Soft blob shadow (no realtime shadows on mobile — spec §9).
    const shadowGeo = new THREE.CircleGeometry(0.55, 24);
    this.geometries.push(shadowGeo);
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x05030f,
      transparent: true,
      opacity: 0.35,
    });
    this.shadow = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    scene.add(this.shadow);

    // Animation impulses ride the event bus — rig stays decoupled from logic.
    bus.on('player.jumped', () => (this.squashImpulse = 0.28));
    bus.on('player.landed', () => (this.squashImpulse = 0.34));
    bus.on('player.fastfall', () => (this.squashImpulse = -0.22));
  }

  private box(w: number, h: number, d: number, color: number, emissive?: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    this.geometries.push(geo);
    const mat = emissive
      ? this.materials.get(color, { emissive, emissiveIntensity: 0.9 })
      : this.materials.get(color);
    return new THREE.Mesh(geo, mat);
  }

  private cylinder(rTop: number, rBot: number, h: number, color: number): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 10);
    this.geometries.push(geo);
    return new THREE.Mesh(geo, this.materials.get(color));
  }

  /** Sprocket — lanky robot, piston legs, mechanical bounce (spec §10). */
  private buildCharacter(characterId: string): void {
    const def = CHARACTERS[characterId] ?? CHARACTERS.sprocket;
    const p = def.palette;

    // Torso — slim chassis with an accent core line.
    const torso = this.box(0.52, 0.62, 0.34, p.primary);
    torso.position.y = 1.05;
    const core = this.box(0.1, 0.4, 0.06, p.secondary, p.accent);
    core.position.set(0, 1.05, 0.18);
    const hips = this.box(0.42, 0.18, 0.3, p.secondary);
    hips.position.y = 0.68;

    // Head — angular, wide cyan visor. Stylized-cool, not cutesy (COMPLIANCE).
    this.head = new THREE.Group();
    const skull = this.box(0.34, 0.28, 0.3, p.primary);
    const visor = this.box(0.28, 0.09, 0.05, p.secondary, p.glow);
    visor.position.set(0, 0.02, 0.16);
    const antenna = this.cylinder(0.015, 0.015, 0.16, p.secondary);
    antenna.position.set(0.12, 0.2, 0);
    const antennaTip = this.box(0.05, 0.05, 0.05, p.secondary, p.accent);
    antennaTip.position.set(0.12, 0.3, 0);
    this.head.add(skull, visor, antenna, antennaTip);
    this.head.position.y = 1.52;

    // Arms — pivot at the shoulder.
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const upper = this.cylinder(0.06, 0.05, 0.34, p.secondary);
      upper.position.y = -0.17;
      const fist = this.box(0.11, 0.11, 0.11, p.primary);
      fist.position.y = -0.4;
      arm.add(upper, fist);
      arm.position.set(side * 0.34, 1.32, 0);
    }

    // Piston legs — pivot at the hip; the lower piston telescopes.
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    let first = true;
    for (const [leg, side] of [
      [this.legL, -1],
      [this.legR, 1],
    ] as const) {
      const upper = this.cylinder(0.08, 0.07, 0.3, p.primary);
      upper.position.y = -0.15;
      const piston = this.cylinder(0.045, 0.045, 0.34, p.secondary);
      piston.position.y = -0.42;
      const foot = this.box(0.16, 0.08, 0.24, p.secondary);
      foot.position.set(0, -0.6, 0.04);
      leg.add(upper, piston, foot);
      leg.position.set(side * 0.15, 0.64, 0);
      if (first) {
        this.pistonL = piston;
        first = false;
      } else {
        this.pistonR = piston;
      }
    }

    this.body.add(torso, core, hips, this.head, this.armL, this.armR);
    // Legs attach to the root so slides pitch the body while legs extend.
    this.group.add(this.legL, this.legR);

    // Glider board — hidden until deployed (spec §7).
    this.gliderBoard = this.box(0.95, 0.08, 0.5, 0x2b2350, 0xff8f5c);
    this.gliderBoard.position.y = -0.02;
    this.gliderBoard.visible = false;
    this.group.add(this.gliderBoard);
  }

  setGlider(visible: boolean): void {
    this.gliderBoard.visible = visible;
  }

  /** Per-frame update while a run (or menu idle) is active. */
  update(dt: number, movement: MovementSystem, speedNorm: number): void {
    const m = movement;
    this.group.position.x = m.visualX;
    this.group.position.y = m.y;

    // Revive invincibility flicker (spec §15).
    if (this.flickerRemainS > 0) {
      this.flickerRemainS -= dt;
      this.group.visible = Math.sin(this.flickerRemainS * 28) > -0.35;
      if (this.flickerRemainS <= 0) this.group.visible = true;
    }

    // Pose blends (continuous cross-fade between run/slide/air).
    const blendK = damp(14, dt);
    this.slideBlend = lerp(this.slideBlend, m.slideActive ? 1 : 0, blendK);
    this.airBlend = lerp(this.airBlend, m.airborne ? 1 : 0, blendK);
    this.squashImpulse *= Math.exp(-9 * dt);

    // Run cycle — cadence scales with speed; exaggerated mechanical bounce.
    this.runPhase += dt * (7 + speedNorm * 9);
    const phase = this.runPhase;
    const runW = (1 - this.airBlend) * (1 - this.slideBlend);

    const swing = Math.sin(phase);
    this.legL.rotation.x = swing * 0.95 * runW + this.airBlend * 0.55 - this.slideBlend * 1.35;
    this.legR.rotation.x = -swing * 0.95 * runW - this.airBlend * 0.35 - this.slideBlend * 1.35;
    // Telescoping pistons compress into ground contact.
    this.pistonL.scale.y = 1 - 0.3 * Math.max(0, -swing) * runW;
    this.pistonR.scale.y = 1 - 0.3 * Math.max(0, swing) * runW;
    this.armL.rotation.x = -swing * 0.8 * runW + this.airBlend * -1.9;
    this.armR.rotation.x = swing * 0.8 * runW + this.airBlend * -1.9;

    // Body bounce + forward lean; slide lays the body back.
    const bounce = Math.abs(Math.sin(phase)) * 0.06 * runW;
    this.body.position.y = bounce - this.slideBlend * 0.52;
    this.body.rotation.x = 0.12 * runW + this.airBlend * -0.1 + this.slideBlend * -1.15;
    this.head.rotation.x = this.slideBlend * 0.75; // keep eyes down-track

    // Lane-change lean.
    this.body.rotation.z = lerp(this.body.rotation.z, -m.laneChangeDir * 0.18, blendK);

    // Squash & stretch (takeoff/apex/land — spec §5) with volume preserved.
    const stretch = this.airBlend * Math.min(Math.abs(m.verticalVelocity) * 0.012, 0.1);
    const sy = 1 - this.squashImpulse + stretch;
    const sxz = 1 / Math.sqrt(Math.max(sy, 0.5));
    this.group.scale.set(sxz, sy, sxz);

    // Blob shadow tracks x and fades with height.
    this.shadow.position.x = m.visualX;
    this.shadow.position.z = 0;
    const hNorm = Math.min(m.y / Config.jump.apexHeight, 1);
    this.shadow.scale.setScalar(1 - hNorm * 0.45);
    this.shadowMat.opacity = 0.35 * (1 - hNorm * 0.65);
  }

  /** Ambient idle for menu/game-over backgrounds (spec §14). */
  idle(dt: number): void {
    this.runPhase += dt * 1.6;
    const t = this.runPhase;
    this.group.position.x = lerp(this.group.position.x, 0, damp(4, dt));
    this.group.position.y = 0;
    this.group.scale.set(1, 1, 1);
    this.body.position.y = Math.sin(t) * 0.03;
    this.body.rotation.x = 0.03;
    this.body.rotation.z = 0;
    this.head.rotation.y = Math.sin(t * 0.6) * 0.35; // slow look-around
    this.head.rotation.x = 0;
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
    this.pistonL.scale.y = 1;
    this.pistonR.scale.y = 1;
    this.armL.rotation.x = Math.sin(t) * 0.08;
    this.armR.rotation.x = -Math.sin(t) * 0.08;
    this.shadow.position.x = this.group.position.x;
    this.shadow.scale.setScalar(1);
    this.shadowMat.opacity = 0.35;
  }

  dispose(): void {
    this.scene.remove(this.group, this.shadow);
    for (const geo of this.geometries) geo.dispose();
    this.geometries.length = 0;
    this.shadowMat.dispose();
  }
}

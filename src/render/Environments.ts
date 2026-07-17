/**
 * Environments.ts — scrolling track, lighting, and theme application (spec §9).
 *
 * Movement model (spec §5): the player stays near z=0 and the WORLD scrolls
 * toward the camera (+z). Track slabs are pooled and recycled by reposition —
 * nothing is created or destroyed during play (spec §18).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Config } from '../core/Config';
import { ENVIRONMENTS, type EnvironmentTheme } from '../data/environments';
import type { ToonMaterialFactory } from './ToonMaterialFactory';

interface TrackSegment {
  group: THREE.Group;
}

export class EnvironmentSystem {
  private segments: TrackSegment[] = [];
  private totalLength = 0;
  private recycleZ = 0;

  // Dedicated (cloned) materials so theme changes can mutate colors without
  // corrupting the shared factory cache.
  private roadMatA!: THREE.MeshToonMaterial;
  private roadMatB!: THREE.MeshToonMaterial;
  private shoulderMat!: THREE.MeshToonMaterial;
  private dashMat!: THREE.MeshBasicMaterial;
  private curbMat!: THREE.MeshBasicMaterial;

  private hemiLight!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;
  private bgColor = new THREE.Color();

  private geometries: THREE.BufferGeometry[] = [];
  private currentThemeId = 'subway';

  constructor(
    private scene: THREE.Scene,
    private materials: ToonMaterialFactory,
  ) {}

  get theme(): EnvironmentTheme {
    return ENVIRONMENTS[this.currentThemeId];
  }

  init(themeId: string): void {
    const theme = ENVIRONMENTS[themeId] ?? ENVIRONMENTS.subway;
    this.currentThemeId = theme.id;

    // --- Lighting: 1 directional + 1 hemisphere, no realtime shadows (§9) ---
    this.hemiLight = new THREE.HemisphereLight(0x8fb4ff, theme.shoulder, 0.9);
    this.dirLight = new THREE.DirectionalLight(0xfff2e0, 1.35);
    this.dirLight.position.set(4, 9, 3);
    this.dirLight.target.position.set(0, 0, -8);
    this.scene.add(this.hemiLight, this.dirLight, this.dirLight.target);

    this.buildTrack(theme);
    this.applyTheme(theme);
  }

  private buildTrack(theme: EnvironmentTheme): void {
    const { segmentLength: segLen, segmentCount, shoulderWidth } = Config.track;
    const laneW = Config.lanes.width;
    const roadWidth = laneW * Config.lanes.count + 0.4; // slight bleed past lane edges
    this.totalLength = segLen * segmentCount;
    // Segments scrolling past this z snap back to the far end of the loop.
    this.recycleZ = 18;

    this.roadMatA = this.materials.get(theme.ground).clone();
    this.roadMatB = this.materials.get(theme.groundAlt).clone();
    this.shoulderMat = this.materials.get(theme.shoulder).clone();
    this.dashMat = this.materials.basic(theme.laneLine).clone();
    this.curbMat = this.materials.basic(theme.laneLine, { transparent: true, opacity: 0.55 }).clone();

    // --- Shared geometries (one of each, reused by every segment) ---
    const roadGeo = new THREE.BoxGeometry(roadWidth, 0.5, segLen);
    this.geometries.push(roadGeo);

    // Lane-boundary dashes for one segment, merged into a single geometry so
    // each segment adds only one extra draw call. Lane centers sit at
    // -laneW, 0, +laneW (spec §5), so the boundary lines between adjacent
    // lanes fall exactly at x = ±laneW/2.
    const dashLen = 1.2;
    const dashGap = 0.8;
    const dashPieces: THREE.BoxGeometry[] = [];
    for (const x of [-laneW / 2, laneW / 2]) {
      for (let z = -segLen / 2 + dashLen / 2; z <= segLen / 2 - dashLen / 2; z += dashLen + dashGap) {
        const piece = new THREE.BoxGeometry(0.08, 0.02, dashLen);
        piece.translate(x, 0.26, z); // just above the road's top surface (y=0.25 in group space)
        dashPieces.push(piece);
      }
    }
    const dashGeo = mergeGeometries(dashPieces);
    dashPieces.forEach((g) => g.dispose());
    this.geometries.push(dashGeo);

    // --- Pooled scrolling road segments ---
    const startZ = this.recycleZ - segLen / 2;
    for (let i = 0; i < segmentCount; i++) {
      const group = new THREE.Group();
      const road = new THREE.Mesh(roadGeo, i % 2 === 0 ? this.roadMatA : this.roadMatB);
      road.position.y = -0.25; // top surface at y = 0
      const dash = new THREE.Mesh(dashGeo, this.dashMat);
      dash.position.y = -0.25;
      group.add(road, dash);
      group.position.z = startZ - i * segLen;
      this.scene.add(group);
      this.segments.push({ group });
    }

    // --- Static shoulders + glowing curb strips (uniform surfaces don't need
    // to scroll to read correctly; alternating slabs + dashes carry motion) ---
    const staticLen = this.totalLength + 60;
    const staticCenterZ = this.recycleZ + 10 - staticLen / 2;
    const shoulderGeo = new THREE.BoxGeometry(shoulderWidth, 0.5, staticLen);
    this.geometries.push(shoulderGeo);
    const shoulderX = roadWidth / 2 + shoulderWidth / 2;
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(shoulderGeo, this.shoulderMat);
      // Top slightly below the road surface to avoid z-fighting at the seam.
      shoulder.position.set(side * shoulderX, -0.26, staticCenterZ);
      this.scene.add(shoulder);
    }
    const curbGeo = new THREE.BoxGeometry(0.12, 0.06, staticLen);
    this.geometries.push(curbGeo);
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(curbGeo, this.curbMat);
      curb.position.set(side * (roadWidth / 2 + 0.06), 0.02, staticCenterZ);
      this.scene.add(curb);
    }
  }

  /** Instant theme apply (menu select). Gradual gateway lerps come later. */
  applyTheme(theme: EnvironmentTheme): void {
    this.currentThemeId = theme.id;
    this.bgColor.setHex(theme.sky);
    this.scene.background = this.bgColor;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(theme.fogColor);
      this.scene.fog.near = theme.fogNear;
      this.scene.fog.far = theme.fogFar;
    } else {
      this.scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar);
    }
    this.roadMatA.color.setHex(theme.ground);
    this.roadMatB.color.setHex(theme.groundAlt);
    this.shoulderMat.color.setHex(theme.shoulder);
    this.dashMat.color.setHex(theme.laneLine);
    this.curbMat.color.setHex(theme.laneLine);
    this.hemiLight.groundColor.setHex(theme.shoulder);
  }

  setThemeById(id: string): void {
    const theme = ENVIRONMENTS[id];
    if (theme) this.applyTheme(theme);
  }

  /** Scrolls the world toward the camera; recycles slabs behind it. */
  update(dt: number, speed: number): void {
    const move = speed * dt;
    const segLen = Config.track.segmentLength;
    for (let i = 0; i < this.segments.length; i++) {
      const g = this.segments[i].group;
      g.position.z += move;
      if (g.position.z - segLen / 2 > this.recycleZ) {
        g.position.z -= this.totalLength;
      }
    }
  }

  dispose(): void {
    for (const geo of this.geometries) geo.dispose();
    this.geometries.length = 0;
    this.roadMatA.dispose();
    this.roadMatB.dispose();
    this.shoulderMat.dispose();
    this.dashMat.dispose();
    this.curbMat.dispose();
  }
}

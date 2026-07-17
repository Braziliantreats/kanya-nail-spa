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

interface PropSet {
  mesh: THREE.InstancedMesh;
  xs: Float32Array;
  zs: Float32Array;
  span: number;
}

const PROP_M4 = new THREE.Matrix4();
const PROP_POS = new THREE.Vector3();
const PROP_QUAT = new THREE.Quaternion();
const PROP_SCL = new THREE.Vector3(1, 1, 1);
const LERP_A = new THREE.Color();
const LERP_B = new THREE.Color();

export class EnvironmentSystem {
  private segments: TrackSegment[] = [];
  private totalLength = 0;
  private recycleZ = 0;

  // --- Gateway transitions (spec §9: every 1,000m, arch + fog lerp) ---
  private fromTheme: EnvironmentTheme | null = null;
  private toTheme: EnvironmentTheme | null = null;
  private blendT = 1; // 1 = settled
  private pendingThemeId: string | null = null;
  private arch!: THREE.Group;
  private archActive = false;
  /** Fires when a transition settles (Game syncs ambient particles/music). */
  onThemeChanged: ((theme: EnvironmentTheme) => void) | null = null;

  private propSets = new Map<string, PropSet>();
  private activePropSet: PropSet | null = null;

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

  /** Gradient sky dome — uniforms lerp during gateway transitions. */
  private skyUniforms = {
    topColor: { value: new THREE.Color(0x171240) },
    bottomColor: { value: new THREE.Color(0x5a37a8) },
    offsetY: { value: 8 },
    exponent: { value: 0.65 },
  };
  private skyMat: THREE.ShaderMaterial | null = null;

  private geometries: THREE.BufferGeometry[] = [];
  private currentThemeId = 'subway';
  /** Adaptive quality: scales fog far (draw distance) — spec §18. */
  private fogScale = 1;

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
    this.hemiLight = new THREE.HemisphereLight(0xa8c4ff, theme.shoulder, 1.25);
    this.dirLight = new THREE.DirectionalLight(0xfff2e0, 1.7);
    this.dirLight.position.set(4, 9, 3);
    this.dirLight.target.position.set(0, 0, -8);
    this.scene.add(this.hemiLight, this.dirLight, this.dirLight.target);

    this.buildSky();
    this.buildTrack(theme);
    this.buildArch();
    this.buildPropSets();
    this.applyTheme(theme);
  }

  /** Gradient sky dome (zenith → glowing horizon) — one draw call. */
  private buildSky(): void {
    const geo = new THREE.SphereGeometry(130, 24, 14);
    this.geometries.push(geo);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offsetY;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offsetY, 0.0)).y;
          float t = pow(max(h, 0.0), exponent);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }`,
    });
    const dome = new THREE.Mesh(geo, this.skyMat);
    dome.renderOrder = -1;
    this.scene.add(dome);
  }

  /** Gateway arch — glowing frame the player passes through at theme swaps. */
  private buildArch(): void {
    this.arch = new THREE.Group();
    const glow = this.materials.basic(0x9fe8ff).clone();
    const dark = this.materials.get(0x2b2350);
    const pillarGeo = new THREE.BoxGeometry(0.5, 4.6, 0.5);
    const beamGeo = new THREE.BoxGeometry(8.4, 0.55, 0.5);
    const stripGeo = new THREE.BoxGeometry(0.16, 4.6, 0.55);
    this.geometries.push(pillarGeo, beamGeo, stripGeo);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, dark);
      pillar.position.set(side * 3.95, 2.3, 0);
      const strip = new THREE.Mesh(stripGeo, glow);
      strip.position.set(side * 3.62, 2.3, 0);
      this.arch.add(pillar, strip);
    }
    const beam = new THREE.Mesh(beamGeo, dark);
    beam.position.y = 4.85;
    const beamStrip = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.14, 0.55), glow);
    this.geometries.push(beamStrip.geometry);
    beamStrip.position.y = 4.5;
    this.arch.add(beam, beamStrip);
    this.arch.visible = false;
    this.scene.add(this.arch);
  }

  /** One merged-geometry InstancedMesh of side props per theme (1 draw call
   *  each; only the active theme's set is visible — spec §18). */
  private buildPropSets(): void {
    const count = 26;
    const spacing = 10.5;
    const span = (count / 2) * spacing;
    const roadHalf = (Config.lanes.width * Config.lanes.count) / 2;

    for (const id of Object.keys(ENVIRONMENTS)) {
      const theme = ENVIRONMENTS[id];
      const geo = this.buildPropGeometry(theme.propSet);
      this.geometries.push(geo);
      const mat = this.materials.get(theme.accents[2]).clone();
      mat.color.lerp(LERP_B.setHex(0x2b2350), 0.55); // muted silhouette
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.visible = false;
      const xs = new Float32Array(count);
      const zs = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        xs[i] = side * (roadHalf + Config.track.shoulderWidth + 0.8 + Math.random() * 1.6);
        zs[i] = 15 - Math.floor(i / 2) * spacing - (i % 2) * spacing * 0.5;
      }
      this.scene.add(mesh);
      this.propSets.set(id, { mesh, xs, zs, span });
    }
  }

  private buildPropGeometry(set: EnvironmentTheme['propSet']): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    switch (set) {
      case 'subway': {
        // Tunnel light columns.
        const pillar = new THREE.BoxGeometry(0.24, 3.8, 0.24);
        pillar.translate(0, 1.9, 0);
        const lamp = new THREE.BoxGeometry(0.42, 0.22, 0.42);
        lamp.translate(0, 3.9, 0);
        parts.push(pillar, lamp);
        break;
      }
      case 'rooftops': {
        // AC units.
        const unit = new THREE.BoxGeometry(1.1, 0.8, 0.9);
        unit.translate(0, 0.4, 0);
        const vent = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        vent.translate(0.2, 1.0, 0);
        parts.push(unit, vent);
        break;
      }
      case 'forest': {
        // Stylized pines (cones — abstract geometry, no leaf imagery).
        const canopy = new THREE.ConeGeometry(0.85, 2.4, 7);
        canopy.translate(0, 2.1, 0);
        const trunk = new THREE.CylinderGeometry(0.14, 0.18, 1.0, 6);
        trunk.translate(0, 0.5, 0);
        parts.push(canopy, trunk);
        break;
      }
      case 'stadium': {
        // Flag posts.
        const pole = new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6);
        pole.translate(0, 1.6, 0);
        const flag = new THREE.BoxGeometry(0.62, 0.36, 0.05);
        flag.translate(0.36, 2.9, 0);
        parts.push(pole, flag);
        break;
      }
      case 'space': {
        // Antenna pylons.
        const mast = new THREE.BoxGeometry(0.2, 3.0, 0.2);
        mast.translate(0, 1.5, 0);
        const node = new THREE.SphereGeometry(0.26, 8, 6);
        node.translate(0, 3.15, 0);
        parts.push(mast, node);
        break;
      }
    }
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return merged;
  }

  private setActivePropSet(id: string): void {
    if (this.activePropSet) this.activePropSet.mesh.visible = false;
    const set = this.propSets.get(id) ?? null;
    this.activePropSet = set;
    if (set) set.mesh.visible = true;
  }

  /** Queues a theme change: shows the gateway arch ahead; the palette lerp
   *  starts when the player passes through it. */
  scheduleGateway(themeId: string): void {
    if (!ENVIRONMENTS[themeId] || this.archActive) return;
    this.pendingThemeId = themeId;
    this.arch.position.z = -72;
    this.arch.visible = true;
    this.archActive = true;
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

  /** Instant theme apply (boot / menu select / transition settle). */
  applyTheme(theme: EnvironmentTheme): void {
    this.currentThemeId = theme.id;
    this.fromTheme = null;
    this.toTheme = null;
    this.blendT = 1;
    this.bgColor.setHex(theme.sky);
    this.scene.background = this.skyMat ? null : this.bgColor; // dome covers the bg
    this.skyUniforms.topColor.value.setHex(theme.skyTop);
    this.skyUniforms.bottomColor.value.setHex(theme.skyBottom);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(theme.fogColor);
      this.scene.fog.near = theme.fogNear;
      this.scene.fog.far = theme.fogFar * this.fogScale;
    } else {
      this.scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar * this.fogScale);
    }
    this.roadMatA.color.setHex(theme.ground);
    this.roadMatB.color.setHex(theme.groundAlt);
    this.shoulderMat.color.setHex(theme.shoulder);
    this.dashMat.color.setHex(theme.laneLine);
    this.curbMat.color.setHex(theme.laneLine);
    this.hemiLight.groundColor.setHex(theme.shoulder);
    this.setActivePropSet(theme.id);
  }

  /** Lerp helper: from → to at t, into a target material/color slot. */
  private lerpHex(from: number, to: number, t: number, into: THREE.Color): void {
    LERP_A.setHex(from);
    LERP_B.setHex(to);
    into.copy(LERP_A).lerp(LERP_B, t);
  }

  private updateTransition(move: number): void {
    if (!this.fromTheme || !this.toTheme) return;
    this.blendT = Math.min(this.blendT + move / Config.environment.transitionM, 1);
    const a = this.fromTheme;
    const b = this.toTheme;
    const t = this.blendT;
    this.lerpHex(a.sky, b.sky, t, this.bgColor);
    this.lerpHex(a.skyTop, b.skyTop, t, this.skyUniforms.topColor.value);
    this.lerpHex(a.skyBottom, b.skyBottom, t, this.skyUniforms.bottomColor.value);
    if (this.scene.fog instanceof THREE.Fog) {
      this.lerpHex(a.fogColor, b.fogColor, t, this.scene.fog.color);
      this.scene.fog.near = a.fogNear + (b.fogNear - a.fogNear) * t;
      this.scene.fog.far = (a.fogFar + (b.fogFar - a.fogFar) * t) * this.fogScale;
    }
    this.lerpHex(a.ground, b.ground, t, this.roadMatA.color);
    this.lerpHex(a.groundAlt, b.groundAlt, t, this.roadMatB.color);
    this.lerpHex(a.shoulder, b.shoulder, t, this.shoulderMat.color);
    this.lerpHex(a.laneLine, b.laneLine, t, this.dashMat.color);
    this.lerpHex(a.laneLine, b.laneLine, t, this.curbMat.color);
    this.lerpHex(a.shoulder, b.shoulder, t, this.hemiLight.groundColor);
    if (t >= 1) {
      const settled = b;
      this.currentThemeId = settled.id;
      this.fromTheme = null;
      this.toTheme = null;
      this.onThemeChanged?.(settled);
    }
  }

  setThemeById(id: string): void {
    const theme = ENVIRONMENTS[id];
    if (theme) this.applyTheme(theme);
  }

  /** Adaptive-quality hook: pulls fog (and with it, effective draw distance). */
  setFogScale(scale: number): void {
    this.fogScale = scale;
    if (this.scene.fog instanceof THREE.Fog && !this.toTheme) {
      this.scene.fog.far = this.theme.fogFar * scale;
    }
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

    // Gateway arch scroll → begins the palette lerp as the player passes it.
    if (this.archActive) {
      this.arch.position.z += move;
      if (this.pendingThemeId && this.arch.position.z > -1) {
        this.fromTheme = ENVIRONMENTS[this.currentThemeId];
        this.toTheme = ENVIRONMENTS[this.pendingThemeId];
        this.blendT = 0;
        this.setActivePropSet(this.pendingThemeId); // new props emerge from fog
        this.pendingThemeId = null;
      }
      if (this.arch.position.z > 16) {
        this.arch.visible = false;
        this.archActive = false;
      }
    }
    this.updateTransition(move);

    // Side props scroll + recycle (single instanced mesh per theme).
    const set = this.activePropSet;
    if (set) {
      for (let i = 0; i < set.zs.length; i++) {
        set.zs[i] += move;
        if (set.zs[i] > 18) set.zs[i] -= set.span + 18 + 30;
        PROP_POS.set(set.xs[i], 0, set.zs[i]);
        PROP_M4.compose(PROP_POS, PROP_QUAT, PROP_SCL);
        set.mesh.setMatrixAt(i, PROP_M4);
      }
      set.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const geo of this.geometries) geo.dispose();
    this.geometries.length = 0;
    for (const set of this.propSets.values()) {
      (set.mesh.material as THREE.Material).dispose();
      set.mesh.dispose();
    }
    this.propSets.clear();
    this.skyMat?.dispose();
    this.roadMatA.dispose();
    this.roadMatB.dispose();
    this.shoulderMat.dispose();
    this.dashMat.dispose();
    this.curbMat.dispose();
  }
}

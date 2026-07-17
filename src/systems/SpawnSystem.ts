/**
 * SpawnSystem — pattern-chunk spawner with solver validation (spec §6).
 *
 * - Spawns authored chunks only; each candidate is re-validated against the
 *   solver at the CURRENT speed before being committed to the track.
 * - Reaction budget: chunks spawn far enough ahead that reveal-distance ÷
 *   speed ≥ 0.6s, growing with speed.
 * - Everything is pooled: obstacle visuals per archetype, obstacle state
 *   entries, and the instanced crystal field. Nothing is created or
 *   destroyed during play (spec §18).
 */

import type * as THREE from 'three';
import { Config } from '../core/Config';
import { ObjectPool } from '../core/ObjectPool';
import {
  FALLBACK_CHUNK,
  OBSTACLE_SPECS,
  PATTERN_CHUNKS,
  SET_RANK,
  type ObstacleType,
  type PatternChunk,
} from '../data/patterns';
import { CrystalField, TrackObjectFactory } from '../render/TrackObjects';
import type { ToonMaterialFactory } from '../render/ToonMaterialFactory';
import { isChunkSolvable } from './solver';

export interface ActiveObstacle {
  type: ObstacleType;
  visual: THREE.Group | null;
  /** Current visual lane-center x (movers animate this). */
  x: number;
  z: number;
  /** Mover collider freeze (Subway-Surfers static-hitbox trick, spec §6). */
  frozenX: number | null;
  // Collider (pre-shrunk — forgiving hitboxes, spec §6).
  halfX: number;
  halfY: number;
  halfZ: number;
  centerY: number;
  action: 'slide' | 'jump' | 'lane';
  // Mover animation state.
  moverFromX: number;
  moverToX: number;
  moverPhase: number;
  // Scoring bookkeeping (ScoreSystem).
  passed: boolean;
  nearMissAwarded: boolean;
}

const OBSTACLE_SHRINK = 0.9;
const MOVER_CROSS_SPEED = 1.1; // phase units per second (ping-pong)
const MOVER_FREEZE_Z = -2.4; // collider freezes once this close to the player

export class SpawnSystem {
  readonly crystals: CrystalField;
  readonly active: ActiveObstacle[] = [];

  private pools = new Map<ObstacleType, ObjectPool<THREE.Group>>();
  private entryPool: ActiveObstacle[] = [];
  private factory: TrackObjectFactory;
  private frontierZ = 0;
  private lastChunkId = '';

  constructor(
    private scene: THREE.Scene,
    materials: ToonMaterialFactory,
  ) {
    this.factory = new TrackObjectFactory(materials);
    this.crystals = new CrystalField(scene, materials);

    const poolSizes: Record<ObstacleType, number> = {
      low: 6,
      overhead: 8,
      hurdle: 8,
      full: 12,
      mover: 4,
      gap: 8,
    };
    for (const type of Object.keys(poolSizes) as ObstacleType[]) {
      this.pools.set(
        type,
        new ObjectPool<THREE.Group>(
          () => {
            const g = this.factory.build(type);
            this.scene.add(g);
            return g;
          },
          {
            initialSize: poolSizes[type],
            onAcquire: (g) => (g.visible = true),
            onRelease: (g) => (g.visible = false),
          },
        ),
      );
    }
    for (let i = 0; i < 48; i++) this.entryPool.push(this.makeEntry());
  }

  private makeEntry(): ActiveObstacle {
    return {
      type: 'hurdle',
      visual: null,
      x: 0,
      z: 0,
      frozenX: null,
      halfX: 0,
      halfY: 0,
      halfZ: 0,
      centerY: 0,
      action: 'jump',
      moverFromX: 0,
      moverToX: 0,
      moverPhase: 0,
      passed: false,
      nearMissAwarded: false,
    };
  }

  /** Clears the track. `runwayBonus` adds obstacle-free room (tutorial/revive). */
  reset(runwayBonus = 0): void {
    for (const entry of this.active) this.releaseEntry(entry);
    this.active.length = 0;
    this.crystals.releaseAll();
    this.frontierZ = -(Config.spawn.minAheadUnits + runwayBonus);
    this.lastChunkId = '';
  }

  /** Post-revive breather: wipe obstacles near/behind + ahead spawn-free window. */
  clearStretch(aheadUnits: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.z > -aheadUnits) {
        this.releaseEntry(e);
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }
    if (this.frontierZ > -aheadUnits) this.frontierZ = -aheadUnits;
  }

  update(dt: number, speed: number, tier: number): void {
    const move = speed * dt;
    const despawnZ = Config.spawn.despawnBehindUnits;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.z += move;

      if (e.type === 'mover') {
        // Ping-pong between lanes; collider freezes near contact so the
        // hitbox can't slide INTO the player at the last instant.
        e.moverPhase += dt * MOVER_CROSS_SPEED;
        const tri = 1 - Math.abs((e.moverPhase % 2) - 1); // 0→1→0 triangle
        e.x = e.moverFromX + (e.moverToX - e.moverFromX) * tri;
        if (e.z >= MOVER_FREEZE_Z && e.frozenX === null) e.frozenX = e.x;
      }

      if (e.visual) {
        e.visual.position.x = e.x;
        e.visual.position.z = e.z;
      }

      if (e.z - e.halfZ > despawnZ) {
        this.releaseEntry(e);
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }

    this.crystals.update(dt, move);
    this.frontierZ += move;
    this.ensureSpawned(speed, tier);
  }

  private ensureSpawned(speed: number, tier: number): void {
    // Reaction budget (spec §6): reveal distance must cover ≥0.6s at speed.
    const needAhead = Math.max(
      Config.spawn.minAheadUnits,
      speed * Config.spawn.reactionBudgetS + Config.spawn.aheadMarginUnits,
    );
    // Keep the track filled well past the reveal horizon.
    const fillDepth = needAhead + 45;
    while (this.frontierZ > -fillDepth) {
      this.spawnChunk(speed, tier);
    }
  }

  private spawnChunk(speed: number, tier: number): void {
    const tierCfg = Config.tiers[Math.min(tier, Config.tiers.length - 1)];
    const allowFastFall = tier >= 3;

    // Solver-validated selection: draw, validate at (slightly padded) current
    // speed, re-roll failures (spec §6). Falls back to a known-good chunk.
    let chunk: PatternChunk | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = this.drawCandidate(tier, allowFastFall);
      if (candidate.id === this.lastChunkId && attempt < 6) continue; // variety
      if (isChunkSolvable(candidate, { speed: speed * 1.1, allowFastFall })) {
        chunk = candidate;
        break;
      }
    }
    if (!chunk) chunk = FALLBACK_CHUNK;
    this.lastChunkId = chunk.id;

    const entryZ = this.frontierZ;
    for (const ob of chunk.obstacles) this.placeObstacle(ob.type, ob.lane, ob.toLane, entryZ - ob.z);
    for (const line of chunk.crystals) this.placeCrystals(line, entryZ);

    const [gapMin, gapMax] = tierCfg.spawnGapRange;
    const gap = gapMin + Math.random() * (gapMax - gapMin);
    this.frontierZ = entryZ - chunk.length - gap;
  }

  private drawCandidate(tier: number, allowFastFall: boolean): PatternChunk {
    const pool = PATTERN_CHUNKS.filter(
      (c) => SET_RANK[c.set] <= tier && (!c.requiresAirControl || allowFastFall),
    );
    return pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_CHUNK;
  }

  private placeObstacle(
    type: ObstacleType,
    lane: number,
    toLane: number | undefined,
    z: number,
  ): void {
    const spec = OBSTACLE_SPECS[type];
    const entry = this.entryPool.pop() ?? this.makeEntry();
    const laneW = Config.lanes.width;

    entry.type = type;
    entry.x = lane * laneW;
    entry.z = z;
    entry.frozenX = null;
    entry.halfX = spec.halfX * OBSTACLE_SHRINK;
    entry.halfY = spec.halfY * OBSTACLE_SHRINK;
    entry.halfZ = spec.halfZ * (type === 'gap' ? 1 : OBSTACLE_SHRINK);
    entry.centerY = spec.centerY;
    entry.action = spec.action;
    entry.moverFromX = lane * laneW;
    entry.moverToX = (toLane ?? lane) * laneW;
    entry.moverPhase = Math.random() < 0.5 ? 0 : 1; // vary start direction
    entry.passed = false;
    entry.nearMissAwarded = false;

    entry.visual = this.pools.get(type)!.acquire();
    entry.visual.position.set(entry.x, 0, entry.z);

    this.active.push(entry);
  }

  private placeCrystals(
    line: { lane: number; z: number; count: number; arc?: boolean },
    entryZ: number,
  ): void {
    const laneW = Config.lanes.width;
    const spacing = 1.15;
    const apex = Config.jump.apexHeight;
    for (let i = 0; i < line.count; i++) {
      const t = line.count > 1 ? i / (line.count - 1) : 0.5;
      // Arcs trace the jump parabola over an obstacle; flat lines hover low.
      const y = line.arc ? 0.55 + apex * 0.82 * Math.sin(Math.PI * t) : 0.55;
      this.crystals.spawn(line.lane * laneW, y, entryZ - line.z - i * spacing);
    }
  }

  private releaseEntry(entry: ActiveObstacle): void {
    if (entry.visual) {
      this.pools.get(entry.type)!.release(entry.visual);
      entry.visual = null;
    }
    this.entryPool.push(entry);
  }

  /** Debug overlay line (spec §18: pooled object counts). */
  statsLine(): string {
    let free = 0;
    let created = 0;
    for (const pool of this.pools.values()) {
      const s = pool.stats;
      free += s.free;
      created += s.created;
    }
    return `obstacles  ${this.active.length} active / ${created} pooled (${free} free)\ncrystals   ${this.crystals.activeCount} active`;
  }

  dispose(): void {
    this.crystals.dispose();
    this.factory.dispose();
  }
}

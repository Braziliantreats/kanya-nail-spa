/**
 * patterns.ts — authored obstacle pattern chunks (spec §6).
 *
 * Spawning uses hand-tuned templates, NOT per-object randomness. Every chunk
 * is validated by the solver (systems/solver.ts) before being committed to
 * the track; the test suite additionally asserts 10,000 spawns at max speed
 * are 100% solvable.
 *
 * Chunk coordinates: z is the distance from the chunk's entry edge, growing
 * INTO the chunk (the spawner maps it onto world -z ahead of the player).
 * First obstacle in every chunk sits at z ≥ 10 so entry actions never
 * overlap the previous chunk's tail.
 */

export type ObstacleType = 'low' | 'overhead' | 'hurdle' | 'full' | 'mover' | 'gap';
export type PatternSet = 'basic' | 'easy' | 'medium' | 'hard';

export interface ObstacleSpec {
  halfX: number;
  halfY: number;
  halfZ: number;
  centerY: number;
  /** The action class that clears it (drives solver + telegraph icons). */
  action: 'slide' | 'jump' | 'lane';
}

/**
 * Collider geometry per archetype (units). Tuned against the player collider
 * (1.0 × 1.8 × 0.8, ×0.85 shrink; slide halves height):
 *  - 'low'/'overhead' bottoms sit high enough that a clean slide clears with
 *    > 0.35 margin (so near-misses come from LATE slides, not every slide),
 *    yet low enough that standing or jumping players clip them.
 *  - 'hurdle' tops sit low enough that a reasonable jump clears.
 */
export const OBSTACLE_SPECS: Record<ObstacleType, ObstacleSpec> = {
  low: { halfX: 0.95, halfY: 0.675, halfZ: 0.18, centerY: 1.925, action: 'slide' },
  overhead: { halfX: 0.95, halfY: 1.0, halfZ: 0.22, centerY: 2.3, action: 'slide' },
  hurdle: { halfX: 0.9, halfY: 0.36, halfZ: 0.25, centerY: 0.36, action: 'jump' },
  full: { halfX: 0.925, halfY: 1.7, halfZ: 0.3, centerY: 1.7, action: 'lane' },
  mover: { halfX: 0.8, halfY: 0.8, halfZ: 0.5, centerY: 0.8, action: 'lane' },
  gap: { halfX: 0.95, halfY: 0.05, halfZ: 1.2, centerY: 0, action: 'jump' },
};

export type Lane = -1 | 0 | 1;

export interface PatternObstacle {
  type: ObstacleType;
  lane: Lane;
  z: number;
  /** Movers ping-pong between `lane` and `toLane`. */
  toLane?: Lane;
}

export interface PatternCrystals {
  lane: Lane;
  z: number;
  count: number;
  /** Arc the line over a jump obstacle (y follows the jump parabola). */
  arc?: boolean;
}

export interface PatternChunk {
  id: string;
  set: PatternSet;
  length: number;
  /** Solvable only with the fast-fall skill move — gated to tier 3 (spec §5). */
  requiresAirControl?: boolean;
  obstacles: PatternObstacle[];
  crystals: PatternCrystals[];
}

export const SET_RANK: Record<PatternSet, number> = { basic: 0, easy: 1, medium: 2, hard: 3 };

/** Coin lines trace the safe path through each pattern (breadcrumbs, §6). */
export const PATTERN_CHUNKS: PatternChunk[] = [
  // ---------- basic (tier 0 — single obstacles, generous spacing) ----------
  {
    id: 'b1-hurdle-center',
    set: 'basic',
    length: 30,
    obstacles: [{ type: 'hurdle', lane: 0, z: 16 }],
    crystals: [
      { lane: 0, z: 8, count: 4 },
      { lane: 0, z: 13.8, count: 5, arc: true },
      { lane: 0, z: 22, count: 3 },
    ],
  },
  {
    id: 'b2-low-center',
    set: 'basic',
    length: 30,
    obstacles: [{ type: 'low', lane: 0, z: 16 }],
    crystals: [
      { lane: 0, z: 9, count: 4 },
      { lane: 0, z: 19, count: 4 },
    ],
  },
  {
    id: 'b3-full-center',
    set: 'basic',
    length: 30,
    obstacles: [{ type: 'full', lane: 0, z: 16 }],
    crystals: [
      { lane: -1, z: 12, count: 6 },
    ],
  },
  {
    id: 'b4-gap-center',
    set: 'basic',
    length: 32,
    obstacles: [{ type: 'gap', lane: 0, z: 16 }],
    crystals: [
      { lane: 0, z: 13.5, count: 5, arc: true },
      { lane: 1, z: 22, count: 3 },
    ],
  },
  // ---------- easy (tier 1 — simple combos) ----------
  {
    id: 'e1-jump-left-block-center',
    set: 'easy',
    length: 42,
    obstacles: [
      { type: 'hurdle', lane: -1, z: 14 },
      { type: 'full', lane: 0, z: 14 },
      { type: 'low', lane: 1, z: 30 },
    ],
    crystals: [
      { lane: -1, z: 11.8, count: 5, arc: true },
      { lane: -1, z: 20, count: 3 },
      { lane: 1, z: 33.5, count: 3 },
    ],
  },
  {
    id: 'e2-corridor-hurdle',
    set: 'easy',
    length: 44,
    obstacles: [
      { type: 'full', lane: -1, z: 16 },
      { type: 'full', lane: 1, z: 16 },
      { type: 'hurdle', lane: 0, z: 32 },
    ],
    crystals: [
      { lane: 0, z: 10, count: 5 },
      { lane: 0, z: 29.8, count: 5, arc: true },
    ],
  },
  {
    id: 'e3-overhead-wall',
    set: 'easy',
    length: 34,
    obstacles: [
      { type: 'overhead', lane: -1, z: 18 },
      { type: 'overhead', lane: 0, z: 18 },
      { type: 'overhead', lane: 1, z: 18 },
    ],
    crystals: [
      { lane: 0, z: 10, count: 4 },
      { lane: 0, z: 21, count: 4 },
    ],
  },
  {
    id: 'e4-mover-then-hurdle',
    set: 'easy',
    length: 46,
    obstacles: [
      { type: 'mover', lane: -1, z: 20, toLane: 1 },
      { type: 'hurdle', lane: 0, z: 36 },
    ],
    crystals: [
      { lane: 0, z: 12, count: 4 },
      { lane: 0, z: 33.8, count: 5, arc: true },
    ],
  },
  {
    id: 'e5-double-gap-right-free',
    set: 'easy',
    length: 36,
    obstacles: [
      { type: 'gap', lane: -1, z: 16 },
      { type: 'gap', lane: 0, z: 16 },
    ],
    crystals: [
      { lane: 1, z: 10, count: 7 },
    ],
  },
  // ---------- medium (tier 2 — denser, movers, forks) ----------
  {
    id: 'm1-fork-jump-or-slide',
    set: 'medium',
    length: 38,
    obstacles: [
      { type: 'full', lane: 0, z: 12 },
      { type: 'hurdle', lane: -1, z: 24 },
      { type: 'low', lane: 1, z: 24 },
    ],
    crystals: [
      { lane: -1, z: 16, count: 3 },
      { lane: -1, z: 21.8, count: 5, arc: true },
    ],
  },
  {
    id: 'm2-slalom',
    set: 'medium',
    length: 48,
    obstacles: [
      { type: 'full', lane: -1, z: 12 },
      { type: 'full', lane: 1, z: 24 },
      { type: 'full', lane: -1, z: 36 },
    ],
    crystals: [
      { lane: 0, z: 8, count: 4 },
      { lane: 0, z: 20, count: 4 },
      { lane: 0, z: 32, count: 4 },
    ],
  },
  {
    id: 'm3-gaps-then-overhead',
    set: 'medium',
    length: 44,
    obstacles: [
      { type: 'gap', lane: 0, z: 16 },
      { type: 'gap', lane: 1, z: 16 },
      { type: 'overhead', lane: -1, z: 32 },
    ],
    crystals: [
      { lane: -1, z: 10, count: 5 },
      { lane: -1, z: 35, count: 3 },
    ],
  },
  {
    id: 'm4-mover-fork',
    set: 'medium',
    length: 44,
    obstacles: [
      { type: 'mover', lane: 1, z: 18, toLane: -1 },
      { type: 'full', lane: 1, z: 30 },
      { type: 'hurdle', lane: 0, z: 30 },
    ],
    crystals: [
      { lane: 0, z: 10, count: 4 },
      { lane: 0, z: 27.8, count: 5, arc: true },
    ],
  },
  {
    id: 'm5-gap-stagger',
    set: 'medium',
    length: 50,
    obstacles: [
      { type: 'gap', lane: -1, z: 14 },
      { type: 'gap', lane: 1, z: 26 },
      { type: 'hurdle', lane: 0, z: 40 },
    ],
    crystals: [
      { lane: 0, z: 8, count: 5 },
      { lane: 0, z: 37.8, count: 5, arc: true },
    ],
  },
  // ---------- hard (tier 3 — weaves + air-control gating) ----------
  {
    id: 'h1-aircontrol-corridor',
    set: 'hard',
    length: 40,
    requiresAirControl: true,
    obstacles: [
      { type: 'full', lane: -1, z: 12 },
      { type: 'full', lane: 1, z: 12 },
      { type: 'hurdle', lane: 0, z: 14 },
      { type: 'full', lane: -1, z: 28 },
      { type: 'full', lane: 1, z: 28 },
      { type: 'overhead', lane: 0, z: 28 },
    ],
    crystals: [
      { lane: 0, z: 8, count: 3 },
      { lane: 0, z: 11.8, count: 5, arc: true },
      { lane: 0, z: 31, count: 3 },
    ],
  },
  {
    id: 'h2-weave-gap-fork',
    set: 'hard',
    length: 46,
    obstacles: [
      { type: 'full', lane: 0, z: 10 },
      { type: 'gap', lane: -1, z: 20 },
      { type: 'low', lane: 1, z: 20 },
      { type: 'full', lane: -1, z: 34 },
      { type: 'hurdle', lane: 0, z: 34 },
    ],
    crystals: [
      { lane: 1, z: 13, count: 3 },
      { lane: 1, z: 24, count: 4 },
      { lane: 1, z: 37, count: 3 },
    ],
  },
  {
    id: 'h3-double-mover-weave',
    set: 'hard',
    length: 44,
    obstacles: [
      { type: 'mover', lane: -1, z: 14, toLane: 1 },
      { type: 'full', lane: 0, z: 22 },
      { type: 'mover', lane: 1, z: 30, toLane: -1 },
    ],
    crystals: [
      { lane: 0, z: 8, count: 3 },
      { lane: -1, z: 18, count: 3 },
      { lane: 0, z: 34, count: 4 },
    ],
  },
  {
    id: 'h4-aircontrol-gap-hurdle',
    set: 'hard',
    length: 40,
    requiresAirControl: true,
    obstacles: [
      { type: 'full', lane: -1, z: 12 },
      { type: 'full', lane: 1, z: 12 },
      { type: 'gap', lane: 0, z: 12 },
      { type: 'full', lane: -1, z: 26 },
      { type: 'full', lane: 1, z: 26 },
      { type: 'hurdle', lane: 0, z: 26 },
    ],
    crystals: [
      { lane: 0, z: 9.5, count: 5, arc: true },
      { lane: 0, z: 23.8, count: 5, arc: true },
      { lane: 0, z: 31, count: 3 },
    ],
  },
];

/** Known-trivially-solvable fallback if every solver draw somehow fails. */
export const FALLBACK_CHUNK: PatternChunk = PATTERN_CHUNKS[0];

/**
 * Pattern solvability — spec §20 acceptance #4:
 * "generate 10,000 pattern chunks at max spawn speed and assert every one
 *  has a valid solution — must pass 100%."
 */
import { describe, expect, it } from 'vitest';
import { Config } from '../src/core/Config';
import { FALLBACK_CHUNK, PATTERN_CHUNKS, SET_RANK } from '../src/data/patterns';
import { isChunkSolvable } from '../src/systems/solver';

/** Mirrors SpawnSystem's tier-eligibility rule. */
function eligible(tier: number, allowFastFall: boolean) {
  return PATTERN_CHUNKS.filter(
    (c) => SET_RANK[c.set] <= tier && (!c.requiresAirControl || allowFastFall),
  );
}

describe('pattern solvability', () => {
  it('every non-air-control chunk is solvable across the whole speed range', () => {
    const speeds = [Config.run.baseSpeed, 10, 13, 17, 20, Config.run.maxSpeed];
    for (const chunk of PATTERN_CHUNKS.filter((c) => !c.requiresAirControl)) {
      for (const speed of speeds) {
        expect(
          isChunkSolvable(chunk, { speed, allowFastFall: false }),
          `${chunk.id} @ ${speed} u/s (no fast-fall)`,
        ).toBe(true);
      }
    }
  });

  it('air-control chunks are solvable WITH fast-fall at tier-3 speeds', () => {
    for (const chunk of PATTERN_CHUNKS.filter((c) => c.requiresAirControl)) {
      for (const speed of [17, 20, Config.run.maxSpeed]) {
        expect(
          isChunkSolvable(chunk, { speed, allowFastFall: true }),
          `${chunk.id} @ ${speed} u/s (fast-fall)`,
        ).toBe(true);
      }
    }
  });

  it('air-control chunks genuinely REQUIRE fast-fall at max speed (gating is real)', () => {
    for (const chunk of PATTERN_CHUNKS.filter((c) => c.requiresAirControl)) {
      expect(
        isChunkSolvable(chunk, { speed: Config.run.maxSpeed, allowFastFall: false }),
        `${chunk.id} should be unsolvable without air control at max speed`,
      ).toBe(false);
    }
  });

  it('10,000 random draws at max speed are 100% solvable (spec §20-4)', () => {
    const pool = eligible(3, true);
    expect(pool.length).toBe(PATTERN_CHUNKS.length);
    let solved = 0;
    // Deterministic LCG so the sweep is reproducible.
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 10_000; i++) {
      const chunk = pool[Math.floor(rand() * pool.length)];
      if (isChunkSolvable(chunk, { speed: Config.run.maxSpeed, allowFastFall: true })) solved++;
    }
    expect(solved).toBe(10_000);
  });

  it('an impossible chunk is rejected (solver is not a rubber stamp)', () => {
    expect(
      isChunkSolvable(
        {
          id: 'impossible-wall',
          set: 'hard',
          length: 30,
          obstacles: [
            { type: 'full', lane: -1, z: 15 },
            { type: 'full', lane: 0, z: 15 },
            { type: 'full', lane: 1, z: 15 },
          ],
          crystals: [],
        },
        { speed: 10, allowFastFall: true },
      ),
    ).toBe(false);

    // Two vertical actions packed too close for the recovery window.
    expect(
      isChunkSolvable(
        {
          id: 'impossible-chained-verticals',
          set: 'hard',
          length: 30,
          obstacles: [
            { type: 'full', lane: -1, z: 14 },
            { type: 'full', lane: 1, z: 14 },
            { type: 'hurdle', lane: 0, z: 14 },
            { type: 'full', lane: -1, z: 17 },
            { type: 'full', lane: 1, z: 17 },
            { type: 'low', lane: 0, z: 17 },
          ],
          crystals: [],
        },
        { speed: Config.run.maxSpeed, allowFastFall: true },
      ),
    ).toBe(false);
  });

  it('fallback chunk is solvable everywhere', () => {
    for (const speed of [8, 15, 22]) {
      expect(isChunkSolvable(FALLBACK_CHUNK, { speed, allowFastFall: false })).toBe(true);
    }
  });
});

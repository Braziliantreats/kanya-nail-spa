/**
 * solver.ts — fair-generation solvability validation (spec §6).
 *
 * Before a chunk is committed to the track, this simulates whether a player
 * with the current reaction/action budget can survive it FROM ANY ENTRY LANE:
 *
 *  - Lane changes cost (tween duration + margin) × speed distance each.
 *  - Jump/slide occupy the vertical channel for their real durations
 *    (converted to track distance at the given speed).
 *  - `allowFastFall` (tier 3+) shortens jump occupancy — patterns tagged
 *    `requiresAirControl` are only solvable with it, which is exactly how
 *    they stay gated to high tiers.
 *
 * Pure logic: no three.js/DOM — unit-tested with a 10,000-chunk sweep.
 */

import { Config } from '../core/Config';
import { OBSTACLE_SPECS, type ObstacleType, type PatternChunk } from '../data/patterns';

export interface SolveParams {
  speed: number;
  allowFastFall: boolean;
}

/** Margins (seconds) — deliberately conservative so "solvable" means "fair". */
const LANE_SHIFT_MARGIN_S = 0.06;
const ACTION_LEAD_S = 0.12; // a jump/slide starts this long before the obstacle
const JUMP_OCCUPY_FACTOR = 1.05; // full airtime + landing recovery
const JUMP_OCCUPY_FACTOR_FASTFALL = 0.66; // slam shortens the arc
const SLIDE_MARGIN_S = 0.05;

export function isChunkSolvable(chunk: PatternChunk, params: SolveParams): boolean {
  const { speed, allowFastFall } = params;
  const laneShiftDist = (Config.laneChange.durationMs / 1000 + LANE_SHIFT_MARGIN_S) * speed;
  const leadDist = ACTION_LEAD_S * speed;
  const jumpDist =
    (Config.jump.airtimeMs / 1000) *
    (allowFastFall ? JUMP_OCCUPY_FACTOR_FASTFALL : JUMP_OCCUPY_FACTOR) *
    speed;
  const slideDist = (Config.slide.durationMs / 1000 + SLIDE_MARGIN_S) * speed;

  // Group obstacles into events by z; movers block BOTH endpoints of their
  // ping-pong path (conservative — timing them is a bonus, never required).
  const events = new Map<number, Map<number, ObstacleType>>();
  for (const ob of chunk.obstacles) {
    const key = Math.round(ob.z * 10) / 10;
    let lanes = events.get(key);
    if (!lanes) {
      lanes = new Map();
      events.set(key, lanes);
    }
    lanes.set(ob.lane, ob.type);
    if (ob.type === 'mover' && ob.toLane !== undefined) {
      lanes.set(ob.toLane, 'mover');
    }
  }

  const sortedZ = [...events.keys()].sort((a, b) => a - b);

  // State: lane → earliest track-position at which the vertical channel is
  // free again. Dominance: for the same lane keep the smallest recover value.
  let states = new Map<number, number>([
    [-1, 0],
    [0, 0],
    [1, 0],
  ]);
  let prevZ = 0;
  let first = true;

  for (const z of sortedZ) {
    const lanes = events.get(z)!;
    // Lane shifts available since the previous event. The first event also
    // gets the inter-chunk spawn gap as approach room (+1 shift).
    const shifts = Math.floor((z - prevZ) / laneShiftDist) + (first ? 1 : 0);

    const next = new Map<number, number>();
    for (const [fromLane, recover] of states) {
      for (let toLane = -1; toLane <= 1; toLane++) {
        if (Math.abs(toLane - fromLane) > shifts) continue;
        const occ = lanes.get(toLane);
        let newRecover = recover;
        if (occ !== undefined) {
          const spec = OBSTACLE_SPECS[occ];
          if (spec.action === 'lane') continue; // impassable — dodge only
          if (recover > z - leadDist) continue; // vertical channel still busy
          const occupy = spec.action === 'jump' ? jumpDist : slideDist;
          newRecover = z - leadDist + occupy;
        }
        const existing = next.get(toLane);
        if (existing === undefined || newRecover < existing) {
          next.set(toLane, newRecover);
        }
      }
    }

    if (next.size === 0) return false; // no surviving line through this event
    states = next;
    prevZ = z;
    first = false;
  }

  return true;
}

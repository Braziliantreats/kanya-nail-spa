/**
 * CollisionSystem — per-frame AABB tests with broad-phase z-cull (spec §6).
 *
 * - Broad phase: only obstacles within ±Config.collision.zWindowUnits of the
 *   player are tested (the active list is small; this keeps narrow-phase
 *   math off distant objects).
 * - Hitboxes are pre-shrunk on both sides (player ×0.85, obstacles ×0.9) —
 *   deliberately forgiving.
 * - 'gap' is a floor-absence check, not a box: grounded over the hole = fall.
 * - A shield provider (Glider crash-absorb / Zen invincibility / revive
 *   flicker — later phases) can veto the crash.
 */

import { Config } from '../core/Config';
import type { EventBus } from '../core/Events';
import type { MovementSystem } from './MovementSystem';
import type { SpawnSystem } from './SpawnSystem';

export class CollisionSystem {
  /** Returns true to absorb a would-be crash (powerup phase wires this). */
  shieldProvider: ((cause: string) => boolean) | null = null;

  constructor(private bus: EventBus) {}

  /** Returns true when a fatal crash happened this frame. */
  update(movement: MovementSystem, spawn: SpawnSystem, distance: number): boolean {
    const pc = movement.colliderCenter;
    const ph = movement.colliderHalf;
    const zWindow = Config.collision.zWindowUnits;

    for (const e of spawn.active) {
      if (e.z < -zWindow || e.z > zWindow) continue; // broad-phase cull
      const ox = e.frozenX ?? e.x;

      if (e.type === 'gap') {
        // Fall: grounded while substantially over the hole (edges forgiven).
        if (
          movement.grounded &&
          Math.abs(pc.x - ox) < e.halfX * 0.72 &&
          Math.abs(e.z) < e.halfZ * 0.82
        ) {
          return this.crash('gap', distance);
        }
        continue;
      }

      if (
        Math.abs(pc.x - ox) < ph.x + e.halfX &&
        Math.abs(pc.y - e.centerY) < ph.y + e.halfY &&
        Math.abs(e.z) < ph.z + e.halfZ
      ) {
        return this.crash(e.type, distance);
      }
    }
    return false;
  }

  private crash(cause: string, distance: number): boolean {
    if (this.shieldProvider?.(cause)) return false; // absorbed — not fatal
    this.bus.emit('player.crashed', { cause, distance });
    return true;
  }
}

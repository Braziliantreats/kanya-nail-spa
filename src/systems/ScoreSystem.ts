/**
 * ScoreSystem — scoring + near-miss detection (spec §5).
 *
 *   score = floor(distance) × DIST_MULT + crystals × COIN_VALUE + near-miss bonuses
 *
 * All gains flow through the DebouncedPointsEmitter to the RewardsBridge and
 * respect the Double-Up multiplier (provider injected by the power-up phase).
 *
 * Near-miss (spec §5): a pass with < 0.35u clearance on the axis that saved
 * you, OR a save action (slide/lane-change) started within ~130ms of
 * projected contact. Capped at 1 per obstacle. Framed celebratory ("CLOSE!"),
 * not gambling-like — COMPLIANCE note in the UI phase.
 */

import { Config } from '../core/Config';
import type { EventBus } from '../core/Events';
import type { DebouncedPointsEmitter } from '../integrations/RewardsBridge';
import type { RunState } from '../Game';
import type { MovementSystem } from './MovementSystem';
import type { ActiveObstacle, SpawnSystem } from './SpawnSystem';

export class ScoreSystem {
  /** Double-Up hook — replaced by the power-up system. */
  multiplierProvider: () => number = () => 1;

  private clockS = 0;
  private lastWholeMeter = 0;
  private streak = 0;
  private streakTimerS = 0;
  private lastSlideStartS = -99;
  private lastLaneChangeS = -99;

  constructor(
    private bus: EventBus,
    private points: DebouncedPointsEmitter,
  ) {
    bus.on('player.slide.started', () => (this.lastSlideStartS = this.clockS));
    bus.on('player.lane.changed', () => (this.lastLaneChangeS = this.clockS));
  }

  reset(): void {
    this.clockS = 0;
    this.lastWholeMeter = 0;
    this.streak = 0;
    this.streakTimerS = 0;
    this.lastSlideStartS = -99;
    this.lastLaneChangeS = -99;
  }

  update(dt: number, run: RunState, movement: MovementSystem, spawn: SpawnSystem): void {
    this.clockS += dt;

    // --- Distance points (whole meters, batched through the debouncer) ---
    const whole = Math.floor(run.distance);
    if (whole > this.lastWholeMeter) {
      const delta = (whole - this.lastWholeMeter) * Config.score.distMult;
      this.lastWholeMeter = whole;
      this.addScore(run, delta, 'distance');
    }

    // --- Crystal streak decay (pitch-rising chime window, spec §7) ---
    if (this.streakTimerS > 0) {
      this.streakTimerS -= dt;
      if (this.streakTimerS <= 0) this.streak = 0;
    }

    // --- Crystal pickup ---
    const pc = movement.colliderCenter;
    spawn.crystals.tryCollect(movement.visualX, pc.y, 0, 0.95, (x, y, z) => {
      run.coins += 1;
      this.streak += 1;
      this.streakTimerS = 2;
      this.addScore(run, Config.score.coinValue * this.multiplierProvider(), 'crystals');
      this.bus.emit('crystal.collected', { value: Config.score.coinValue, streak: this.streak, x, y, z });
    });

    // --- Near-miss detection at the moment of passing ---
    for (const e of spawn.active) {
      if (!e.passed && e.z - e.halfZ > 0.4) {
        e.passed = true;
        this.evaluateNearMiss(e, run, movement);
      }
    }
  }

  private evaluateNearMiss(e: ActiveObstacle, run: RunState, movement: MovementSystem): void {
    if (e.nearMissAwarded || e.type === 'gap') return; // gaps: no hover-close metric
    const pc = movement.colliderCenter;
    const ph = movement.colliderHalf;
    const ox = e.frozenX ?? e.x;

    // Clearance on whichever axis actually separated player from obstacle.
    const lateral = Math.abs(pc.x - ox) - (ph.x + e.halfX);
    let vertical = -1;
    if (e.action === 'jump') vertical = pc.y - ph.y - (e.centerY + e.halfY); // cleared above
    if (e.action === 'slide') vertical = e.centerY - e.halfY - (pc.y + ph.y); // ducked below

    let clearance = Number.POSITIVE_INFINITY;
    if (lateral > 0) clearance = Math.min(clearance, lateral);
    if (vertical > 0) clearance = Math.min(clearance, vertical);

    const geomClose = clearance < Config.nearMiss.gapUnits;
    const lateWindowS = Config.nearMiss.lateDodgeMs / 1000;
    const lateSlide = e.action === 'slide' && this.clockS - this.lastSlideStartS < lateWindowS;
    // Late dodge only counts when the player squeezed past laterally.
    const lateDodge =
      lateral > 0 && lateral < 1.0 && this.clockS - this.lastLaneChangeS < lateWindowS;

    if (geomClose || lateSlide || lateDodge) {
      e.nearMissAwarded = true;
      run.nearMisses += 1;
      this.addScore(run, Config.score.nearMissBonus * this.multiplierProvider(), 'nearmiss');
      this.bus.emit('nearmiss', { obstacleType: e.type, x: ox, y: e.centerY, z: e.z });
    }
  }

  private addScore(run: RunState, points: number, source: string): void {
    if (points <= 0) return;
    run.score += points;
    this.points.add(points, source);
    this.bus.emit('score.changed', { score: run.score, delta: points, source });
  }
}

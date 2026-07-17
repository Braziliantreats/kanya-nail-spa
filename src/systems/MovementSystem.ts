/**
 * MovementSystem — lanes, jump, slide, air-control fast-fall (spec §5).
 *
 * - Lane changes tween 180–200ms ease-out cubic (never teleport); the player
 *   cannot leave the 3-lane track.
 * - Jump physics derived from apex height + airtime, delta-time integrated.
 * - One vertical action at a time, except fast-fall while airborne.
 * - Consumes the InputSystem buffer; a jump buffered mid-air fires on landing.
 */

import { Config, computeJumpPhysics } from '../core/Config';
import { damp, easeOutCubic, lerp, Tween } from '../core/easing';
import type { EventBus } from '../core/Events';
import type { GameAction, InputSystem } from './InputSystem';

const EMPTY = {} as Record<string, never>;

export class MovementSystem {
  /** Logical (target) lane: -1, 0, +1. */
  laneIndex = 0;
  /** Visual x — follows the lane tween every frame. */
  visualX = 0;
  /** -1/0/+1 while a lane tween is active (camera roll cue). */
  laneChangeDir = 0;

  y = 0;
  private vy = 0;
  grounded = true;
  private fastFalling = false;

  /** Liftoff (spec §7): hover at a fixed height, ignore gravity. */
  flyMode = false;
  private flyTargetY = 0;
  /** Zen Mode floaty drift: scales gravity while airborne. */
  floatyGravityMult = 1;

  private sliding = false;
  private slideRemainS = 0;

  private gravity = 0;
  private jumpVelocity = 0;

  private laneTween = new Tween();

  // Reused collider scratch (zero per-frame allocation, spec §18).
  private colliderCenterV = { x: 0, y: 0, z: 0 };
  private colliderHalfV = { x: 0, y: 0, z: 0 };

  constructor(private bus: EventBus) {
    this.reset();
  }

  reset(): void {
    const { gravity, jumpVelocity } = computeJumpPhysics();
    this.gravity = gravity;
    this.jumpVelocity = jumpVelocity;
    this.laneIndex = 0;
    this.visualX = 0;
    this.laneChangeDir = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.fastFalling = false;
    this.sliding = false;
    this.slideRemainS = 0;
    this.flyMode = false;
    this.floatyGravityMult = 1;
    this.laneTween.finish();
    this.laneTween.value = 0;
  }

  /** Enter/exit Liftoff flight. Exiting drops the player back onto the arc. */
  setFly(active: boolean, height = 0): void {
    this.flyMode = active;
    if (active) {
      this.flyTargetY = height;
      this.grounded = false;
      this.vy = 0;
      if (this.sliding) {
        this.sliding = false;
        this.slideRemainS = 0;
        this.bus.emit('player.slide.ended', EMPTY);
      }
    } else {
      this.vy = 0;
      this.fastFalling = false;
    }
  }

  get airborne(): boolean {
    return !this.grounded;
  }

  get slideActive(): boolean {
    return this.sliding;
  }

  get verticalVelocity(): number {
    return this.vy;
  }

  update(dt: number, input: InputSystem): void {
    // --- Lane tween ---
    if (this.laneTween.active) {
      this.laneTween.update(dt);
      this.visualX = this.laneTween.value;
      if (!this.laneTween.active) this.laneChangeDir = 0;
    }

    // --- Vertical integration (delta-time, NOT frame-count — spec §5) ---
    if (this.flyMode) {
      // Liftoff hover: exponential ease toward flight height, no gravity.
      this.y = lerp(this.y, this.flyTargetY, damp(5, dt));
    } else if (!this.grounded) {
      const g =
        this.gravity *
        (this.fastFalling ? Config.jump.fastFallGravityMult : 1) *
        this.floatyGravityMult;
      // Velocity-Verlet step: exact parabolic trajectory for constant g, so
      // jump height/airtime are identical at 30fps and 60fps (spec §20-16).
      this.y += this.vy * dt - 0.5 * g * dt * dt;
      this.vy -= g * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.fastFalling = false;
        this.bus.emit('player.landed', EMPTY);
      }
    }

    // --- Slide timer ---
    if (this.sliding) {
      this.slideRemainS -= dt;
      if (this.slideRemainS <= 0) {
        this.sliding = false;
        this.bus.emit('player.slide.ended', EMPTY);
      }
    }

    // --- Buffered input (after physics so landing-frame jumps connect) ---
    input.drain(this.tryPerform);
  }

  private tryPerform = (action: GameAction): boolean => {
    switch (action) {
      case 'left':
        return this.changeLane(-1);
      case 'right':
        return this.changeLane(1);
      case 'up':
        return this.tryJump();
      case 'down':
        return this.tryDown();
    }
  };

  private changeLane(dir: -1 | 1): boolean {
    const target = this.laneIndex + dir;
    if (target < -1 || target > 1) {
      // Edge bump — consumed (buffering a wall-push feels sticky).
      return true;
    }
    const from = this.laneIndex;
    this.laneIndex = target;
    this.laneChangeDir = dir;
    // Retarget from the CURRENT visual x so double-taps chain smoothly.
    this.laneTween.start(
      this.visualX,
      target * Config.lanes.width,
      Config.laneChange.durationMs,
      easeOutCubic,
    );
    this.bus.emit('player.lane.changed', { from, to: target });
    return true;
  }

  private tryJump(): boolean {
    if (this.flyMode) return true; // flying — consume as no-op
    if (!this.grounded) return false; // keep buffered → fires on landing (queuing)
    if (this.sliding) {
      // Jump cancels slide (one vertical action at a time).
      this.sliding = false;
      this.slideRemainS = 0;
      this.bus.emit('player.slide.ended', EMPTY);
    }
    this.grounded = false;
    this.vy = this.jumpVelocity;
    this.fastFalling = false;
    this.bus.emit('player.jumped', { fromBuffer: false });
    return true;
  }

  private tryDown(): boolean {
    if (this.flyMode) return true; // flying — consume as no-op
    if (!this.grounded) {
      // Air-control fast-fall — the §5 skill move; allowed during any jump.
      if (!this.fastFalling) {
        this.fastFalling = true;
        if (this.vy > 0) this.vy = 0; // kill ascent so the slam reads instantly
        this.bus.emit('player.fastfall', EMPTY);
      }
      return true;
    }
    if (this.sliding) return true; // already sliding — consume as no-op
    this.sliding = true;
    this.slideRemainS = Config.slide.durationMs / 1000;
    this.bus.emit('player.slide.started', EMPTY);
    return true;
  }

  // ---- Collider (consumed by CollisionSystem in the spawning phase) ----

  get colliderCenter(): { x: number; y: number; z: number } {
    const h = this.colliderHeight;
    this.colliderCenterV.x = this.visualX;
    this.colliderCenterV.y = this.y + h / 2;
    this.colliderCenterV.z = 0;
    return this.colliderCenterV;
  }

  get colliderHalf(): { x: number; y: number; z: number } {
    const shrink = Config.collision.hitboxShrink;
    this.colliderHalfV.x = (Config.player.width / 2) * shrink;
    this.colliderHalfV.y = (this.colliderHeight / 2) * shrink;
    this.colliderHalfV.z = (Config.player.depth / 2) * shrink;
    return this.colliderHalfV;
  }

  private get colliderHeight(): number {
    // Slide shrinks the collider to 50% height (spec §5/§6).
    return Config.player.height * (this.sliding ? Config.slide.colliderScale : 1);
  }
}

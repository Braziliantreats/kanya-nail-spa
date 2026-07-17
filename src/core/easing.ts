/**
 * easing.ts — the spec-preferred "small internal easing helper" (§1).
 * No Tween.js dependency; a handful of easings plus a reusable, zero-alloc
 * Tween slot that systems own and retarget instead of allocating per use.
 */

export type EaseFn = (t: number) => number;

export const linear: EaseFn = (t) => t;
export const easeOutQuad: EaseFn = (t) => 1 - (1 - t) * (1 - t);
export const easeInCubic: EaseFn = (t) => t * t * t;
export const easeOutCubic: EaseFn = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: EaseFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack: EaseFn = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate-independent smoothing factor for exponential lerp-to-target. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * A reusable tween slot. Owners keep ONE instance and call start() to retarget
 * — no allocation inside the per-frame loop (spec §18).
 */
export class Tween {
  private from = 0;
  private to = 0;
  private durationS = 0;
  private elapsedS = 0;
  private ease: EaseFn = linear;
  active = false;
  value = 0;

  start(from: number, to: number, durationMs: number, ease: EaseFn = easeOutCubic): void {
    this.from = from;
    this.to = to;
    this.durationS = Math.max(durationMs, 1) / 1000;
    this.elapsedS = 0;
    this.ease = ease;
    this.active = true;
    this.value = from;
  }

  /** Advances the tween; returns true on the frame it completes. */
  update(dt: number): boolean {
    if (!this.active) return false;
    this.elapsedS += dt;
    const t = clamp(this.elapsedS / this.durationS, 0, 1);
    this.value = lerp(this.from, this.to, this.ease(t));
    if (t >= 1) {
      this.active = false;
      return true;
    }
    return false;
  }

  /** Jump straight to the end value and deactivate. */
  finish(): void {
    this.value = this.to;
    this.active = false;
  }
}

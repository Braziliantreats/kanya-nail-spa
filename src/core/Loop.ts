/**
 * Loop.ts — requestAnimationFrame loop with delta clamping (spec §18).
 * - Delta-time based, clamped at Config.loop.maxDeltaMs (tab-defocus spikes).
 * - Pauses the rAF loop entirely on `visibilitychange: hidden`.
 */

import { Config } from './Config';

export class Loop {
  private rafId = 0;
  private running = false;
  private lastTime = 0;

  constructor(
    private tick: (dt: number) => void,
    /** Called when the tab hides — Game uses it to auto-pause the run. */
    private onHidden?: () => void,
  ) {
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const maxDt = Config.loop.maxDeltaMs / 1000;
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt < 0) dt = 0;
    if (dt > maxDt) dt = maxDt;
    this.tick(dt);
    this.rafId = requestAnimationFrame(this.frame);
  };

  private handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      this.onHidden?.();
      this.stop();
    } else if (!this.running) {
      this.start();
    }
  };
}

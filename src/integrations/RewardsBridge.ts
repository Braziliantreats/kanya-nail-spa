/**
 * RewardsBridge — the ONE abstracted seam between gameplay and the
 * dispensary's rewards/loyalty backend (spec §3).
 *
 * The game NEVER implements conversion logic, accounts, or dispensary API
 * calls. It only emits events through this interface; the host injects a real
 * bridge at `Game.init({ rewardsBridge })`.
 */

export interface RunSummary {
  runId: string;
  /** Meters traveled this run. */
  distance: number;
  /** Crystals collected this run ("coins" in the bridge contract). */
  coins: number;
  score: number;
  /** Power-up id → times activated this run. */
  powerupsUsed: Record<string, number>;
  nearMisses: number;
  durationMs: number;
  /** What ended the run (obstacle type id, or 'quit'). */
  crashCause: string;
}

export interface PointsMeta {
  source: string;
  runId: string;
}

export interface RewardsBridge {
  onPointsEarned(delta: number, meta: PointsMeta): void;
  onRunComplete(summary: RunSummary): void;
  onMilestone(id: string, meta?: object): void;
  onSessionStart(meta: object): void;
}

/** Default for production embeds until the host injects a real bridge. */
export class NoopRewardsBridge implements RewardsBridge {
  onPointsEarned(): void {}
  onRunComplete(): void {}
  onMilestone(): void {}
  onSessionStart(): void {}
}

/** Dev-friendly bridge that logs every event so integrators can see the flow. */
export class ConsoleRewardsBridge implements RewardsBridge {
  onPointsEarned(delta: number, meta: PointsMeta): void {
    console.info(`[Rewards] +${delta} pts (source=${meta.source}, run=${meta.runId})`);
  }
  onRunComplete(summary: RunSummary): void {
    console.info('[Rewards] run complete', summary);
  }
  onMilestone(id: string, meta?: object): void {
    console.info(`[Rewards] milestone "${id}"`, meta ?? {});
  }
  onSessionStart(meta: object): void {
    console.info('[Rewards] session start', meta);
  }
}

/**
 * Batches onPointsEarned calls (spec §3: debounce ~500ms) so rapid crystal
 * pickups don't spam the host bridge. Driven by update(dt) from the game loop
 * — deterministic and unit-testable, no timers.
 */
export class DebouncedPointsEmitter {
  private pending = new Map<string, number>(); // source → accumulated delta
  private accumS = 0;
  private runId = '';

  constructor(
    private bridge: RewardsBridge,
    private intervalMs: number,
  ) {}

  setRun(runId: string): void {
    this.flush();
    this.runId = runId;
  }

  add(delta: number, source: string): void {
    if (delta === 0) return;
    this.pending.set(source, (this.pending.get(source) ?? 0) + delta);
  }

  update(dt: number): void {
    this.accumS += dt;
    if (this.accumS * 1000 >= this.intervalMs) {
      this.flush();
    }
  }

  /** Emits all batched deltas immediately (also called on run end). */
  flush(): void {
    this.accumS = 0;
    if (this.pending.size === 0) return;
    for (const [source, delta] of this.pending) {
      this.bridge.onPointsEarned(delta, { source, runId: this.runId });
    }
    this.pending.clear();
  }
}

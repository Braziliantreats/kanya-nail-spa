/**
 * ReviveProvider — pluggable gate for the once-per-run revive (spec §15).
 * The host can wire `request()` to a rewarded action later; the shipped
 * default is a 3-2-1 countdown button rendered by the game-over UI
 * (see ui/ReviveOverlay, built in the UI phase).
 */

export interface ReviveProvider {
  /** Resolves true to grant the revive, false to decline/expire the offer. */
  request(): Promise<boolean>;
}

/** Instantly grants the revive — headless/test default until UI wires in. */
export class AutoReviveProvider implements ReviveProvider {
  async request(): Promise<boolean> {
    return true;
  }
}

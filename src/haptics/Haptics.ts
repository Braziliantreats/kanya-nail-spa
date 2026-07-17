/**
 * Haptics — Vibration API wrapper (spec §13).
 * Feature-checked ('vibrate' in navigator) + settings toggle; a SILENT NO-OP
 * where unsupported (iOS Safari). Never the only feedback channel — every
 * haptic pairs with visual/audio cues elsewhere.
 */

import { Config } from '../core/Config';
import type { SettingsStore } from '../core/Settings';

export class Haptics {
  private supported: boolean;

  constructor(private settings: SettingsStore) {
    this.supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  }

  private vibrate(pattern: number | number[]): void {
    if (!this.supported || !this.settings.get('haptics')) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* silent no-op */
    }
  }

  /** Crystal pickups: none by design (spec §13) — too frequent. */

  powerup(): void {
    this.vibrate(Config.haptics.powerupMs);
  }

  nearMiss(): void {
    this.vibrate(Config.haptics.nearMissPattern);
  }

  crash(): void {
    this.vibrate(Config.haptics.crashMs);
  }
}

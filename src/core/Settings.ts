/**
 * Settings.ts — persisted user settings (spec §14/§16).
 * All reads/writes go through GameStorage (never localStorage directly);
 * every change emits `settings.changed` so systems react live.
 */

import { Config } from './Config';
import type { EventBus } from './Events';
import type { GameStorage } from './Storage';

export type ColorblindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';

export interface GameSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  colorblind: ColorblindMode;
  highContrast: boolean;
}

export class SettingsStore {
  private data: GameSettings;

  constructor(
    private storage: GameStorage,
    private bus: EventBus,
  ) {
    const defaults: GameSettings = {
      master: Config.audio.defaultMaster,
      music: Config.audio.defaultMusic,
      sfx: Config.audio.defaultSfx,
      muted: false,
      haptics: true,
      // Respect the OS-level preference as the starting default (spec §16).
      reducedMotion:
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      colorblind: 'off',
      highContrast: false,
    };
    this.data = { ...defaults, ...storage.getJSON<Partial<GameSettings>>(Config.storage.keys.settings, {}) };
  }

  get<K extends keyof GameSettings>(key: K): GameSettings[K] {
    return this.data[key];
  }

  set<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    if (this.data[key] === value) return;
    this.data[key] = value;
    this.storage.setJSON(Config.storage.keys.settings, this.data);
    this.bus.emit('settings.changed', { key, value });
  }

  snapshot(): GameSettings {
    return { ...this.data };
  }
}

/**
 * Storage.ts — embed-safe persistence (spec §4).
 *
 * `localStorage` may be unavailable in iframe/incognito embeds, so ALL
 * persistence flows through StorageProvider with feature-detected fallback:
 *   1. LocalStorageProvider — only if a try/catch test write succeeds
 *   2. MemoryStorageProvider — session-only fallback
 *   3. Optional injectable external provider (async get/set) from the host
 *
 * Nothing else in the codebase may touch `localStorage` directly — a unit
 * test greps for violations.
 */

export interface StorageProvider {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'localStorage';

  /** Feature detection — a try/catch test write, per spec §4. */
  static available(): boolean {
    try {
      const probe = '__crystal_rush_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota/security errors degrade silently — the in-memory cache still works.
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export class MemoryStorageProvider implements StorageProvider {
  readonly name = 'memory';
  private map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/** Picks the best available provider unless the host injected one. */
export function detectStorageProvider(injected?: StorageProvider): StorageProvider {
  if (injected) return injected;
  if (typeof window !== 'undefined' && LocalStorageProvider.available()) {
    return new LocalStorageProvider();
  }
  return new MemoryStorageProvider();
}

/**
 * GameStorage — prefix-namespaced, write-through cached facade over a
 * StorageProvider. `init()` prefetches known keys so runtime reads are
 * synchronous (no awaits inside the game loop); writes persist in the
 * background.
 */
export class GameStorage {
  private cache = new Map<string, string | null>();

  constructor(
    private provider: StorageProvider,
    private prefix: string,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  async init(knownKeys: string[]): Promise<void> {
    await Promise.all(
      knownKeys.map(async (key) => {
        const value = await this.provider.get(this.prefix + key);
        this.cache.set(key, value);
      }),
    );
  }

  getString(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  setString(key: string, value: string): void {
    this.cache.set(key, value);
    void this.provider.set(this.prefix + key, value);
  }

  getJSON<T>(key: string, fallback: T): T {
    const raw = this.getString(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  setJSON(key: string, value: unknown): void {
    this.setString(key, JSON.stringify(value));
  }

  /** "Reset data" support — clears the given keys everywhere. */
  clear(keys: string[]): void {
    for (const key of keys) {
      this.cache.set(key, null);
      void this.provider.remove(this.prefix + key);
    }
  }
}

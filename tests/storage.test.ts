/**
 * Storage — spec §20-8: persistence must survive with localStorage disabled
 * (memory fallback), and all reads/writes flow through the provider.
 */
import { describe, expect, it } from 'vitest';
import {
  detectStorageProvider,
  GameStorage,
  MemoryStorageProvider,
  type StorageProvider,
} from '../src/core/Storage';

describe('storage', () => {
  it('falls back to memory when localStorage is unavailable (node has no window)', () => {
    const provider = detectStorageProvider();
    expect(provider.name).toBe('memory');
  });

  it('prefers an injected external provider', () => {
    const external: StorageProvider = {
      name: 'external',
      async get() {
        return null;
      },
      async set() {},
      async remove() {},
    };
    expect(detectStorageProvider(external).name).toBe('external');
  });

  it('GameStorage caches sync reads and writes through to the provider', async () => {
    const provider = new MemoryStorageProvider();
    await provider.set('crystal-rush:seed', 'hello');
    const storage = new GameStorage(provider, 'crystal-rush:');
    await storage.init(['seed', 'missing']);

    expect(storage.getString('seed')).toBe('hello');
    expect(storage.getString('missing')).toBeNull();

    storage.setJSON('score', { best: 1234 });
    expect(storage.getJSON('score', { best: 0 }).best).toBe(1234);
    // Write-through reached the underlying provider.
    expect(await provider.get('crystal-rush:score')).toBe('{"best":1234}');
  });

  it('clear() wipes cache and provider', async () => {
    const provider = new MemoryStorageProvider();
    const storage = new GameStorage(provider, 'p:');
    await storage.init([]);
    storage.setString('a', '1');
    storage.clear(['a']);
    expect(storage.getString('a')).toBeNull();
    expect(await provider.get('p:a')).toBeNull();
  });

  it('corrupt JSON degrades to the fallback', async () => {
    const provider = new MemoryStorageProvider();
    await provider.set('p:bad', '{not json');
    const storage = new GameStorage(provider, 'p:');
    await storage.init(['bad']);
    expect(storage.getJSON('bad', 42)).toBe(42);
  });
});

/**
 * ObjectPool.ts — generic pre-allocated pool (spec §18: pool everything
 * spawned; never create/destroy objects during play).
 */

export interface PoolStats {
  free: number;
  active: number;
  created: number;
}

export class ObjectPool<T> {
  private free: T[] = [];
  private activeCount = 0;
  private createdCount = 0;

  constructor(
    private factory: () => T,
    private opts: {
      initialSize?: number;
      /** Called when an object leaves the pool (make visible, reset state). */
      onAcquire?: (obj: T) => void;
      /** Called when an object returns (hide, detach). */
      onRelease?: (obj: T) => void;
    } = {},
  ) {
    const n = opts.initialSize ?? 0;
    for (let i = 0; i < n; i++) {
      this.free.push(this.create());
    }
  }

  private create(): T {
    this.createdCount++;
    return this.factory();
  }

  acquire(): T {
    // Pop from the free list; only allocates if the pool underestimated —
    // prewarm sizes are tuned so this never happens mid-run.
    const obj = this.free.pop() ?? this.create();
    this.activeCount++;
    this.opts.onAcquire?.(obj);
    return obj;
  }

  release(obj: T): void {
    this.opts.onRelease?.(obj);
    this.activeCount--;
    this.free.push(obj);
  }

  get stats(): PoolStats {
    return { free: this.free.length, active: this.activeCount, created: this.createdCount };
  }
}

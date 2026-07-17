/**
 * Score math — spec §20-7:
 * score = floor(distance)·DIST_MULT + crystals·COIN_VALUE + near-miss bonuses,
 * all flowing through the debounced rewards emitter with the Double-Up
 * multiplier applied.
 */
import { describe, expect, it } from 'vitest';
import { Config } from '../src/core/Config';
import { EventBus } from '../src/core/Events';
import {
  DebouncedPointsEmitter,
  type PointsMeta,
  type RewardsBridge,
} from '../src/integrations/RewardsBridge';
import { ScoreSystem } from '../src/systems/ScoreSystem';
import type { RunState } from '../src/Game';
import type { MovementSystem } from '../src/systems/MovementSystem';
import type { SpawnSystem } from '../src/systems/SpawnSystem';

class CapturingBridge implements RewardsBridge {
  events: { delta: number; meta: PointsMeta }[] = [];
  onPointsEarned(delta: number, meta: PointsMeta): void {
    this.events.push({ delta, meta });
  }
  onRunComplete(): void {}
  onMilestone(): void {}
  onSessionStart(): void {}
}

function freshRun(): RunState {
  return {
    runId: 'test-run',
    tutorial: false,
    speed: 10,
    distance: 0,
    elapsedS: 0,
    coins: 0,
    score: 0,
    nearMisses: 0,
    powerupsUsed: {},
    tier: 0,
    reviveUsed: false,
  };
}

/** Fakes: crystals collected on demand; no obstacles. */
function fakeWorld(collectPerUpdate: number) {
  const movement = {
    visualX: 0,
    colliderCenter: { x: 0, y: 0.9, z: 0 },
    colliderHalf: { x: 0.4, y: 0.76, z: 0.34 },
  } as unknown as MovementSystem;
  const spawn = {
    active: [] as unknown[],
    crystals: {
      tryCollect(_x: number, _y: number, _z: number, _r: number, cb: (x: number, y: number, z: number) => void) {
        for (let i = 0; i < collectPerUpdate; i++) cb(0, 0.5, 0);
      },
    },
  } as unknown as SpawnSystem;
  return { movement, spawn };
}

describe('score system', () => {
  it('scores distance + crystals with the configured values', () => {
    const bus = new EventBus();
    const bridge = new CapturingBridge();
    const emitter = new DebouncedPointsEmitter(bridge, Config.score.pointsDebounceMs);
    emitter.setRun('test-run');
    const score = new ScoreSystem(bus, emitter);
    const run = freshRun();
    const { movement, spawn } = fakeWorld(3);

    run.distance = 25.7;
    score.update(1 / 60, run, movement, spawn);

    const expected = 25 * Config.score.distMult + 3 * Config.score.coinValue;
    expect(run.score).toBe(expected);
    expect(run.coins).toBe(3);
  });

  it('applies the Double-Up multiplier to crystal + bonus gains', () => {
    const bus = new EventBus();
    const emitter = new DebouncedPointsEmitter(new CapturingBridge(), 500);
    emitter.setRun('r');
    const score = new ScoreSystem(bus, emitter);
    score.multiplierProvider = () => 2;
    const run = freshRun();
    const { movement, spawn } = fakeWorld(1);

    score.update(1 / 60, run, movement, spawn);
    expect(run.score).toBe(Config.score.coinValue * 2);
  });

  it('debounces points to the bridge on the config interval and flushes remainder', () => {
    const bridge = new CapturingBridge();
    const emitter = new DebouncedPointsEmitter(bridge, 500);
    emitter.setRun('run-x');

    emitter.add(10, 'crystals');
    emitter.add(10, 'crystals');
    emitter.add(3, 'distance');
    emitter.update(0.3);
    expect(bridge.events.length).toBe(0); // still inside the window

    emitter.update(0.25); // crosses 500ms → one batched emit per source
    const bySource = Object.fromEntries(bridge.events.map((e) => [e.meta.source, e.delta]));
    expect(bySource).toEqual({ crystals: 20, distance: 3 });
    expect(bridge.events[0].meta.runId).toBe('run-x');

    emitter.add(7, 'nearmiss');
    emitter.flush();
    expect(bridge.events.at(-1)).toMatchObject({ delta: 7, meta: { source: 'nearmiss' } });
  });

  it('emits score.changed events with deltas', () => {
    const bus = new EventBus();
    const changes: number[] = [];
    bus.on('score.changed', ({ delta }) => changes.push(delta));
    const emitter = new DebouncedPointsEmitter(new CapturingBridge(), 500);
    const score = new ScoreSystem(bus, emitter);
    const run = freshRun();
    const { movement, spawn } = fakeWorld(0);
    run.distance = 5;
    score.update(1 / 60, run, movement, spawn);
    expect(changes).toEqual([5 * Config.score.distMult]);
  });
});

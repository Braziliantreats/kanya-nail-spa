/**
 * Power-up rules — spec §20-6: duration/stacking/extension/expiry.
 * three.js runs fine headless in node (no rendering happens in these paths).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { EventBus } from '../src/core/Events';
import { ToonMaterialFactory } from '../src/render/ToonMaterialFactory';
import { MovementSystem } from '../src/systems/MovementSystem';
import { PowerupSystem, type HudChip } from '../src/systems/PowerupSystem';
import type { SpawnSystem } from '../src/systems/SpawnSystem';

let bus: EventBus;
let powerups: PowerupSystem;
let movement: MovementSystem;

/** Reaches the private collect() — tests exercise the real activation path. */
function collect(type: string): void {
  (powerups as unknown as { collect(t: string): void }).collect(type);
}

const fakeSpawn = {
  crystals: { attract() {} },
} as unknown as SpawnSystem;

function tick(seconds: number): void {
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) powerups.update(step, fakeSpawn, 10);
}

beforeEach(() => {
  bus = new EventBus();
  movement = new MovementSystem(bus);
  powerups = new PowerupSystem(new THREE.Scene(), new ToonMaterialFactory(), bus, movement);
});

describe('power-up rules (spec §7)', () => {
  it('modifiers stack with each other and with movement power-ups', () => {
    collect('magnet');
    collect('doubleUp');
    collect('dash');
    expect(powerups.isActive('magnet')).toBe(true);
    expect(powerups.isActive('doubleUp')).toBe(true);
    expect(powerups.isActive('dash')).toBe(true);
    expect(powerups.scoreMult).toBe(Config.powerups.doubleUp.multiplier);
    expect(powerups.speedMult).toBe(Config.powerups.dash.speedMult);
  });

  it('only one movement power-up at a time — replacement refunds points', () => {
    const refunds: { points: number; source: string }[] = [];
    powerups.onBonus = (points, source) => refunds.push({ points, source });
    const replaced: { from: string; to: string }[] = [];
    bus.on('powerup.replaced', (p) => replaced.push(p));

    collect('dash');
    collect('zen');
    expect(powerups.isActive('dash')).toBe(false);
    expect(powerups.isActive('zen')).toBe(true);
    expect(replaced).toEqual([{ from: 'dash', to: 'zen' }]);
    expect(refunds).toEqual([
      { points: Config.powerups.replaceRefundPoints, source: 'powerup-refund' },
    ]);
  });

  it('re-collecting extends, capped at 1.5× base duration', () => {
    collect('magnet');
    collect('magnet');
    collect('magnet');
    const chip = powerups.hudState().find((c: HudChip) => c.type === 'magnet');
    // fraction is remaining / (base × cap): at the cap it reads exactly 1.
    expect(chip?.fraction).toBe(1);
  });

  it('expires after its duration and emits the 2s warning first', () => {
    const events: string[] = [];
    bus.on('powerup.expiring', ({ type }) => events.push(`warn:${type}`));
    bus.on('powerup.expired', ({ type }) => events.push(`end:${type}`));
    collect('dash'); // 3s
    tick(3.2);
    expect(powerups.isActive('dash')).toBe(false);
    expect(events).toEqual(['warn:dash', 'end:dash']);
  });

  it('zen shields; liftoff enters fly mode and drops out with a grace window', () => {
    collect('zen');
    expect(powerups.absorbCrash('full')).toBe(true);
    tick(Config.powerups.zen.durationS + 0.2);
    expect(powerups.absorbCrash('full')).toBe(false);

    collect('liftoff');
    expect(movement.flyMode).toBe(true);
    tick(Config.powerups.liftoff.durationS + 0.05);
    expect(movement.flyMode).toBe(false);
    expect(powerups.absorbCrash('full')).toBe(true); // post-flight grace
    tick(1);
    expect(powerups.absorbCrash('full')).toBe(false);
  });

  it('glider: inventory → deploy → absorbs exactly one crash → cooldown', () => {
    collect('glider');
    expect(powerups.gliderInventory).toBe(1);
    expect(powerups.isActive('glider')).toBe(false); // inventory, not active
    powerups.deployGlider();
    expect(powerups.gliderRiding).toBe(true);
    expect(powerups.absorbCrash('full')).toBe(true);
    expect(powerups.gliderRiding).toBe(false);
    expect(powerups.absorbCrash('full')).toBe(false);
    // Cooldown gates immediate redeploy.
    collect('glider');
    powerups.deployGlider();
    expect(powerups.gliderRiding).toBe(false);
  });

  it('reset clears everything', () => {
    collect('doubleUp');
    collect('glider');
    powerups.reset();
    expect(powerups.hudState()).toEqual([]);
    expect(powerups.scoreMult).toBe(1);
    expect(powerups.gliderInventory).toBe(0);
  });
});

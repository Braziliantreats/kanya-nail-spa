/**
 * Movement physics — spec §20-16: delta-time correctness. The jump arc must
 * be identical at 30fps and 60fps (exact velocity-Verlet step), plus slide
 * collider shrink and lane clamping.
 */
import { describe, expect, it } from 'vitest';
import { Config } from '../src/core/Config';
import { EventBus } from '../src/core/Events';
import { MovementSystem } from '../src/systems/MovementSystem';
import type { InputSystem } from '../src/systems/InputSystem';

/** Minimal InputSystem stand-in that performs one queued action. */
function fakeInput(actions: string[] = []): InputSystem {
  return {
    drain(tryPerform: (a: string) => boolean) {
      while (actions.length > 0 && tryPerform(actions[0])) actions.shift();
    },
  } as unknown as InputSystem;
}

function simulateJump(fps: number): { apex: number; airtimeS: number } {
  const m = new MovementSystem(new EventBus());
  const dt = 1 / fps;
  m.update(dt, fakeInput(['up']));
  let apex = 0;
  let airtimeS = 0;
  const idle = fakeInput();
  for (let i = 0; i < fps * 2; i++) {
    m.update(dt, idle);
    if (m.airborne) {
      airtimeS += dt;
      apex = Math.max(apex, m.y);
    } else if (airtimeS > 0) {
      break;
    }
  }
  return { apex, airtimeS };
}

describe('movement physics', () => {
  it('jump apex matches config and is frame-rate independent (30 vs 60 vs 144 fps)', () => {
    const targets = [30, 60, 144].map(simulateJump);
    for (const t of targets) {
      expect(t.apex).toBeGreaterThan(Config.jump.apexHeight - 0.02);
      expect(t.apex).toBeLessThan(Config.jump.apexHeight + 0.02);
      expect(t.airtimeS * 1000).toBeGreaterThan(Config.jump.airtimeMs - 40);
      expect(t.airtimeS * 1000).toBeLessThan(Config.jump.airtimeMs + 40);
    }
    // Cross-rate agreement: the arcs match each other tightly.
    expect(Math.abs(targets[0].apex - targets[1].apex)).toBeLessThan(0.01);
    expect(Math.abs(targets[1].apex - targets[2].apex)).toBeLessThan(0.01);
  });

  it('slide shrinks the collider to 50% height and expires on schedule', () => {
    const m = new MovementSystem(new EventBus());
    const standingHalf = m.colliderHalf.y;
    m.update(1 / 60, fakeInput(['down']));
    expect(m.slideActive).toBe(true);
    expect(m.colliderHalf.y).toBeCloseTo(standingHalf * Config.slide.colliderScale, 5);
    // Advance past the slide duration.
    const idle = fakeInput();
    for (let i = 0; i < 60; i++) m.update(1 / 60, idle);
    expect(m.slideActive).toBe(false);
    expect(m.colliderHalf.y).toBeCloseTo(standingHalf, 5);
  });

  it('lane changes clamp to the track and tween (never teleport)', () => {
    const m = new MovementSystem(new EventBus());
    m.update(1 / 60, fakeInput(['left']));
    expect(m.laneIndex).toBe(-1);
    const midX = m.visualX;
    expect(midX).toBeGreaterThan(-Config.lanes.width); // still tweening
    m.update(1 / 60, fakeInput(['left'])); // push against the edge
    expect(m.laneIndex).toBe(-1); // clamped
    const idle = fakeInput();
    for (let i = 0; i < 30; i++) m.update(1 / 60, idle);
    expect(m.visualX).toBeCloseTo(-Config.lanes.width, 3);
  });

  it('fast-fall kills ascent and lands early', () => {
    const busA = new EventBus();
    const normal = new MovementSystem(busA);
    normal.update(1 / 60, fakeInput(['up']));
    const idle = fakeInput();
    let normalAir = 0;
    for (let i = 0; i < 120 && (normal.airborne || normalAir === 0); i++) {
      normal.update(1 / 60, idle);
      if (normal.airborne) normalAir++;
    }

    const fast = new MovementSystem(new EventBus());
    fast.update(1 / 60, fakeInput(['up']));
    for (let i = 0; i < 6; i++) fast.update(1 / 60, idle);
    fast.update(1 / 60, fakeInput(['down'])); // slam
    let fastAir = 7;
    for (let i = 0; i < 120 && fast.airborne; i++) {
      fast.update(1 / 60, idle);
      fastAir++;
    }
    expect(fastAir).toBeLessThan(normalAir * 0.75);
  });

  it('jump buffered mid-air fires on landing (queuing)', () => {
    const bus = new EventBus();
    let jumps = 0;
    bus.on('player.jumped', () => jumps++);
    const m = new MovementSystem(bus);
    m.update(1 / 60, fakeInput(['up']));
    expect(jumps).toBe(1);
    // Hold a buffered 'up' that can't fire until grounded.
    const buffered = ['up'];
    const input = fakeInput(buffered);
    for (let i = 0; i < 120 && buffered.length > 0; i++) m.update(1 / 60, input);
    expect(jumps).toBe(2); // second jump fired exactly on landing
  });
});

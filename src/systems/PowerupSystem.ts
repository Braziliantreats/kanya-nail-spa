/**
 * PowerupSystem — all six power-ups with the spec §7 rule set:
 *
 * - Movement-altering (Liftoff / Zen / Dash): one at a time — activating a
 *   new one replaces the old and refunds +50 points.
 * - Modifiers (Magnet, Double Up): stack with each other and with movement
 *   power-ups.
 * - Re-collecting an active power-up EXTENDS it (cap 1.5× base duration).
 * - Expiry warning fires ~2s before end (HUD blink + audio cue).
 * - Glider goes to inventory; tap/G-key deploys it; absorbs one crash; own
 *   cooldown.
 *
 * Pickups spawn on the safe path (appended to a chunk's crystal breadcrumb
 * line) at a distance cadence with rarity weights.
 */

import type * as THREE from 'three';
import { Config } from '../core/Config';
import type { EventBus } from '../core/Events';
import { ObjectPool } from '../core/ObjectPool';
import type { PatternChunk } from '../data/patterns';
import { MOVEMENT_POWERUPS, RARITY_WEIGHTS, type PowerupType } from '../data/powerups';
import { buildPickupVisual, disposePickupGeometries } from '../render/PickupVisuals';
import type { ToonMaterialFactory } from '../render/ToonMaterialFactory';
import type { MovementSystem } from './MovementSystem';
import type { SpawnSystem } from './SpawnSystem';

interface Effect {
  remainingS: number;
  baseS: number;
  warned: boolean;
}

interface PickupEntry {
  type: PowerupType;
  x: number;
  y: number;
  z: number;
  active: boolean;
  visual: THREE.Group | null;
  bobPhase: number;
}

export interface HudChip {
  type: PowerupType;
  /** 1 → full ring, 0 → done. */
  fraction: number;
  kind: 'effect' | 'inventory' | 'cooldown';
  expiring: boolean;
}

const PICKUP_CAPACITY = 8;

export class PowerupSystem {
  private effects = new Map<PowerupType, Effect>();

  gliderInventory = 0;
  gliderRiding = false;
  private gliderTimerS = 0;
  private gliderCooldownS = 0;
  /** Short shield after Liftoff drops you back onto the track. */
  private postFlightGraceS = 0;

  private pickups: PickupEntry[] = [];
  private pools = new Map<PowerupType, ObjectPool<THREE.Group>>();
  private odometerM = 0;
  private nextPickupAtM = 0;

  /** Score hook (replace-refunds etc.) injected by Game. */
  onBonus: ((points: number, source: string) => void) | null = null;

  private hudScratch: HudChip[] = [];

  constructor(
    private scene: THREE.Scene,
    private materials: ToonMaterialFactory,
    private bus: EventBus,
    private movement: MovementSystem,
  ) {
    for (const [type] of RARITY_WEIGHTS) {
      this.pools.set(
        type,
        new ObjectPool<THREE.Group>(
          () => {
            const g = buildPickupVisual(type, this.materials);
            this.scene.add(g);
            return g;
          },
          {
            initialSize: 2,
            onAcquire: (g) => (g.visible = true),
            onRelease: (g) => (g.visible = false),
          },
        ),
      );
    }
    for (let i = 0; i < PICKUP_CAPACITY; i++) {
      this.pickups.push({ type: 'magnet', x: 0, y: 0, z: 0, active: false, visual: null, bobPhase: 0 });
    }
    this.resetCadence();
  }

  private resetCadence(): void {
    this.odometerM = 0;
    this.nextPickupAtM = 55 + Math.random() * 70;
  }

  reset(): void {
    for (const type of [...this.effects.keys()]) this.expire(type, true);
    this.effects.clear();
    this.gliderInventory = 0;
    this.gliderRiding = false;
    this.gliderTimerS = 0;
    this.gliderCooldownS = 0;
    this.postFlightGraceS = 0;
    for (const p of this.pickups) this.releasePickup(p);
    this.resetCadence();
  }

  // ------------------------------------------------------------ placement

  /** SpawnSystem hook: maybe append a pickup to a chunk's breadcrumb line. */
  maybePlacePickup(chunk: PatternChunk, entryZ: number): void {
    if (this.odometerM < this.nextPickupAtM || chunk.crystals.length === 0) return;
    const line = chunk.crystals[Math.floor(Math.random() * chunk.crystals.length)];
    const entry = this.pickups.find((p) => !p.active);
    if (!entry) return;

    // Weighted rarity draw.
    let total = 0;
    for (const [, w] of RARITY_WEIGHTS) total += w;
    let roll = Math.random() * total;
    let type: PowerupType = 'magnet';
    for (const [t, w] of RARITY_WEIGHTS) {
      roll -= w;
      if (roll <= 0) {
        type = t;
        break;
      }
    }

    entry.type = type;
    entry.active = true;
    entry.x = line.lane * Config.lanes.width;
    entry.y = 1.05;
    // Just past the crystal line's end — still on the breadcrumbed safe path.
    entry.z = entryZ - (line.z + line.count * 1.15 + 1.4);
    entry.bobPhase = Math.random() * Math.PI * 2;
    entry.visual = this.pools.get(type)!.acquire();

    this.nextPickupAtM = this.odometerM + 110 + Math.random() * 100;
  }

  private releasePickup(p: PickupEntry): void {
    if (p.visual) {
      this.pools.get(p.type)!.release(p.visual);
      p.visual = null;
    }
    p.active = false;
  }

  // ------------------------------------------------------------ frame update

  update(dt: number, spawn: SpawnSystem, effectiveSpeed: number): void {
    this.odometerM += effectiveSpeed * dt;
    const move = effectiveSpeed * dt;
    const m = this.movement;
    const pc = m.colliderCenter;

    // Pickups: drift with the world, bob/spin, collect on touch.
    for (const p of this.pickups) {
      if (!p.active) continue;
      p.z += move;
      p.bobPhase += dt * 2;
      if (p.visual) {
        p.visual.position.set(p.x, p.y + Math.sin(p.bobPhase) * 0.12, p.z);
        p.visual.rotation.y += dt * 2.4;
      }
      if (p.z > Config.spawn.despawnBehindUnits) {
        this.releasePickup(p);
        continue;
      }
      const dx = p.x - m.visualX;
      const dy = p.y - pc.y;
      const dz = p.z;
      if (dx * dx + dy * dy + dz * dz < 1.1) {
        const type = p.type;
        this.releasePickup(p);
        this.collect(type);
      }
    }

    // Effect timers, expiry warnings.
    for (const [type, fx] of this.effects) {
      fx.remainingS -= dt;
      if (!fx.warned && fx.remainingS <= Config.powerups.expiryWarnS) {
        fx.warned = true;
        this.bus.emit('powerup.expiring', { type });
      }
      if (fx.remainingS <= 0) this.expire(type, false);
    }

    // Glider ride timer + cooldown.
    if (this.gliderRiding) {
      this.gliderTimerS -= dt;
      if (this.gliderTimerS <= 0) this.endGliderRide();
    }
    if (this.gliderCooldownS > 0) this.gliderCooldownS -= dt;
    if (this.postFlightGraceS > 0) this.postFlightGraceS -= dt;

    // Magnet vacuum; Liftoff auto-collects its elevated line (strong pull).
    if (this.effects.has('magnet')) {
      const cfg = Config.powerups.magnet;
      spawn.crystals.attract(m.visualX, pc.y, 0, cfg.radius, cfg.pullSpeed, dt);
    }
    if (this.effects.has('liftoff')) {
      spawn.crystals.attract(m.visualX, pc.y, 0, 3.4, 30, dt);
    }
  }

  // ------------------------------------------------------------ activation

  private collect(type: PowerupType): void {
    this.bus.emit('powerup.collected', { type });

    if (type === 'glider') {
      // Inventory item — deploy is a separate, player-initiated action.
      this.gliderInventory = 1;
      return;
    }

    const existing = this.effects.get(type);
    if (existing) {
      // Extension, capped at base × 1.5 (spec §7).
      const cap = existing.baseS * Config.powerups.extensionCapMult;
      existing.remainingS = Math.min(existing.remainingS + existing.baseS, cap);
      existing.warned = false;
      this.bus.emit('powerup.extended', { type, remainingS: existing.remainingS });
      return;
    }

    if (MOVEMENT_POWERUPS.has(type)) {
      for (const other of [...this.effects.keys()]) {
        if (MOVEMENT_POWERUPS.has(other)) {
          // Replace + refund (spec §7).
          this.expire(other, true);
          this.bus.emit('powerup.replaced', { from: other, to: type });
          this.onBonus?.(Config.powerups.replaceRefundPoints, 'powerup-refund');
        }
      }
    }

    const baseS = this.baseDuration(type);
    this.effects.set(type, { remainingS: baseS, baseS, warned: false });
    this.applySideEffects(type, true);
    this.bus.emit('powerup.activated', { type, durationS: baseS });
  }

  private baseDuration(type: PowerupType): number {
    const p = Config.powerups;
    switch (type) {
      case 'magnet':
        return p.magnet.durationS;
      case 'doubleUp':
        return p.doubleUp.durationS;
      case 'liftoff':
        return p.liftoff.durationS;
      case 'zen':
        return p.zen.durationS;
      case 'dash':
        return p.dash.durationS;
      case 'glider':
        return p.glider.maxDurationS;
    }
  }

  private applySideEffects(type: PowerupType, on: boolean): void {
    if (type === 'liftoff') {
      this.movement.setFly(on, Config.powerups.liftoff.flyHeight);
      if (!on) this.postFlightGraceS = 0.8; // fair landing
    }
    if (type === 'zen') {
      this.movement.floatyGravityMult = on ? Config.powerups.zen.floatyGravityMult : 1;
    }
  }

  private expire(type: PowerupType, silent: boolean): void {
    if (!this.effects.delete(type)) return;
    this.applySideEffects(type, false);
    if (!silent) this.bus.emit('powerup.expired', { type });
  }

  deployGlider(): void {
    if (this.gliderInventory <= 0 || this.gliderRiding || this.gliderCooldownS > 0) return;
    this.gliderInventory = 0;
    this.gliderRiding = true;
    this.gliderTimerS = Config.powerups.glider.maxDurationS;
    this.bus.emit('powerup.activated', { type: 'glider', durationS: this.gliderTimerS });
  }

  private endGliderRide(): void {
    this.gliderRiding = false;
    this.gliderCooldownS = Config.powerups.glider.cooldownS;
    this.bus.emit('powerup.expired', { type: 'glider' });
  }

  /** CollisionSystem shield hook: true = crash absorbed (spec §6/§7/§15). */
  absorbCrash(_cause: string): boolean {
    if (this.effects.has('zen')) return true; // invincible
    if (this.effects.has('liftoff')) return true; // above it all
    if (this.postFlightGraceS > 0) return true;
    if (this.gliderRiding) {
      this.endGliderRide(); // the board takes the hit
      return true;
    }
    return false;
  }

  get speedMult(): number {
    return this.effects.has('dash') ? Config.powerups.dash.speedMult : 1;
  }

  get scoreMult(): number {
    return this.effects.has('doubleUp') ? Config.powerups.doubleUp.multiplier : 1;
  }

  isActive(type: PowerupType): boolean {
    return this.effects.has(type);
  }

  /** HUD model: active effects + glider inventory/cooldown chips. */
  hudState(): HudChip[] {
    const out = this.hudScratch;
    out.length = 0;
    for (const [type, fx] of this.effects) {
      out.push({
        type,
        fraction: Math.max(fx.remainingS / (fx.baseS * Config.powerups.extensionCapMult), 0),
        kind: 'effect',
        expiring: fx.remainingS <= Config.powerups.expiryWarnS,
      });
    }
    if (this.gliderRiding) {
      out.push({
        type: 'glider',
        fraction: this.gliderTimerS / Config.powerups.glider.maxDurationS,
        kind: 'effect',
        expiring: this.gliderTimerS <= Config.powerups.expiryWarnS,
      });
    } else if (this.gliderInventory > 0) {
      out.push({
        type: 'glider',
        fraction: this.gliderCooldownS > 0 ? 1 - this.gliderCooldownS / Config.powerups.glider.cooldownS : 1,
        kind: this.gliderCooldownS > 0 ? 'cooldown' : 'inventory',
        expiring: false,
      });
    }
    return out;
  }

  dispose(): void {
    disposePickupGeometries();
  }
}

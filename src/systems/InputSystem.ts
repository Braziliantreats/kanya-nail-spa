/**
 * InputSystem — keyboard + swipe with input buffering (spec §5).
 *
 * All control schemes work simultaneously:
 *   lane:  swipe left/right | ArrowLeft/Right | A/D
 *   jump:  swipe up         | ArrowUp | W | Space
 *   down:  swipe down       | ArrowDown | S   (slide, or fast-fall in air)
 *
 * Actions land in a fixed-slot buffer (~120ms TTL) that MovementSystem
 * drains each frame — enabling responsive feel + jump queuing. Fixed slots →
 * zero allocation in the input path (spec §18).
 */

import { Config } from '../core/Config';

export type GameAction = 'left' | 'right' | 'up' | 'down';

interface Slot {
  action: GameAction;
  atS: number;
  active: boolean;
}

const SLOT_COUNT = 8;

export class InputSystem {
  /** Gameplay consumption gate — buffer only fills while a run is live. */
  enabled = false;
  /** Fires on ANY input attempt (used by menu "press to start" + audio unlock). */
  onAnyInput: (() => void) | null = null;
  /** Escape / P. */
  onPauseKey: (() => void) | null = null;
  /** G / F — deploy the Glider from inventory (spec §7). */
  onGliderKey: (() => void) | null = null;

  private slots: Slot[] = Array.from({ length: SLOT_COUNT }, () => ({
    action: 'left',
    atS: 0,
    active: false,
  }));
  private timeS = 0;

  // Active swipe gesture tracking (single pointer).
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private startAtMs = 0;
  private gestureFired = false;

  constructor(private pointerTarget: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    pointerTarget.addEventListener('pointerdown', this.onPointerDown);
    pointerTarget.addEventListener('pointermove', this.onPointerMove);
    pointerTarget.addEventListener('pointerup', this.onPointerUp);
    pointerTarget.addEventListener('pointercancel', this.onPointerCancel);
  }

  update(dt: number): void {
    this.timeS += dt;
    // Expire buffered actions past the buffer window.
    const ttlS = Config.input.bufferMs / 1000;
    for (const slot of this.slots) {
      if (slot.active && this.timeS - slot.atS > ttlS) slot.active = false;
    }
  }

  private drainScratch: (Slot | null)[] = new Array(SLOT_COUNT).fill(null);

  /**
   * Oldest-first consumption: `tryPerform` returns true when the action was
   * executed (slot freed) or false to keep it buffered (e.g. jump pressed
   * mid-air fires on landing — spec §5 jump queuing). Unperformable actions
   * do NOT block later ones — a buffered jump must never delay a lane change.
   */
  drain(tryPerform: (action: GameAction) => boolean): void {
    // Gather + insertion-sort into a preallocated scratch (n ≤ 8, zero alloc).
    let n = 0;
    for (const slot of this.slots) {
      if (slot.active) this.drainScratch[n++] = slot;
    }
    for (let i = 1; i < n; i++) {
      const s = this.drainScratch[i]!;
      let j = i - 1;
      while (j >= 0 && this.drainScratch[j]!.atS > s.atS) {
        this.drainScratch[j + 1] = this.drainScratch[j];
        j--;
      }
      this.drainScratch[j + 1] = s;
    }
    for (let i = 0; i < n; i++) {
      const slot = this.drainScratch[i]!;
      if (tryPerform(slot.action)) slot.active = false;
    }
  }

  clear(): void {
    for (const slot of this.slots) slot.active = false;
  }

  private push(action: GameAction): void {
    this.onAnyInput?.();
    if (!this.enabled) return;
    let target: Slot | null = null;
    for (const slot of this.slots) {
      if (!slot.active) {
        target = slot;
        break;
      }
      if (target === null || slot.atS < target.atS) target = slot; // overwrite oldest
    }
    if (!target) return;
    target.action = action;
    target.atS = this.timeS;
    target.active = true;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        this.push('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        this.push('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        e.preventDefault();
        this.push('up');
        break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.push('down');
        break;
      case 'Escape':
      case 'KeyP':
        this.onPauseKey?.();
        break;
      case 'KeyG':
      case 'KeyF':
        this.onGliderKey?.();
        break;
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.pointerId !== -1) return; // one gesture at a time
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startAtMs = performance.now();
    this.gestureFired = false;
    this.onAnyInput?.();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId || this.gestureFired) return;
    // Fire as soon as travel crosses the threshold (snappier than waiting
    // for pointerup). Dominant axis wins (spec §5).
    if (performance.now() - this.startAtMs > Config.input.swipeMaxMs) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    const min = Config.input.swipeMinPx;
    if (Math.abs(dx) < min && Math.abs(dy) < min) return;
    this.gestureFired = true;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.push(dx > 0 ? 'right' : 'left');
    } else {
      this.push(dy > 0 ? 'down' : 'up');
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = -1;
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = -1;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.pointerTarget.removeEventListener('pointerdown', this.onPointerDown);
    this.pointerTarget.removeEventListener('pointermove', this.onPointerMove);
    this.pointerTarget.removeEventListener('pointerup', this.onPointerUp);
    this.pointerTarget.removeEventListener('pointercancel', this.onPointerCancel);
  }
}

/**
 * PowerupHUD — active power-up icon row with radial countdown rings (spec §7).
 * Rings are cheap CSS conic-gradients; chips blink during the 2s expiry
 * warning. The Glider chip doubles as its tap-to-deploy button.
 */

import { PICKUP_COLORS, PICKUP_GLYPHS, PICKUP_NAMES, type PowerupType } from '../data/powerups';
import type { HudChip } from '../systems/PowerupSystem';

interface ChipEl {
  root: HTMLElement;
  inner: HTMLElement;
}

export class PowerupHUD {
  private root: HTMLElement;
  private chips = new Map<string, ChipEl>();
  private accumS = 0;

  constructor(
    uiRoot: HTMLElement,
    private onDeployGlider: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'powerup-hud';
    uiRoot.appendChild(this.root);
  }

  private colorCss(type: PowerupType): string {
    return `#${PICKUP_COLORS[type].toString(16).padStart(6, '0')}`;
  }

  private ensureChip(type: PowerupType): ChipEl {
    let chip = this.chips.get(type);
    if (chip) return chip;
    const root = document.createElement('button');
    root.className = 'pu-chip';
    root.setAttribute('aria-label', PICKUP_NAMES[type]);
    const inner = document.createElement('span');
    inner.className = 'pu-chip-inner';
    inner.textContent = PICKUP_GLYPHS[type];
    inner.style.color = this.colorCss(type);
    root.appendChild(inner);
    if (type === 'glider') {
      root.classList.add('deployable');
      root.addEventListener('click', () => this.onDeployGlider());
    }
    this.root.appendChild(root);
    chip = { root, inner };
    this.chips.set(type, chip);
    return chip;
  }

  /** ~10Hz reconcile — cheap enough to never matter (spec §18). */
  update(dt: number, state: HudChip[]): void {
    this.accumS += dt;
    if (this.accumS < 0.1) return;
    this.accumS = 0;

    const seen = new Set<string>();
    for (const item of state) {
      seen.add(item.type);
      const chip = this.ensureChip(item.type);
      const color = this.colorCss(item.type);
      const pct = Math.max(0, Math.min(item.fraction, 1)) * 360;
      chip.root.style.background = `conic-gradient(${color} ${pct}deg, rgba(255,255,255,0.14) ${pct}deg)`;
      chip.root.classList.toggle('expiring', item.expiring);
      chip.root.classList.toggle('cooldown', item.kind === 'cooldown');
      chip.root.classList.toggle('ready', item.kind === 'inventory');
    }
    for (const [key, chip] of this.chips) {
      if (!seen.has(key)) {
        chip.root.remove();
        this.chips.delete(key);
      }
    }
  }

  clear(): void {
    for (const chip of this.chips.values()) chip.root.remove();
    this.chips.clear();
  }
}

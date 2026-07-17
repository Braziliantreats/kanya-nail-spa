/**
 * HUD — in-run overlay (spec §14): distance + score top center, crystal
 * counter top right, pause button top left (≥44px), thin progress bar toward
 * the next environment gateway, floating popups (near-miss/power-ups), and
 * the contextual tutorial prompt slot.
 */

import { Config } from '../core/Config';
import type { EventBus } from '../core/Events';
import { PICKUP_NAMES } from '../data/powerups';
import type { RunState } from '../Game';
import { el, fmt } from './dom';

const POPUP_POOL = 6;

export class HUD {
  private root: HTMLElement;
  private distanceEl: HTMLElement;
  private scoreEl: HTMLElement;
  private crystalsEl: HTMLElement;
  private progressFill: HTMLElement;
  private tutorialEl: HTMLElement;
  private popups: HTMLElement[] = [];
  private popupIdx = 0;
  private accumS = 0;

  constructor(uiRoot: HTMLElement, bus: EventBus, onPause: () => void) {
    this.root = el('div', 'hud');

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-pause';
    pauseBtn.setAttribute('aria-label', 'Pause');
    pauseBtn.textContent = '❚❚';
    pauseBtn.addEventListener('click', onPause);

    const center = el('div', 'hud-center');
    this.distanceEl = el('div', 'hud-distance', '0m');
    this.scoreEl = el('div', 'hud-score', '0');
    center.append(this.distanceEl, this.scoreEl);

    this.crystalsEl = el('div', 'hud-crystals', '◆ 0');

    const progress = el('div', 'hud-progress');
    this.progressFill = el('div', 'hud-progress-fill');
    progress.appendChild(this.progressFill);

    this.tutorialEl = el('div', 'hud-tutorial hidden');

    this.root.append(pauseBtn, center, this.crystalsEl, progress, this.tutorialEl);
    for (let i = 0; i < POPUP_POOL; i++) {
      const p = el('div', 'hud-popup');
      this.popups.push(p);
      this.root.appendChild(p);
    }
    uiRoot.appendChild(this.root);
    this.setVisible(false);

    // Floating feedback popups (spec §5 near-miss, §7 power-ups). Framing is
    // celebratory, not gambling-like (COMPLIANCE).
    bus.on('nearmiss', () => this.popup(`CLOSE! +${Config.score.nearMissBonus}`, 'nearmiss'));
    bus.on('powerup.activated', ({ type }) => this.popup(`${PICKUP_NAMES[type as keyof typeof PICKUP_NAMES] ?? type} ACTIVE`, 'powerup'));
    bus.on('powerup.replaced', () => this.popup(`SWAP +${Config.powerups.replaceRefundPoints}`, 'powerup'));
    bus.on('crystal.collected', ({ streak }) => {
      if (streak > 0 && streak % 10 === 0) this.popup(`${streak} STREAK!`, 'streak');
    });
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  /** ~8Hz refresh — cheap text updates only (spec §18). */
  update(dt: number, run: RunState): void {
    this.accumS += dt;
    if (this.accumS < 0.12) return;
    this.accumS = 0;
    this.distanceEl.textContent = `${fmt(run.distance)}m`;
    this.scoreEl.textContent = fmt(run.score);
    this.crystalsEl.textContent = `◆ ${fmt(run.coins)}`;
    const toGateway = (run.distance % Config.environment.switchEveryM) / Config.environment.switchEveryM;
    this.progressFill.style.width = `${(toGateway * 100).toFixed(1)}%`;
  }

  popup(text: string, cls: string): void {
    const p = this.popups[this.popupIdx];
    this.popupIdx = (this.popupIdx + 1) % POPUP_POOL;
    p.textContent = text;
    p.className = `hud-popup show ${cls}`;
    p.style.left = `${44 + Math.random() * 12}%`;
    // Restart the CSS animation.
    void p.offsetWidth;
  }

  showTutorial(text: string): void {
    this.tutorialEl.textContent = text;
    this.tutorialEl.classList.remove('hidden');
  }

  hideTutorial(): void {
    this.tutorialEl.classList.add('hidden');
  }
}

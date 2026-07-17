/**
 * GameOverScreen (spec §14): run stats, best-ever badge, prominent Retry,
 * Menu. (The revive offer happens BEFORE this screen, in the REVIVE state.)
 */

import type { RunSummary } from '../integrations/RewardsBridge';
import { button, el, fmt } from './dom';
import { UIScreen } from './ScreenManager';

export interface GameOverData {
  summary: RunSummary;
  isBest: boolean;
}

export class GameOverScreen extends UIScreen {
  private bestBadge: HTMLElement;
  private statsEl: HTMLElement;

  constructor(onRetry: () => void, onMenu: () => void) {
    super('screen-gameover');
    const panel = el('div', 'panel gameover-panel');
    panel.appendChild(el('h2', 'panel-title', 'Run complete'));
    this.bestBadge = el('div', 'best-badge hidden', 'NEW BEST!');
    panel.appendChild(this.bestBadge);
    this.statsEl = el('div', 'run-stats');
    panel.appendChild(this.statsEl);
    panel.append(button('btn btn-play', 'RETRY', onRetry), button('btn btn-ghost', 'Menu', onMenu));
    this.el.appendChild(panel);
  }

  override onShow(data?: unknown): void {
    const d = data as GameOverData | undefined;
    if (!d) return;
    const s = d.summary;
    this.bestBadge.classList.toggle('hidden', !d.isBest);
    this.statsEl.textContent = '';
    const rows: [string, string][] = [
      ['Score', fmt(s.score)],
      ['Distance', `${fmt(s.distance)}m`],
      ['Crystals', `◆ ${fmt(s.coins)}`],
      ['Near misses', fmt(s.nearMisses)],
    ];
    for (const [label, value] of rows) {
      const row = el('div', 'run-stat-row');
      row.append(el('span', 'run-stat-label', label), el('span', 'run-stat-value', value));
      this.statsEl.appendChild(row);
    }
  }
}

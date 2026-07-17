/**
 * MissionsScreen — the rotating set of 3 missions with progress + rewards
 * (spec §8/§14).
 */

import type { ProgressionSystem } from '../systems/ProgressionSystem';
import { button, el, fmt } from './dom';
import { UIScreen } from './ScreenManager';

export class MissionsScreen extends UIScreen {
  private listEl: HTMLElement;

  constructor(
    private progression: ProgressionSystem,
    onBack: () => void,
  ) {
    super('screen-missions');
    const panel = el('div', 'panel missions-panel');
    panel.appendChild(el('h2', 'panel-title', 'Missions'));
    this.listEl = el('div', 'mission-list');
    panel.append(this.listEl, button('btn', 'Back', onBack));
    this.el.appendChild(panel);
  }

  override onShow(): void {
    this.listEl.textContent = '';
    const views = this.progression.missionViews();
    if (views.length === 0) {
      this.listEl.appendChild(el('div', 'mission-empty', 'All missions complete — new ones soon!'));
      return;
    }
    for (const v of views) {
      const row = el('div', 'mission-row');
      const top = el('div', 'mission-top');
      top.append(el('span', 'mission-label', v.def.label), el('span', 'mission-reward', `+${fmt(v.def.reward)} ◆`));
      const bar = el('div', 'mission-bar');
      const fill = el('div', 'mission-bar-fill');
      fill.style.width = `${Math.min((v.progress / v.target) * 100, 100).toFixed(0)}%`;
      bar.appendChild(fill);
      const progress = el('div', 'mission-progress', `${fmt(v.progress)} / ${fmt(v.target)}`);
      row.append(top, bar, progress);
      this.listEl.appendChild(row);
    }
  }
}

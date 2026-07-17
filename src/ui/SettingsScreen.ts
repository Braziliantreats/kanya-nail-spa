/**
 * SettingsScreen (spec §14/§16): volume sliders + mute, haptics toggle,
 * reduced-motion toggle, colorblind mode selector, high-contrast toggle,
 * reset data. Everything persists via SettingsStore and takes effect live.
 */

import type { ColorblindMode, SettingsStore } from '../core/Settings';
import { button, el } from './dom';
import { UIScreen } from './ScreenManager';

export class SettingsScreen extends UIScreen {
  private backTo: 'menu' | 'pause' = 'menu';

  constructor(
    private settings: SettingsStore,
    private onBack: (target: 'menu' | 'pause') => void,
    onResetData: () => void,
  ) {
    super('screen-settings');

    const panel = el('div', 'panel settings-panel');
    panel.appendChild(el('h2', 'panel-title', 'Settings'));

    panel.appendChild(this.slider('Master volume', 'master'));
    panel.appendChild(this.slider('Music', 'music'));
    panel.appendChild(this.slider('Sound effects', 'sfx'));
    panel.appendChild(this.toggle('Mute all audio', 'muted'));
    panel.appendChild(this.toggle('Haptics (vibration)', 'haptics'));
    panel.appendChild(this.toggle('Reduced motion', 'reducedMotion'));
    panel.appendChild(this.colorblindSelect());
    panel.appendChild(this.toggle('High contrast', 'highContrast'));

    const danger = el('div', 'settings-row settings-danger');
    danger.append(
      el('span', 'settings-label', 'Reset all data'),
      button('btn btn-ghost btn-small', 'Reset…', () => {
        if (window.confirm('Erase high score, unlocks, streaks and settings?')) onResetData();
      }),
    );
    panel.appendChild(danger);

    panel.appendChild(button('btn', 'Back', () => this.onBack(this.backTo)));
    this.el.appendChild(panel);
  }

  override onShow(data?: unknown): void {
    const d = data as { backTo?: 'menu' | 'pause' } | undefined;
    this.backTo = d?.backTo ?? 'menu';
  }

  private row(labelText: string): { row: HTMLElement; label: HTMLElement } {
    const row = el('div', 'settings-row');
    const label = el('span', 'settings-label', labelText);
    row.appendChild(label);
    return { row, label };
  }

  private slider(labelText: string, key: 'master' | 'music' | 'sfx'): HTMLElement {
    const { row } = this.row(labelText);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = String(this.settings.get(key));
    input.setAttribute('aria-label', labelText);
    input.addEventListener('input', () => this.settings.set(key, Number(input.value)));
    row.appendChild(input);
    return row;
  }

  private toggle(
    labelText: string,
    key: 'muted' | 'haptics' | 'reducedMotion' | 'highContrast',
  ): HTMLElement {
    const { row } = this.row(labelText);
    const wrap = el('label', 'switch');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = this.settings.get(key);
    input.setAttribute('aria-label', labelText);
    input.addEventListener('change', () => this.settings.set(key, input.checked));
    wrap.append(input, el('span', 'switch-track'));
    row.appendChild(wrap);
    return row;
  }

  private colorblindSelect(): HTMLElement {
    const { row } = this.row('Colorblind mode');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Colorblind mode');
    const options: [ColorblindMode, string][] = [
      ['off', 'Off'],
      ['deuteranopia', 'Deuteranopia'],
      ['protanopia', 'Protanopia'],
      ['tritanopia', 'Tritanopia'],
    ];
    for (const [value, label] of options) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    }
    select.value = this.settings.get('colorblind');
    // Applies immediately — the 3D signal palette remaps live (spec §16
    // "live preview": the scene itself is the preview behind this panel).
    select.addEventListener('change', () =>
      this.settings.set('colorblind', select.value as ColorblindMode),
    );
    row.appendChild(select);
    return row;
  }
}

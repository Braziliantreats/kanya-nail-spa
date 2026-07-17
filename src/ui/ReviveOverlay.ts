/**
 * ReviveOverlay — the shipped ReviveProvider (spec §15): one revive per run
 * behind a 3-2-1 countdown button. The host swaps this class out at init to
 * gate revives behind a rewarded action instead.
 */

import { Config } from '../core/Config';
import type { ReviveProvider } from '../integrations/ReviveProvider';
import { button, el } from './dom';

export class UiReviveProvider implements ReviveProvider {
  constructor(private uiRoot: HTMLElement) {}

  request(): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = el('div', 'revive-overlay');
      const panel = el('div', 'panel revive-panel');
      panel.appendChild(el('h2', 'panel-title', 'Wiped out!'));
      panel.appendChild(el('p', 'revive-sub', 'Keep this run going?'));

      let remaining = Config.revive.countdownS;
      const reviveBtn = button('btn btn-play revive-btn', `REVIVE (${remaining})`, () => {
        finish(true);
      });
      const declineBtn = button('btn btn-ghost', 'No thanks', () => finish(false));
      panel.append(reviveBtn, declineBtn);
      overlay.appendChild(panel);
      this.uiRoot.appendChild(overlay);

      const timer = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          finish(false); // offer expires
        } else {
          reviveBtn.textContent = `REVIVE (${remaining})`;
        }
      }, 1000);

      const finish = (ok: boolean): void => {
        window.clearInterval(timer);
        overlay.remove();
        resolve(ok);
      };
    });
  }
}

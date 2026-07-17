/**
 * AgeGate — 21+ verification seam (spec §2).
 *
 * COMPLIANCE: this shipped implementation is a PLACEHOLDER self-attestation
 * modal. Real age verification is handled externally by the dispensary host,
 * which injects its own implementation via `Game.init({ ageGate })`.
 * Refusing the gate blocks the game (FSM → BLOCKED, terminal).
 */

import type { GameStorage } from '../core/Storage';
import { Config } from '../core/Config';

export interface AgeGate {
  verify(): Promise<boolean>;
}

export class DefaultAgeGate implements AgeGate {
  constructor(
    private storage: GameStorage,
    private uiRoot: HTMLElement,
  ) {}

  verify(): Promise<boolean> {
    // "On first load" (spec §2): a prior acknowledgment on this device skips
    // the modal. COMPLIANCE: real verification must NOT rely on this flag —
    // it exists only so the placeholder isn't annoying during development.
    if (this.storage.getString(Config.storage.keys.ageAck) === 'yes') {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'age-gate-overlay';
      overlay.innerHTML = `
        <div class="age-gate-panel" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
          <h1 id="age-gate-title">Are you 21 or older?</h1>
          <p>You must be 21 or older to play.</p>
          <div class="age-gate-buttons">
            <button class="btn btn-primary" data-age="yes">I'm 21 or older</button>
            <button class="btn btn-ghost" data-age="no">No</button>
          </div>
        </div>`;
      this.uiRoot.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('[data-age]');
        if (!target) return;
        const yes = target.getAttribute('data-age') === 'yes';
        if (yes) {
          this.storage.setString(Config.storage.keys.ageAck, 'yes');
          overlay.remove();
          resolve(true);
        } else {
          // COMPLIANCE: "No" blocks the game entirely — replace the prompt
          // with a terminal blocked screen and never resolve to playable.
          overlay.innerHTML = `
            <div class="age-gate-panel" role="alertdialog">
              <h1>Come back later</h1>
              <p>This experience is only for adults 21 and older.</p>
            </div>`;
          resolve(false);
        }
      });
    });
  }
}

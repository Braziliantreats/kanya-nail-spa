/**
 * LegalFooter — persistent slot for the state-mandated warning + license
 * number, plus the "For ages 21+" label (spec §2).
 *
 * COMPLIANCE: content comes exclusively from Config.legal (host-injected via
 * Game.init). Rendered with textContent — host text is never parsed as HTML.
 */

import { Config } from '../core/Config';

export class LegalFooter {
  private el: HTMLElement;
  private ageEl: HTMLElement;
  private disclaimerEl: HTMLElement;
  private licenseEl: HTMLElement;

  constructor(uiRoot: HTMLElement) {
    this.el = document.createElement('footer');
    this.el.className = 'legal-footer';

    this.ageEl = document.createElement('span');
    this.ageEl.className = 'age-label';
    this.disclaimerEl = document.createElement('span');
    this.licenseEl = document.createElement('span');

    this.el.append(this.ageEl, this.disclaimerEl, this.licenseEl);
    uiRoot.appendChild(this.el);
    this.refresh();
  }

  /** Re-reads Config.legal (call after init-time overrides are applied). */
  refresh(): void {
    this.ageEl.textContent = Config.legal.ageLabel;
    this.disclaimerEl.textContent = Config.legal.disclaimer;
    this.licenseEl.textContent = Config.legal.licenseLine;
  }
}

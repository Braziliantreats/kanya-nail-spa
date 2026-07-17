/**
 * ZenFx — Zen Mode's screen treatment (spec §7/§2).
 *
 * COMPLIANCE: deliberately fantastical/abstract — a soft bloom vignette,
 * gentle color shift and slow hue wobble, paired with star-sparkle particles
 * in the 3D scene. Nothing here may read as depicting consumption or a drug
 * high; it's the same "flow state" glow any fantasy game uses. Reduced
 * motion swaps the wobble for a static soft vignette.
 */

export class ZenFx {
  private el: HTMLElement;

  constructor(
    uiRoot: HTMLElement,
    private container: HTMLElement,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'zen-fx';
    uiRoot.appendChild(this.el);
  }

  setActive(active: boolean): void {
    this.el.classList.toggle('active', active);
    this.container.classList.toggle('zen-filter', active);
  }
}

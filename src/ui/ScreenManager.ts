/**
 * ScreenManager — DOM overlay screens with 250ms enter/leave transitions
 * (spec §14). One screen visible at a time; screens re-render on show.
 */

export type ScreenId = 'menu' | 'settings' | 'characters' | 'environments' | 'missions' | 'pause' | 'gameover';

export abstract class UIScreen {
  readonly el: HTMLElement;

  constructor(className: string) {
    this.el = document.createElement('section');
    this.el.className = `screen ${className}`;
    this.el.style.display = 'none';
  }

  /** Refresh dynamic content just before the screen becomes visible. */
  onShow(_data?: unknown): void {}
  onHide(): void {}
}

export class ScreenManager {
  private screens = new Map<ScreenId, UIScreen>();
  private current: ScreenId | null = null;

  constructor(private uiRoot: HTMLElement) {}

  register(id: ScreenId, screen: UIScreen): void {
    this.screens.set(id, screen);
    this.uiRoot.appendChild(screen.el);
  }

  get currentId(): ScreenId | null {
    return this.current;
  }

  show(id: ScreenId, data?: unknown): void {
    if (this.current === id) {
      this.screens.get(id)?.onShow(data);
      return;
    }
    this.hideCurrent();
    const screen = this.screens.get(id);
    if (!screen) return;
    this.current = id;
    screen.onShow(data);
    screen.el.style.display = 'flex';
    screen.el.classList.remove('screen-leave');
    screen.el.classList.add('screen-enter');
  }

  hideAll(): void {
    this.hideCurrent();
  }

  private hideCurrent(): void {
    if (!this.current) return;
    const screen = this.screens.get(this.current);
    this.current = null;
    if (!screen) return;
    screen.onHide();
    const elRef = screen.el;
    elRef.classList.remove('screen-enter');
    elRef.classList.add('screen-leave');
    // Hide after the leave animation; guard against re-show in between.
    window.setTimeout(() => {
      if (elRef.classList.contains('screen-leave')) {
        elRef.style.display = 'none';
        elRef.classList.remove('screen-leave');
      }
    }, 240);
  }
}

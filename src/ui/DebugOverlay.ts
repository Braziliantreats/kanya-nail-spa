/**
 * DebugOverlay — ?debug=1 instrumentation (spec §18): FPS, draw calls,
 * triangles, sim state, and pooled-object counts.
 */

export interface DebugStats {
  drawCalls: number;
  triangles: number;
  state: string;
  speed: number;
  distanceM: number;
  qualityLevel: number;
}

export class DebugOverlay {
  readonly enabled: boolean;
  private el: HTMLElement | null = null;

  private frames = 0;
  private fpsAccumS = 0;
  private fps = 0;
  private renderAccumS = 0;
  private poolProvider: (() => string) | null = null;

  constructor(uiRoot: HTMLElement) {
    this.enabled = new URLSearchParams(window.location.search).get('debug') === '1';
    if (!this.enabled) return;
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    uiRoot.appendChild(this.el);
  }

  /** Systems with pools register a single stats-line provider here. */
  setPoolStatsProvider(fn: () => string): void {
    this.poolProvider = fn;
  }

  update(dt: number, stats: DebugStats): void {
    if (!this.el) return;

    this.frames++;
    this.fpsAccumS += dt;
    if (this.fpsAccumS >= 0.5) {
      this.fps = this.frames / this.fpsAccumS;
      this.frames = 0;
      this.fpsAccumS = 0;
    }

    // Repaint at ~5Hz — the overlay itself must not become the hotspot.
    this.renderAccumS += dt;
    if (this.renderAccumS < 0.2) return;
    this.renderAccumS = 0;

    this.el.textContent =
      `fps        ${this.fps.toFixed(0)}\n` +
      `draw calls ${stats.drawCalls}\n` +
      `triangles  ${stats.triangles}\n` +
      `state      ${stats.state}\n` +
      `speed      ${stats.speed.toFixed(1)} u/s\n` +
      `distance   ${stats.distanceM.toFixed(0)} m\n` +
      `quality    L${stats.qualityLevel}` +
      (this.poolProvider ? `\n${this.poolProvider()}` : '');
  }
}

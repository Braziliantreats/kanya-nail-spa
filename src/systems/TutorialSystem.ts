/**
 * TutorialSystem — contextual onboarding INSIDE the first run (spec §14):
 * animated prompts appear just before the first relevant obstacle; no
 * text-wall tutorial. Prompts dismiss on the matching action or once the
 * obstacle passes.
 */

import type { EventBus } from '../core/Events';
import type { RunState } from '../Game';
import type { HUD } from '../ui/HUD';
import type { ActiveObstacle, SpawnSystem } from './SpawnSystem';

type PromptKey = 'jump' | 'slide' | 'lane';

const PROMPTS: Record<PromptKey, string> = {
  jump: 'Swipe up or press ↑ to JUMP',
  slide: 'Swipe down or press ↓ to SLIDE',
  lane: 'Swipe left/right or ← → to DODGE',
};

export class TutorialSystem {
  private shown = new Set<PromptKey>();
  private activeKey: PromptKey | null = null;
  /** The obstacle the active prompt teaches (valid while it stays on track). */
  private activeObstacle: ActiveObstacle | null = null;

  constructor(
    private hud: HUD,
    bus: EventBus,
  ) {
    bus.on('player.jumped', () => this.dismissIf('jump'));
    bus.on('player.slide.started', () => this.dismissIf('slide'));
    bus.on('player.lane.changed', () => this.dismissIf('lane'));
  }

  reset(): void {
    this.shown.clear();
    this.dismiss();
  }

  update(run: RunState, spawn: SpawnSystem): void {
    if (!run.tutorial) {
      if (this.activeKey) this.dismiss();
      return;
    }

    if (this.activeKey) {
      // Obstacle scrolled past without the action — hide the prompt anyway.
      if (!this.activeObstacle || this.activeObstacle.passed || this.activeObstacle.z > 1) {
        this.dismiss();
      }
      return;
    }

    // Find the nearest approaching obstacle whose action hasn't been taught.
    let best: ActiveObstacle | null = null;
    for (const e of spawn.active) {
      if (e.z < -26 || e.z > -8) continue; // teach just before it matters
      const key: PromptKey = e.action === 'jump' ? 'jump' : e.action === 'slide' ? 'slide' : 'lane';
      if (this.shown.has(key)) continue;
      if (!best || e.z > best.z) best = e;
    }
    if (best) {
      const key: PromptKey =
        best.action === 'jump' ? 'jump' : best.action === 'slide' ? 'slide' : 'lane';
      this.shown.add(key);
      this.activeKey = key;
      this.activeObstacle = best;
      this.hud.showTutorial(PROMPTS[key]);
    }
  }

  private dismissIf(key: PromptKey): void {
    if (this.activeKey === key) this.dismiss();
  }

  private dismiss(): void {
    this.activeKey = null;
    this.activeObstacle = null;
    this.hud.hideTutorial();
  }
}

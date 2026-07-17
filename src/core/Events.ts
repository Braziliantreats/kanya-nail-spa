/**
 * Events.ts — tiny typed pub/sub bus (spec §19) used to decouple systems
 * (`crystal.collected`, `player.crashed`, `powerup.activated`, …).
 */

import type { GameState } from './StateMachine';
import type { RunSummary } from '../integrations/RewardsBridge';

/** Every event the game can emit, with its payload shape. */
export interface GameEvents {
  'state.changed': { from: GameState; to: GameState };

  'run.started': { runId: string; tutorial: boolean };
  'run.ended': { summary: RunSummary };

  'player.crashed': { cause: string; distance: number };
  'player.lane.changed': { from: number; to: number };
  'player.jumped': { fromBuffer: boolean };
  'player.landed': Record<string, never>;
  'player.slide.started': Record<string, never>;
  'player.slide.ended': Record<string, never>;
  'player.fastfall': Record<string, never>;

  'crystal.collected': { value: number; streak: number; x: number; y: number; z: number };
  'score.changed': { score: number; delta: number; source: string };
  'nearmiss': { obstacleType: string; x: number; y: number; z: number };

  'powerup.collected': { type: string };
  'powerup.activated': { type: string; durationS: number };
  'powerup.extended': { type: string; remainingS: number };
  'powerup.expiring': { type: string };
  'powerup.expired': { type: string };
  'powerup.replaced': { from: string; to: string };

  'environment.changed': { from: string; to: string };
  'milestone': { id: string; meta?: object };

  'revive.offered': Record<string, never>;
  'revive.used': Record<string, never>;
  'revive.declined': Record<string, never>;

  'tutorial.prompt': { action: 'jump' | 'slide' | 'lane' | 'fastfall' };
  'settings.changed': { key: string; value: unknown };

  /** Adaptive quality stepped down/up (debug + telemetry visibility). */
  'quality.changed': { level: number };
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();

  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<EventName>);
    return () => this.off(event, handler);
  }

  off<K extends EventName>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as Handler<EventName>);
  }

  emit<K extends EventName>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<K>)(payload);
    }
  }
}

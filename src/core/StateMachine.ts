/**
 * StateMachine — finite state machine for screens/modes (spec §19).
 * Explicit transition table with enter/exit hooks; invalid transitions log
 * and no-op.
 */

export const GameState = {
  Boot: 'BOOT',
  AgeGate: 'AGE_GATE',
  /** Terminal state when the age gate is refused. */
  Blocked: 'BLOCKED',
  Menu: 'MENU',
  Tutorial: 'TUTORIAL',
  Playing: 'PLAYING',
  Paused: 'PAUSED',
  Revive: 'REVIVE',
  GameOver: 'GAMEOVER',
} as const;

export type GameState = (typeof GameState)[keyof typeof GameState];

type Hook = (from: GameState, to: GameState) => void;

const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  [GameState.Boot]: [GameState.AgeGate],
  [GameState.AgeGate]: [GameState.Menu, GameState.Blocked],
  [GameState.Blocked]: [], // terminal — COMPLIANCE: refusing the gate blocks play
  [GameState.Menu]: [GameState.Tutorial, GameState.Playing],
  [GameState.Tutorial]: [GameState.Playing, GameState.Paused, GameState.Revive, GameState.GameOver],
  [GameState.Playing]: [GameState.Paused, GameState.Revive, GameState.GameOver],
  [GameState.Paused]: [GameState.Playing, GameState.Tutorial, GameState.Menu],
  [GameState.Revive]: [GameState.Playing, GameState.GameOver],
  [GameState.GameOver]: [GameState.Playing, GameState.Tutorial, GameState.Menu],
};

export class StateMachine {
  private state: GameState = GameState.Boot;
  private enterHooks = new Map<GameState, Hook[]>();
  private exitHooks = new Map<GameState, Hook[]>();
  private changeListeners: Hook[] = [];

  get current(): GameState {
    return this.state;
  }

  /** True while the simulation should advance (tutorial plays like a run). */
  get isRunning(): boolean {
    return this.state === GameState.Playing || this.state === GameState.Tutorial;
  }

  canTransition(to: GameState): boolean {
    return TRANSITIONS[this.state].includes(to);
  }

  /** Attempts a transition; invalid ones warn and no-op (spec §19). */
  transition(to: GameState): boolean {
    if (!this.canTransition(to)) {
      console.warn(`[FSM] invalid transition ${this.state} → ${to} (ignored)`);
      return false;
    }
    const from = this.state;
    for (const hook of this.exitHooks.get(from) ?? []) hook(from, to);
    this.state = to;
    for (const hook of this.enterHooks.get(to) ?? []) hook(from, to);
    for (const hook of this.changeListeners) hook(from, to);
    return true;
  }

  onEnter(state: GameState, hook: Hook): void {
    const list = this.enterHooks.get(state) ?? [];
    list.push(hook);
    this.enterHooks.set(state, list);
  }

  onExit(state: GameState, hook: Hook): void {
    const list = this.exitHooks.get(state) ?? [];
    list.push(hook);
    this.exitHooks.set(state, list);
  }

  /** Fires after every successful transition (used to bridge onto the EventBus). */
  onChange(hook: Hook): void {
    this.changeListeners.push(hook);
  }
}

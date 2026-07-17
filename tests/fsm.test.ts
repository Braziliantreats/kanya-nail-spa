/** State machine — explicit transitions; invalid ones no-op (spec §19). */
import { describe, expect, it } from 'vitest';
import { GameState, StateMachine } from '../src/core/StateMachine';

describe('state machine', () => {
  it('walks the happy path boot → menu → run → pause → resume → crash → revive → game over', () => {
    const fsm = new StateMachine();
    expect(fsm.current).toBe(GameState.Boot);
    expect(fsm.transition(GameState.AgeGate)).toBe(true);
    expect(fsm.transition(GameState.Menu)).toBe(true);
    expect(fsm.transition(GameState.Playing)).toBe(true);
    expect(fsm.transition(GameState.Paused)).toBe(true);
    expect(fsm.transition(GameState.Playing)).toBe(true);
    expect(fsm.transition(GameState.Revive)).toBe(true);
    expect(fsm.transition(GameState.GameOver)).toBe(true);
    expect(fsm.transition(GameState.Playing)).toBe(true); // retry
  });

  it('rejects invalid transitions without changing state', () => {
    const fsm = new StateMachine();
    expect(fsm.transition(GameState.Playing)).toBe(false); // BOOT → PLAYING invalid
    expect(fsm.current).toBe(GameState.Boot);
  });

  it('BLOCKED is terminal (age gate refusal blocks play — spec §2)', () => {
    const fsm = new StateMachine();
    fsm.transition(GameState.AgeGate);
    fsm.transition(GameState.Blocked);
    for (const target of Object.values(GameState)) {
      expect(fsm.canTransition(target)).toBe(false);
    }
  });

  it('fires enter/exit hooks in order', () => {
    const fsm = new StateMachine();
    const calls: string[] = [];
    fsm.onExit(GameState.Boot, () => calls.push('exit-boot'));
    fsm.onEnter(GameState.AgeGate, () => calls.push('enter-gate'));
    fsm.onChange((from, to) => calls.push(`change:${from}->${to}`));
    fsm.transition(GameState.AgeGate);
    expect(calls).toEqual(['exit-boot', 'enter-gate', 'change:BOOT->AGE_GATE']);
  });

  it('isRunning covers PLAYING and TUTORIAL only', () => {
    const fsm = new StateMachine();
    fsm.transition(GameState.AgeGate);
    fsm.transition(GameState.Menu);
    expect(fsm.isRunning).toBe(false);
    fsm.transition(GameState.Tutorial);
    expect(fsm.isRunning).toBe(true);
    fsm.transition(GameState.Paused);
    expect(fsm.isRunning).toBe(false);
  });
});

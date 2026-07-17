/**
 * PauseScreen (spec §14) — shown over the frozen simulation.
 * The freeze is real: the FSM leaves PLAYING, so Game.tick skips all sim
 * updates while this overlay is up.
 */

import { button, el } from './dom';
import { UIScreen } from './ScreenManager';

export interface PauseCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export class PauseScreen extends UIScreen {
  constructor(callbacks: PauseCallbacks) {
    super('screen-pause');
    const panel = el('div', 'panel pause-panel');
    panel.append(
      el('h2', 'panel-title', 'Paused'),
      button('btn', 'Resume', callbacks.onResume),
      button('btn btn-ghost', 'Restart run', callbacks.onRestart),
      button('btn btn-ghost', 'Settings', callbacks.onSettings),
      button('btn btn-ghost', 'Quit to menu', callbacks.onQuit),
    );
    this.el.appendChild(panel);
  }
}

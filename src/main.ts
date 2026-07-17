/**
 * main.ts — bootstrap (spec §19): styles, age gate, DI of bridges/providers.
 * The host page can instead import { Game } and call Game.init with its own
 * RewardsBridge / StorageProvider / Telemetry / AgeGate implementations.
 */

import './ui/styles.css';
import { Game } from './Game';

try {
  const game = Game.init({});
  // ?debug=1 exposes the instance for the browser test harness + tuning.
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    (window as unknown as Record<string, unknown>).__crystalRush = game;
  }
} catch (err) {
  console.error('[CrystalRush] fatal boot error', err);
  const el = document.createElement('div');
  el.className = 'fatal-error';
  el.textContent = 'Something went wrong starting the game. Please refresh to try again.';
  document.body.appendChild(el);
}

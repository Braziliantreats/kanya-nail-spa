/**
 * MenuScreen — main menu (spec §14): Play, Character/Environment select,
 * Settings, high score + streak display; the idle character animates in the
 * 3D scene behind it. (Missions button arrives with the progression phase.)
 */

import { Config } from '../core/Config';
import type { GameStorage } from '../core/Storage';
import { button, el, fmt } from './dom';
import { UIScreen } from './ScreenManager';

export interface MenuCallbacks {
  onPlay: () => void;
  onCharacters: () => void;
  onEnvironments: () => void;
  onSettings: () => void;
  onMissions?: () => void;
}

export class MenuScreen extends UIScreen {
  private bestEl: HTMLElement;
  private crystalsEl: HTMLElement;
  private streakEl: HTMLElement;
  private navRow: HTMLElement;

  constructor(
    private storage: GameStorage,
    callbacks: MenuCallbacks,
  ) {
    super('screen-menu');

    const title = el('h1', 'menu-title', 'CRYSTAL RUSH');
    const tag = el('div', 'menu-tag', 'Run. Dodge. Collect.');

    const stats = el('div', 'menu-stats');
    this.bestEl = this.stat(stats, 'Best');
    this.crystalsEl = this.stat(stats, 'Crystals');
    this.streakEl = this.stat(stats, 'Streak');

    const play = button('btn btn-play', 'PLAY', callbacks.onPlay, 'Start run');

    this.navRow = el('div', 'menu-nav');
    this.navRow.append(
      button('btn btn-ghost', 'Characters', callbacks.onCharacters),
      button('btn btn-ghost', 'Environments', callbacks.onEnvironments),
      button('btn btn-ghost', 'Settings', callbacks.onSettings),
    );

    const spacer = el('div', 'menu-spacer'); // keeps the idle character visible
    this.el.append(title, tag, stats, spacer, play, this.navRow);
  }

  /** Progression phase injects the Missions entry here. */
  addNavButton(label: string, onClick: () => void): void {
    this.navRow.appendChild(button('btn btn-ghost', label, onClick));
  }

  private stat(parent: HTMLElement, label: string): HTMLElement {
    const box = el('div', 'menu-stat');
    const value = el('div', 'menu-stat-value', '0');
    box.append(value, el('div', 'menu-stat-label', label));
    parent.appendChild(box);
    return value;
  }

  override onShow(): void {
    const keys = Config.storage.keys;
    this.bestEl.textContent = fmt(this.storage.getJSON<number>(keys.highScore, 0));
    this.crystalsEl.textContent = `◆ ${fmt(this.storage.getJSON<number>(keys.crystalsTotal, 0))}`;
    const streak = this.storage.getJSON<{ days?: number }>(keys.streak, {});
    this.streakEl.textContent = `${streak.days ?? 0}d`;
  }
}

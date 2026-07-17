/**
 * SelectScreens — character + environment card grids with lock states and
 * unlock requirements (spec §14). Cosmetic unlocks by crystal totals, no pay
 * (spec §8). COMPLIANCE: characters are adult-audience stylized creatures.
 */

import { Config } from '../core/Config';
import type { GameStorage } from '../core/Storage';
import { CHARACTER_ORDER, CHARACTERS } from '../data/characters';
import { ENVIRONMENT_ORDER, ENVIRONMENTS } from '../data/environments';
import { button, el, fmt } from './dom';
import { UIScreen } from './ScreenManager';

interface CardDef {
  id: string;
  name: string;
  blurb: string;
  unlockCrystals: number;
  swatch: string; // css background
}

abstract class CardSelectScreen extends UIScreen {
  private grid: HTMLElement;

  constructor(
    title: string,
    className: string,
    protected storage: GameStorage,
    private onBack: () => void,
  ) {
    super(className);
    const panel = el('div', 'panel select-panel');
    panel.appendChild(el('h2', 'panel-title', title));
    this.grid = el('div', 'card-grid');
    panel.append(this.grid, button('btn', 'Back', () => this.onBack()));
    this.el.appendChild(panel);
  }

  protected abstract cards(): CardDef[];
  protected abstract selectedId(): string;
  protected abstract select(id: string): void;

  override onShow(): void {
    this.render();
  }

  private render(): void {
    const totals = this.storage.getJSON<number>(Config.storage.keys.crystalsTotal, 0);
    this.grid.textContent = '';
    for (const def of this.cards()) {
      const unlocked = totals >= def.unlockCrystals;
      const selected = this.selectedId() === def.id;
      const card = el('button', `select-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`);
      const swatch = el('div', 'card-swatch');
      swatch.style.background = def.swatch;
      card.append(
        swatch,
        el('div', 'card-name', def.name),
        el('div', 'card-blurb', def.blurb),
        el(
          'div',
          'card-status',
          unlocked ? (selected ? 'SELECTED' : 'Tap to select') : `Locked · ◆ ${fmt(def.unlockCrystals)}`,
        ),
      );
      if (unlocked && !selected) {
        card.addEventListener('click', () => {
          this.select(def.id);
          this.render();
        });
      } else {
        (card as HTMLButtonElement).disabled = !unlocked;
      }
      this.grid.appendChild(card);
    }
  }
}

export class CharacterScreen extends CardSelectScreen {
  constructor(
    storage: GameStorage,
    onBack: () => void,
    private getSelected: () => string,
    private onSelect: (id: string) => void,
  ) {
    super('Characters', 'screen-characters', storage, onBack);
  }

  protected cards(): CardDef[] {
    return CHARACTER_ORDER.map((id) => {
      const c = CHARACTERS[id];
      const p = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
      return {
        id: c.id,
        name: c.name,
        blurb: c.blurb,
        unlockCrystals: c.unlockCrystals,
        swatch: `linear-gradient(135deg, ${p(c.palette.primary)}, ${p(c.palette.glow)})`,
      };
    });
  }

  protected selectedId(): string {
    return this.getSelected();
  }

  protected select(id: string): void {
    this.onSelect(id);
  }
}

export class EnvironmentScreen extends CardSelectScreen {
  constructor(
    storage: GameStorage,
    onBack: () => void,
    private getSelected: () => string,
    private onSelect: (id: string) => void,
  ) {
    super('Environments', 'screen-environments', storage, onBack);
  }

  protected cards(): CardDef[] {
    return ENVIRONMENT_ORDER.map((id) => {
      const t = ENVIRONMENTS[id];
      const p = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
      return {
        id: t.id,
        name: t.name,
        blurb: '',
        unlockCrystals: t.unlockCrystals,
        swatch: `linear-gradient(160deg, ${p(t.sky)}, ${p(t.ground)} 60%, ${p(t.laneLine)})`,
      };
    });
  }

  protected selectedId(): string {
    return this.getSelected();
  }

  protected select(id: string): void {
    this.onSelect(id);
  }
}

/**
 * ProgressionSystem — daily streaks, rotating missions, unlock announcements
 * (spec §8). Everything persists through GameStorage; every milestone flows
 * to the RewardsBridge via the 'milestone' bus event (Game forwards it).
 * Cosmetic only, no pay.
 */

import { Config } from '../core/Config';
import type { EventBus } from '../core/Events';
import type { GameStorage } from '../core/Storage';
import type { RunSummary } from '../integrations/RewardsBridge';
import { CHARACTERS } from '../data/characters';
import { ENVIRONMENTS } from '../data/environments';
import missionsJson from '../data/missions.json';

export interface MissionDef {
  id: string;
  label: string;
  type: 'crystals-total' | 'crystals-single-run' | 'distance-single-run' | 'nearmiss-total' | 'powerup-use';
  target: number;
  reward: number;
  powerup?: string;
}

const MISSION_DEFS = missionsJson as MissionDef[];

interface ActiveMission {
  id: string;
  progress: number;
}

interface MissionState {
  active: ActiveMission[];
  nextIdx: number;
  completed: string[];
}

interface StreakState {
  days: number;
  last: string; // YYYY-MM-DD
}

export interface MissionView {
  def: MissionDef;
  progress: number;
  target: number;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class ProgressionSystem {
  private missions: MissionState;
  private streak: StreakState;
  /** Per-run counters for single-run mission types. */
  private runCrystals = 0;
  private runDistance = 0;

  constructor(
    private storage: GameStorage,
    private bus: EventBus,
    /** Toast/feedback hook (HUD popup in-run, menu toast otherwise). */
    private onToast: (text: string) => void,
  ) {
    this.missions = storage.getJSON<MissionState>(Config.storage.keys.missions, {
      active: [],
      nextIdx: 0,
      completed: [],
    });
    this.streak = storage.getJSON<StreakState>(Config.storage.keys.streak, { days: 0, last: '' });
    this.fillMissionSlots();
    this.persistMissions(); // first boot: make the initial slots inspectable

    bus.on('crystal.collected', () => {
      this.runCrystals += 1;
      this.bump('crystals-total', 1);
      this.bumpSingleRun('crystals-single-run', this.runCrystals);
    });
    bus.on('nearmiss', () => this.bump('nearmiss-total', 1));
    bus.on('powerup.activated', ({ type }) => this.bumpPowerup(type));
  }

  // ------------------------------------------------------------ daily streak

  /** Called when a run starts — consecutive-day plays escalate bonuses. */
  onRunStarted(): void {
    this.runCrystals = 0;
    this.runDistance = 0;

    const today = dayKey(new Date());
    if (this.streak.last === today) return; // already counted today
    const yesterday = dayKey(new Date(Date.now() - 86_400_000));
    this.streak.days = this.streak.last === yesterday ? this.streak.days + 1 : 1;
    this.streak.last = today;
    this.storage.setJSON(Config.storage.keys.streak, this.streak);

    const bonuses = Config.progression.streakBonuses;
    const bonus = bonuses[Math.min(this.streak.days - 1, bonuses.length - 1)];
    this.awardCrystals(bonus);
    this.bus.emit('milestone', { id: 'daily_streak', meta: { days: this.streak.days, bonus } });
    this.onToast(`Day ${this.streak.days} streak! +${bonus} ◆`);
  }

  onRunEnded(summary: RunSummary): void {
    this.runDistance = summary.distance;
    this.bumpSingleRun('distance-single-run', this.runDistance);
    this.persistMissions();
    this.checkUnlocks();
  }

  // ---------------------------------------------------------------- missions

  private fillMissionSlots(): void {
    while (this.missions.active.length < Config.progression.activeMissions) {
      const def = this.nextMissionDef();
      if (!def) break;
      this.missions.active.push({ id: def.id, progress: 0 });
    }
  }

  private nextMissionDef(): MissionDef | null {
    // Round-robin through defs, skipping completed and currently-active ones;
    // when everything has been completed once, the rotation starts over.
    for (let hop = 0; hop < MISSION_DEFS.length; hop++) {
      const def = MISSION_DEFS[(this.missions.nextIdx + hop) % MISSION_DEFS.length];
      const active = this.missions.active.some((m) => m.id === def.id);
      const done = this.missions.completed.includes(def.id);
      if (!active && !done) {
        this.missions.nextIdx = (this.missions.nextIdx + hop + 1) % MISSION_DEFS.length;
        return def;
      }
    }
    if (this.missions.completed.length >= MISSION_DEFS.length - this.missions.active.length) {
      this.missions.completed = []; // full rotation — start again
      return this.nextMissionDef();
    }
    return null;
  }

  private defOf(id: string): MissionDef | undefined {
    return MISSION_DEFS.find((d) => d.id === id);
  }

  private bump(type: MissionDef['type'], amount: number): void {
    for (const m of this.missions.active) {
      const def = this.defOf(m.id);
      if (def?.type === type) {
        m.progress += amount;
        if (m.progress >= def.target) this.complete(m, def);
      }
    }
  }

  /** Single-run types: progress is the best value THIS run, not cumulative. */
  private bumpSingleRun(type: MissionDef['type'], current: number): void {
    for (const m of this.missions.active) {
      const def = this.defOf(m.id);
      if (def?.type === type && current >= def.target) this.complete(m, def);
    }
  }

  private bumpPowerup(type: string): void {
    for (const m of this.missions.active) {
      const def = this.defOf(m.id);
      if (def?.type === 'powerup-use' && def.powerup === type) {
        m.progress += 1;
        if (m.progress >= def.target) this.complete(m, def);
      }
    }
  }

  private complete(m: ActiveMission, def: MissionDef): void {
    this.missions.active = this.missions.active.filter((x) => x.id !== m.id);
    this.missions.completed.push(def.id);
    this.awardCrystals(def.reward);
    this.fillMissionSlots();
    this.persistMissions();
    this.bus.emit('milestone', { id: 'mission', meta: { missionId: def.id, reward: def.reward } });
    this.onToast(`Mission complete: ${def.label} +${def.reward} ◆`);
  }

  private persistMissions(): void {
    this.storage.setJSON(Config.storage.keys.missions, this.missions);
  }

  /** Views for the missions screen. Single-run types show live run progress. */
  missionViews(): MissionView[] {
    return this.missions.active.flatMap((m) => {
      const def = this.defOf(m.id);
      if (!def) return [];
      let progress = m.progress;
      if (def.type === 'distance-single-run') progress = this.runDistance;
      if (def.type === 'crystals-single-run') progress = this.runCrystals;
      return [{ def, progress: Math.min(progress, def.target), target: def.target }];
    });
  }

  get streakDays(): number {
    return this.streak.days;
  }

  // ----------------------------------------------------------------- unlocks

  private awardCrystals(amount: number): void {
    const key = Config.storage.keys.crystalsTotal;
    this.storage.setJSON(key, this.storage.getJSON<number>(key, 0) + amount);
    this.checkUnlocks();
  }

  /** Announces newly-reached crystal thresholds (characters + environments). */
  private checkUnlocks(): void {
    const total = this.storage.getJSON<number>(Config.storage.keys.crystalsTotal, 0);
    const announced = this.storage.getJSON<string[]>(Config.storage.keys.unlocks, []);
    const candidates = [
      ...Object.values(CHARACTERS).map((c) => ({ id: c.id, name: c.name, need: c.unlockCrystals })),
      ...Object.values(ENVIRONMENTS).map((e) => ({ id: e.id, name: e.name, need: e.unlockCrystals })),
    ];
    let changed = false;
    for (const c of candidates) {
      if (c.need > 0 && total >= c.need && !announced.includes(c.id)) {
        announced.push(c.id);
        changed = true;
        this.bus.emit('milestone', { id: 'unlock', meta: { unlockId: c.id } });
        this.onToast(`${c.name} unlocked!`);
      }
    }
    if (changed) this.storage.setJSON(Config.storage.keys.unlocks, announced);
  }
}

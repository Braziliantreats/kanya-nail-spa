/**
 * Game.ts — orchestrator + update loop (spec §19).
 *
 * Owns the renderer, scene, state machine, event bus, and (as phases land)
 * the gameplay systems. All integrations are dependency-injected at
 * `Game.init({...})` with working defaults (spec §3, §17).
 */

import * as THREE from 'three';
import {
  applyConfigOverrides,
  Config,
  type DeepPartial,
  type GameConfig,
} from './core/Config';
import { EventBus } from './core/Events';
import { GameState, StateMachine } from './core/StateMachine';
import { Loop } from './core/Loop';
import { detectStorageProvider, GameStorage, type StorageProvider } from './core/Storage';
import { GameRenderer } from './render/Renderer';
import { ToonMaterialFactory } from './render/ToonMaterialFactory';
import { EnvironmentSystem } from './render/Environments';
import {
  ConsoleRewardsBridge,
  DebouncedPointsEmitter,
  NoopRewardsBridge,
  type RewardsBridge,
} from './integrations/RewardsBridge';
import { ConsoleTelemetry, NoopTelemetry, type Telemetry } from './integrations/Telemetry';
import { DefaultAgeGate, type AgeGate } from './integrations/AgeGate';
import type { ReviveProvider } from './integrations/ReviveProvider';
import { DebugOverlay } from './ui/DebugOverlay';
import { LegalFooter } from './ui/LegalFooter';
import { InputSystem } from './systems/InputSystem';
import { MovementSystem } from './systems/MovementSystem';
import { CameraSystem } from './systems/CameraSystem';
import { SpawnSystem } from './systems/SpawnSystem';
import { CollisionSystem } from './systems/CollisionSystem';
import { ScoreSystem } from './systems/ScoreSystem';
import { PowerupSystem } from './systems/PowerupSystem';
import { TutorialSystem } from './systems/TutorialSystem';
import { PowerupHUD } from './ui/PowerupHUD';
import { SettingsStore } from './core/Settings';
import { ScreenManager } from './ui/ScreenManager';
import { MenuScreen } from './ui/MenuScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { CharacterScreen, EnvironmentScreen } from './ui/SelectScreens';
import { PauseScreen } from './ui/PauseScreen';
import { GameOverScreen } from './ui/GameOverScreen';
import { UiReviveProvider } from './ui/ReviveOverlay';
import { HUD } from './ui/HUD';
import { PlayerRig } from './render/PlayerRig';
import type { RunSummary } from './integrations/RewardsBridge';

export interface GameInitOptions {
  /** Element the WebGL canvas mounts into (default #game-container). */
  container?: HTMLElement;
  /** Element the DOM UI overlay mounts into (default #ui-root). */
  uiRoot?: HTMLElement;
  rewardsBridge?: RewardsBridge;
  telemetry?: Telemetry;
  storageProvider?: StorageProvider;
  ageGate?: AgeGate;
  reviveProvider?: ReviveProvider;
  /** Deep-partial overrides for every tunable (incl. config.legal.*). */
  config?: DeepPartial<GameConfig>;
}

/** Mutable per-run state shared with systems (one object, reused per run). */
export interface RunState {
  runId: string;
  tutorial: boolean;
  speed: number;
  distance: number;
  elapsedS: number;
  coins: number;
  score: number;
  nearMisses: number;
  powerupsUsed: Record<string, number>;
  tier: number;
  reviveUsed: boolean;
}

let runCounter = 0;
function newRunId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `run-${Date.now()}-${++runCounter}`;
  }
}

export class Game {
  readonly bus = new EventBus();
  readonly fsm = new StateMachine();

  readonly rewardsBridge: RewardsBridge;
  readonly telemetry: Telemetry;
  reviveProvider!: ReviveProvider;
  private injectedReviveProvider: ReviveProvider | null;
  readonly storage: GameStorage;
  settings!: SettingsStore;
  private ageGate: AgeGate;

  readonly scene = new THREE.Scene();
  private renderer!: GameRenderer;
  readonly materials = new ToonMaterialFactory();
  private environment!: EnvironmentSystem;

  private loop!: Loop;
  private debugOverlay!: DebugOverlay;
  /** Kept public so the settings screen can refresh() after live config edits. */
  legalFooter!: LegalFooter;
  readonly pointsEmitter: DebouncedPointsEmitter;

  input!: InputSystem;
  movement!: MovementSystem;
  cameraSystem!: CameraSystem;
  playerRig!: PlayerRig;
  spawn!: SpawnSystem;
  collision!: CollisionSystem;
  score!: ScoreSystem;
  powerups!: PowerupSystem;
  private powerupHUD!: PowerupHUD;
  tutorial!: TutorialSystem;
  screens!: ScreenManager;
  hud!: HUD;
  private menuScreen!: MenuScreen;
  private sessionTimeS = 0;
  /** Post-revive invincibility window (spec §15). */
  private reviveGraceS = 0;
  selectedCharacter = 'sprocket';
  selectedEnvironment = 'subway';

  readonly run: RunState = {
    runId: '',
    tutorial: false,
    speed: 0,
    distance: 0,
    elapsedS: 0,
    coins: 0,
    score: 0,
    nearMisses: 0,
    powerupsUsed: {},
    tier: 0,
    reviveUsed: false,
  };

  /** Adaptive quality level (0 = full), stepped by the perf governor (§18). */
  qualityLevel = 0;

  private fpsFrames = 0;
  private fpsAccumS = 0;

  private container: HTMLElement;
  private uiRoot: HTMLElement;

  /** Spec §3 entry point: `Game.init({ rewardsBridge })`. */
  static init(options: GameInitOptions = {}): Game {
    const game = new Game(options);
    void game.boot();
    return game;
  }

  constructor(options: GameInitOptions = {}) {
    // Config overrides land before anything reads Config.
    if (options.config) applyConfigOverrides(options.config);

    this.container =
      options.container ?? (document.getElementById('game-container') as HTMLElement);
    this.uiRoot = options.uiRoot ?? (document.getElementById('ui-root') as HTMLElement);

    // DI with working defaults: console implementations in dev so integrators
    // can watch the event flow; silent no-ops in production embeds (spec §3).
    this.rewardsBridge =
      options.rewardsBridge ?? (import.meta.env.DEV ? new ConsoleRewardsBridge() : new NoopRewardsBridge());
    this.telemetry =
      options.telemetry ?? (import.meta.env.DEV ? new ConsoleTelemetry() : new NoopTelemetry());
    // Resolved in boot(): defaults to the UI countdown overlay (spec §15);
    // hosts inject their own (e.g. rewarded-action gate) here.
    this.injectedReviveProvider = options.reviveProvider ?? null;

    this.storage = new GameStorage(
      detectStorageProvider(options.storageProvider),
      Config.storage.prefix,
    );
    this.ageGate = options.ageGate ?? new DefaultAgeGate(this.storage, this.uiRoot);
    this.pointsEmitter = new DebouncedPointsEmitter(this.rewardsBridge, Config.score.pointsDebounceMs);
  }

  async boot(): Promise<void> {
    await this.storage.init(Object.values(Config.storage.keys));

    this.settings = new SettingsStore(this.storage, this.bus);
    this.reviveProvider = this.injectedReviveProvider ?? new UiReviveProvider(this.uiRoot);

    // Persisted cosmetic selection (character + environment).
    const sel = this.storage.getJSON<{ character?: string; environment?: string }>(
      Config.storage.keys.selection,
      {},
    );
    this.selectedCharacter = sel.character ?? 'sprocket';
    this.selectedEnvironment = sel.environment ?? 'subway';

    this.renderer = new GameRenderer(this.container);
    const cam = this.renderer.camera;
    const { offset, lookAt } = Config.camera;
    cam.position.set(offset.x, offset.y, offset.z);
    cam.lookAt(lookAt.x, lookAt.y, lookAt.z);

    this.environment = new EnvironmentSystem(this.scene, this.materials);
    this.environment.init(this.selectedEnvironment);

    this.movement = new MovementSystem(this.bus);
    this.playerRig = new PlayerRig(this.scene, this.materials, this.bus, this.selectedCharacter);
    this.cameraSystem = new CameraSystem(cam);
    this.spawn = new SpawnSystem(this.scene, this.materials);
    this.collision = new CollisionSystem(this.bus);
    this.score = new ScoreSystem(this.bus, this.pointsEmitter);
    this.powerups = new PowerupSystem(this.scene, this.materials, this.bus, this.movement);
    this.powerupHUD = new PowerupHUD(this.uiRoot, () => this.powerups.deployGlider());

    // Power-up wiring (spec §7): stacking bonus refunds, safe-path placement,
    // crash shields, and the Double-Up score multiplier.
    this.powerups.onBonus = (pts, source) => this.score.grant(this.run, pts, source);
    this.spawn.onChunkPlaced = (chunk, entryZ) => this.powerups.maybePlacePickup(chunk, entryZ);
    // Shield chain: revive grace first (free), then power-ups (Glider is
    // consumable — it must not break during the grace window).
    this.collision.shieldProvider = (cause) =>
      this.reviveGraceS > 0 || this.powerups.absorbCrash(cause);
    this.score.multiplierProvider = () => this.powerups.scoreMult;

    this.bus.on('player.crashed', ({ cause, distance }) => this.onCrash(cause, distance));
    this.bus.on('powerup.activated', ({ type, durationS }) => {
      this.run.powerupsUsed[type] = (this.run.powerupsUsed[type] ?? 0) + 1;
      this.telemetry.track('powerup_used', { type, durationS });
      if (type === 'dash') this.cameraSystem.dashKick();
      if (type === 'glider') this.playerRig.setGlider(true);
    });
    this.bus.on('powerup.extended', ({ type }) => {
      if (type === 'dash') this.cameraSystem.dashKick();
    });
    this.bus.on('powerup.expired', ({ type }) => {
      if (type === 'glider') this.playerRig.setGlider(false);
    });

    this.input = new InputSystem(this.container);
    this.input.onPauseKey = () => {
      if (this.fsm.isRunning) {
        this.pause();
      } else if (this.fsm.current === GameState.Paused) {
        this.resume();
      }
    };
    this.input.onGliderKey = () => {
      if (this.fsm.isRunning) this.powerups.deployGlider();
    };

    this.legalFooter = new LegalFooter(this.uiRoot);
    this.debugOverlay = new DebugOverlay(this.uiRoot);
    this.debugOverlay.setPoolStatsProvider(() => this.spawn.statsLine());

    this.buildScreens();
    this.applySettingsSideEffects();

    // Bridge FSM transitions onto the event bus for any listener.
    this.fsm.onChange((from, to) => this.bus.emit('state.changed', { from, to }));

    this.loop = new Loop(this.tick, () => {
      // Tab hidden mid-run → hard pause so the sim never jumps (spec §18).
      if (this.fsm.isRunning) this.fsm.transition(GameState.Paused);
    });
    this.loop.start();

    this.telemetry.track('session_start', { storage: this.storage.providerName });
    this.rewardsBridge.onSessionStart({ storage: this.storage.providerName });

    // COMPLIANCE: age gate before anything playable (spec §2).
    this.fsm.transition(GameState.AgeGate);
    const ofAge = await this.ageGate.verify();
    this.fsm.transition(ofAge ? GameState.Menu : GameState.Blocked);
    if (ofAge) this.screens.show('menu');
  }

  // ------------------------------------------------------------ UI wiring

  private buildScreens(): void {
    this.screens = new ScreenManager(this.uiRoot);
    this.hud = new HUD(this.uiRoot, this.bus, () => this.pause());
    this.tutorial = new TutorialSystem(this.hud, this.bus);

    this.menuScreen = new MenuScreen(this.storage, {
      onPlay: () => {
        const firstRun = this.storage.getString(Config.storage.keys.tutorialDone) !== '1';
        this.startRun(firstRun);
      },
      onCharacters: () => this.screens.show('characters'),
      onEnvironments: () => this.screens.show('environments'),
      onSettings: () => this.screens.show('settings', { backTo: 'menu' }),
    });
    this.screens.register('menu', this.menuScreen);

    this.screens.register(
      'settings',
      new SettingsScreen(
        this.settings,
        (backTo) => this.screens.show(backTo),
        () => this.resetAllData(),
      ),
    );

    this.screens.register(
      'characters',
      new CharacterScreen(
        this.storage,
        () => this.screens.show('menu'),
        () => this.selectedCharacter,
        (id) => this.setCharacter(id),
      ),
    );
    this.screens.register(
      'environments',
      new EnvironmentScreen(
        this.storage,
        () => this.screens.show('menu'),
        () => this.selectedEnvironment,
        (id) => this.setEnvironment(id),
      ),
    );

    this.screens.register(
      'pause',
      new PauseScreen({
        onResume: () => this.resume(),
        onRestart: () => this.startRun(false),
        onSettings: () => this.screens.show('settings', { backTo: 'pause' }),
        onQuit: () => this.quitToMenu(),
      }),
    );

    this.screens.register(
      'gameover',
      new GameOverScreen(
        () => this.startRun(false),
        () => this.quitToMenu(),
      ),
    );

    // HUD visibility follows the run states.
    this.fsm.onEnter(GameState.Playing, () => this.hud.setVisible(true));
    this.fsm.onEnter(GameState.Tutorial, () => this.hud.setVisible(true));
    this.fsm.onEnter(GameState.Menu, () => {
      this.hud.setVisible(false);
      this.input.enabled = false;
    });
    this.fsm.onEnter(GameState.GameOver, () => this.hud.setVisible(false));
  }

  private applySettingsSideEffects(): void {
    const apply = (): void => {
      document.body.classList.toggle('high-contrast', this.settings.get('highContrast'));
      document.body.classList.toggle('reduced-motion', this.settings.get('reducedMotion'));
      this.cameraSystem.reducedMotion = this.settings.get('reducedMotion');
    };
    apply();
    this.bus.on('settings.changed', ({ key, value }) => {
      apply();
      this.telemetry.track('settings_changed', { key, value: value as string | number | boolean });
    });
  }

  pause(): void {
    if (!this.fsm.isRunning) return;
    if (this.fsm.transition(GameState.Paused)) this.screens.show('pause');
  }

  resume(): void {
    if (this.fsm.current !== GameState.Paused) return;
    if (this.fsm.transition(this.run.tutorial ? GameState.Tutorial : GameState.Playing)) {
      this.screens.hideAll();
      this.input.clear();
    }
  }

  private quitToMenu(): void {
    if (this.fsm.current === GameState.Paused) {
      // A paused-and-quit run still reports its summary (crashCause 'quit').
      this.input.enabled = false;
      this.finalizeRun('quit');
    }
    if (this.fsm.canTransition(GameState.Menu)) this.fsm.transition(GameState.Menu);
    this.screens.show('menu');
  }

  private resetAllData(): void {
    this.storage.clear(Object.values(Config.storage.keys));
    window.location.reload();
  }

  setCharacter(id: string): void {
    if (id === this.selectedCharacter) return;
    this.selectedCharacter = id;
    this.persistSelection();
    // Swap the rig in place (menu idle keeps animating the new character).
    this.playerRig.dispose();
    this.playerRig = new PlayerRig(this.scene, this.materials, this.bus, id);
    this.bus.emit('milestone', { id: 'character_selected', meta: { character: id } });
  }

  setEnvironment(id: string): void {
    if (id === this.selectedEnvironment) return;
    this.selectedEnvironment = id;
    this.persistSelection();
    this.environment.setThemeById(id);
  }

  private persistSelection(): void {
    this.storage.setJSON(Config.storage.keys.selection, {
      character: this.selectedCharacter,
      environment: this.selectedEnvironment,
    });
  }

  private tick = (dt: number): void => {
    const state = this.fsm.current;
    this.sessionTimeS += dt;

    if (this.fsm.isRunning) {
      this.updateRun(dt);
    } else if (state === GameState.Menu || state === GameState.GameOver) {
      // Ambient world drift + idle character behind menu/game-over screens.
      this.environment.update(dt, Config.run.menuAmbientSpeed);
      this.playerRig.idle(dt);
      this.cameraSystem.update(dt, this.movement, 0);
    }

    this.sampleFps(dt);
    this.debugOverlay.update(dt, {
      drawCalls: this.renderer.drawCalls,
      triangles: this.renderer.triangles,
      state,
      speed: this.fsm.isRunning ? this.run.speed : 0,
      distanceM: this.run.distance,
      qualityLevel: this.qualityLevel,
    });

    this.renderer.render(this.scene);
  };

  private updateRun(dt: number): void {
    const run = this.run;
    run.elapsedS += dt;
    // Delta-time speed ramp toward the cap (spec §5).
    run.speed = Math.min(Config.run.maxSpeed, run.speed + Config.run.ramp * dt);
    // Dash multiplies the world's effective scroll speed (spec §7).
    const effSpeed = run.speed * this.powerups.speedMult;
    run.distance += effSpeed * dt;
    run.tier = this.currentTier();

    if (this.reviveGraceS > 0) this.reviveGraceS -= dt;

    this.input.update(dt);
    this.movement.update(dt, this.input);
    this.spawn.update(dt, effSpeed, run.tier);
    this.powerups.update(dt, this.spawn, effSpeed);
    this.score.update(dt, run, this.movement, this.spawn);
    this.tutorial.update(run, this.spawn);
    this.environment.update(dt, effSpeed);
    this.playerRig.update(dt, this.movement, run.speed / Config.run.maxSpeed);
    this.cameraSystem.update(dt, this.movement, effSpeed);
    this.pointsEmitter.update(dt);
    this.powerupHUD.update(dt, this.powerups.hudState());
    this.hud.update(dt, run);
    // Collision last: verdicts use this frame's final positions.
    this.collision.update(this.movement, this.spawn, run.distance);
  }

  private currentTier(): number {
    let tier = 0;
    for (const t of Config.tiers) {
      if (this.run.speed >= t.minSpeed && this.run.elapsedS >= t.minElapsedS) tier = t.tier;
    }
    return tier;
  }

  /** Resets per-run state and enters PLAYING/TUTORIAL (wired to UI later). */
  startRun(tutorial: boolean): void {
    const run = this.run;
    run.runId = newRunId();
    run.tutorial = tutorial;
    run.speed = Config.run.baseSpeed;
    run.distance = 0;
    run.elapsedS = 0;
    run.coins = 0;
    run.score = 0;
    run.nearMisses = 0;
    run.powerupsUsed = {};
    run.tier = 0;
    run.reviveUsed = false;

    this.pointsEmitter.setRun(run.runId);
    if (this.fsm.transition(tutorial ? GameState.Tutorial : GameState.Playing)) {
      this.movement.reset();
      this.score.reset();
      this.powerups.reset();
      this.powerupHUD.clear();
      this.playerRig.setGlider(false);
      this.playerRig.flickerRemainS = 0;
      this.tutorial.reset();
      this.reviveGraceS = 0;
      // Tutorial runs get extra obstacle-free runway (tier-0 first ~10s, §5).
      this.spawn.reset(tutorial ? 25 : 0);
      this.input.clear();
      this.input.enabled = true;
      this.screens.hideAll();
      this.bus.emit('run.started', { runId: run.runId, tutorial });
      this.telemetry.track('run_start', { runId: run.runId, tutorial });
    }
  }

  private async onCrash(cause: string, distance: number): Promise<void> {
    this.input.enabled = false;
    this.input.clear();
    this.cameraSystem.shake(Config.camera.shake.crashMagnitude);
    this.telemetry.track('crash', { cause, distance: Math.round(distance) });

    // Revive offer (spec §15): once per run, gated by the pluggable provider.
    const canRevive = !this.run.reviveUsed && this.fsm.canTransition(GameState.Revive);
    if (canRevive && this.fsm.transition(GameState.Revive)) {
      this.bus.emit('revive.offered', {});
      const granted = await this.reviveProvider.request();
      if (granted && this.fsm.current === GameState.Revive) {
        this.performRevive();
        return;
      }
      this.bus.emit('revive.declined', {});
    }
    this.endRunToGameOver(cause);
  }

  private performRevive(): void {
    const run = this.run;
    run.reviveUsed = true;
    run.tutorial = false; // a revived run continues as a normal run
    this.movement.softReviveReset();
    // Cleared stretch: wipe nearby hazards + spawn-free window (spec §15).
    this.spawn.clearStretch(Config.revive.spawnFreeS * run.speed + 14);
    this.reviveGraceS = Config.revive.invincibleS;
    this.playerRig.flickerRemainS = Config.revive.invincibleS;
    this.input.clear();
    this.input.enabled = true;

    if (this.fsm.transition(GameState.Playing)) {
      this.bus.emit('revive.used', {});
      this.bus.emit('milestone', { id: 'revive_used' });
      this.rewardsBridge.onMilestone('revive_used');
      this.telemetry.track('revive', { runId: run.runId, distance: Math.round(run.distance) });
    }
  }

  /** Persists results + emits summary events. State handling stays with callers. */
  private finalizeRun(crashCause: string): { summary: RunSummary; isBest: boolean } {
    const run = this.run;
    const summary: RunSummary = {
      runId: run.runId,
      distance: Math.floor(run.distance),
      coins: run.coins,
      score: Math.round(run.score),
      powerupsUsed: { ...run.powerupsUsed },
      nearMisses: run.nearMisses,
      durationMs: Math.round(run.elapsedS * 1000),
      crashCause,
    };

    const keys = Config.storage.keys;
    const prevBest = this.storage.getJSON<number>(keys.highScore, 0);
    const isBest = summary.score > prevBest;
    if (isBest) this.storage.setJSON(keys.highScore, summary.score);
    this.storage.setJSON(
      keys.crystalsTotal,
      this.storage.getJSON<number>(keys.crystalsTotal, 0) + run.coins,
    );
    this.storage.setString(keys.tutorialDone, '1');

    this.pointsEmitter.flush();
    this.bus.emit('run.ended', { summary });
    this.rewardsBridge.onRunComplete(summary);
    this.telemetry.track('run_end', { ...summary });
    return { summary, isBest };
  }

  private endRunToGameOver(crashCause: string): void {
    const result = this.finalizeRun(crashCause);
    if (this.fsm.transition(GameState.GameOver)) {
      this.screens.show('gameover', result);
    }
  }

  private sampleFps(dt: number): void {
    this.fpsFrames++;
    this.fpsAccumS += dt;
    if (this.fpsAccumS >= Config.telemetry.fpsSampleEveryS) {
      this.telemetry.track('fps_sample', {
        avgFps: Math.round(this.fpsFrames / this.fpsAccumS),
        drawCalls: this.renderer.drawCalls,
        quality: this.qualityLevel,
      });
      this.fpsFrames = 0;
      this.fpsAccumS = 0;
    }
  }

  /** Full teardown — dispose GPU resources (spec §18). */
  dispose(): void {
    this.loop.dispose();
    this.input.dispose();
    this.playerRig.dispose();
    this.powerups.dispose();
    this.spawn.dispose();
    this.environment.dispose();
    this.materials.disposeAll();
    this.renderer.dispose();
  }
}

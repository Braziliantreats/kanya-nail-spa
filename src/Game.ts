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
import { AutoReviveProvider, type ReviveProvider } from './integrations/ReviveProvider';
import { DebugOverlay } from './ui/DebugOverlay';
import { LegalFooter } from './ui/LegalFooter';
import { InputSystem } from './systems/InputSystem';
import { MovementSystem } from './systems/MovementSystem';
import { CameraSystem } from './systems/CameraSystem';
import { SpawnSystem } from './systems/SpawnSystem';
import { CollisionSystem } from './systems/CollisionSystem';
import { ScoreSystem } from './systems/ScoreSystem';
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
  readonly reviveProvider: ReviveProvider;
  readonly storage: GameStorage;
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
  private tempStartHint: HTMLElement | null = null;
  private sessionTimeS = 0;
  private crashAtS = -99;

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
    this.reviveProvider = options.reviveProvider ?? new AutoReviveProvider();

    this.storage = new GameStorage(
      detectStorageProvider(options.storageProvider),
      Config.storage.prefix,
    );
    this.ageGate = options.ageGate ?? new DefaultAgeGate(this.storage, this.uiRoot);
    this.pointsEmitter = new DebouncedPointsEmitter(this.rewardsBridge, Config.score.pointsDebounceMs);
  }

  async boot(): Promise<void> {
    await this.storage.init(Object.values(Config.storage.keys));

    this.renderer = new GameRenderer(this.container);
    const cam = this.renderer.camera;
    const { offset, lookAt } = Config.camera;
    cam.position.set(offset.x, offset.y, offset.z);
    cam.lookAt(lookAt.x, lookAt.y, lookAt.z);

    this.environment = new EnvironmentSystem(this.scene, this.materials);
    this.environment.init('subway');

    this.movement = new MovementSystem(this.bus);
    this.playerRig = new PlayerRig(this.scene, this.materials, this.bus, 'sprocket');
    this.cameraSystem = new CameraSystem(cam);
    this.spawn = new SpawnSystem(this.scene, this.materials);
    this.collision = new CollisionSystem(this.bus);
    this.score = new ScoreSystem(this.bus, this.pointsEmitter);
    this.bus.on('player.crashed', ({ cause, distance }) => this.onCrash(cause, distance));

    this.input = new InputSystem(this.container);
    this.input.onAnyInput = () => {
      // TEMP(phase 5): any input on the menu (or after a crash cooldown)
      // starts a run until the real menu/game-over screens land.
      if (this.fsm.current === GameState.Menu) {
        this.startRun(false);
      } else if (
        this.fsm.current === GameState.GameOver &&
        this.sessionTimeS - this.crashAtS > 0.7
      ) {
        this.startRun(false);
      }
    };
    this.input.onPauseKey = () => {
      if (this.fsm.isRunning) {
        this.fsm.transition(GameState.Paused);
      } else if (this.fsm.current === GameState.Paused) {
        this.fsm.transition(this.run.tutorial ? GameState.Tutorial : GameState.Playing);
      }
    };

    this.legalFooter = new LegalFooter(this.uiRoot);
    this.debugOverlay = new DebugOverlay(this.uiRoot);
    this.debugOverlay.setPoolStatsProvider(() => this.spawn.statsLine());

    // TEMP(phase 5): minimal start hint until the real menu exists.
    this.tempStartHint = document.createElement('div');
    this.tempStartHint.className = 'temp-hint';
    this.tempStartHint.textContent = 'Tap, swipe, or press Space to run — dev build';
    this.uiRoot.appendChild(this.tempStartHint);
    this.fsm.onEnter(GameState.Menu, () => {
      this.input.enabled = false;
      this.tempStartHint?.classList.remove('hidden');
    });

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
    run.distance += run.speed * dt;
    run.tier = this.currentTier();

    this.input.update(dt);
    this.movement.update(dt, this.input);
    this.spawn.update(dt, run.speed, run.tier);
    this.score.update(dt, run, this.movement, this.spawn);
    this.environment.update(dt, run.speed);
    this.playerRig.update(dt, this.movement, run.speed / Config.run.maxSpeed);
    this.cameraSystem.update(dt, this.movement, run.speed);
    this.pointsEmitter.update(dt);
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
      // Tutorial runs get extra obstacle-free runway (tier-0 first ~10s, §5).
      this.spawn.reset(tutorial ? 25 : 0);
      this.input.clear();
      this.input.enabled = true;
      this.tempStartHint?.classList.add('hidden');
      this.bus.emit('run.started', { runId: run.runId, tutorial });
      this.telemetry.track('run_start', { runId: run.runId, tutorial });
    }
  }

  private onCrash(cause: string, distance: number): void {
    this.crashAtS = this.sessionTimeS;
    this.input.enabled = false;
    this.input.clear();
    this.cameraSystem.shake(Config.camera.shake.crashMagnitude);
    this.telemetry.track('crash', { cause, distance: Math.round(distance) });

    // Revive flow arrives with the UI phase; for now every crash ends the run.
    this.endRun(cause);
  }

  private endRun(crashCause: string): void {
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

    // Baseline persistence (the progression phase formalizes totals/streaks).
    const keys = Config.storage.keys;
    const prevBest = this.storage.getJSON<number>(keys.highScore, 0);
    if (summary.score > prevBest) this.storage.setJSON(keys.highScore, summary.score);
    this.storage.setJSON(
      keys.crystalsTotal,
      this.storage.getJSON<number>(keys.crystalsTotal, 0) + run.coins,
    );

    this.pointsEmitter.flush();
    if (this.fsm.transition(GameState.GameOver)) {
      this.bus.emit('run.ended', { summary });
      this.rewardsBridge.onRunComplete(summary);
      this.telemetry.track('run_end', { ...summary });
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
    this.spawn.dispose();
    this.environment.dispose();
    this.materials.disposeAll();
    this.renderer.dispose();
  }
}

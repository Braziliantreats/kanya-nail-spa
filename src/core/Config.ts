/**
 * Config.ts — the single source of truth for EVERY tunable number in the game.
 *
 * Spec §19: "Config-driven: every tunable number lives in Config.ts. No
 * scattered magic numbers." The dispensary host can tune reward-relevant
 * values (coin value, mission rewards, streak bonuses) here without code
 * changes, and inject legal copy at init via `Game.init({ config: {...} })`.
 */

export interface DifficultyTier {
  /** Tier index (0 = tutorial-easy). */
  tier: number;
  /** Minimum world speed (u/s) before this tier can activate. */
  minSpeed: number;
  /** Min seconds elapsed before this tier can activate (tier 0 covers the first ~10s). */
  minElapsedS: number;
  /** [min, max] longitudinal gap (units) between spawned pattern chunks. */
  spawnGapRange: [number, number];
  /** Which authored pattern set this tier draws from (see data/patterns.ts). */
  allowedPatternSet: 'basic' | 'easy' | 'medium' | 'hard';
}

export const Config = {
  lanes: {
    count: 3,
    /** Spec §5: LANE_WIDTH = 2.0 — the SAME constant for player, coins and
     *  obstacles. Lane x positions are laneIndex(-1|0|1) * width. */
    width: 2.0,
  },

  run: {
    baseSpeed: 8, // u/s at run start (v0)
    ramp: 0.18, // u/s² — speed += ramp * dt
    maxSpeed: 22, // u/s cap (~75s to reach)
    /** Gentle world scroll behind the menu for the ambient idle scene. */
    menuAmbientSpeed: 2.5,
  },

  /** Difficulty tiers (spec §5). Highest tier whose gates pass is active. */
  tiers: [
    { tier: 0, minSpeed: 0, minElapsedS: 0, spawnGapRange: [20, 28], allowedPatternSet: 'basic' },
    { tier: 1, minSpeed: 9.5, minElapsedS: 10, spawnGapRange: [14, 20], allowedPatternSet: 'easy' },
    { tier: 2, minSpeed: 13, minElapsedS: 25, spawnGapRange: [11, 16], allowedPatternSet: 'medium' },
    { tier: 3, minSpeed: 17, minElapsedS: 45, spawnGapRange: [8.5, 13], allowedPatternSet: 'hard' },
  ] as DifficultyTier[],

  jump: {
    apexHeight: 1.8, // units
    airtimeMs: 650, // total up+down time; gravity is derived from these two
    /** Air-control fast-fall: gravity multiplier while slam is held (spec §5). */
    fastFallGravityMult: 3.2,
  },

  slide: {
    durationMs: 700,
    /** Collider height shrinks to this fraction while sliding. */
    colliderScale: 0.5,
  },

  laneChange: {
    /** Spec §5: lane changes are a tween, not a teleport — 180–200ms ease-out cubic. */
    durationMs: 190,
  },

  input: {
    bufferMs: 120, // input buffering window (spec §5)
    swipeMinPx: 24, // minimum swipe travel
    swipeMaxMs: 500, // maximum swipe duration
  },

  score: {
    distMult: 1, // points per meter
    coinValue: 10, // points per crystal — reward-relevant, host-tunable
    nearMissBonus: 25,
    /** RewardsBridge.onPointsEarned batching interval (spec §3). */
    pointsDebounceMs: 500,
  },

  nearMiss: {
    /** Lateral/vertical clearance below which a pass counts as a near-miss. */
    gapUnits: 0.35,
    /** Late-dodge window: lane change within this many ms of projected contact. */
    lateDodgeMs: 130,
    hitStopMs: 80, // brief celebratory freeze (60–100ms per spec)
    capPerObstacle: 1,
  },

  spawn: {
    /** Reaction budget (spec §6): reveal-distance / speed must stay ≥ this. */
    reactionBudgetS: 0.6,
    /** Minimum spawn-ahead distance; grows with speed to hold the budget. */
    minAheadUnits: 55,
    /** Extra margin added beyond speed * reactionBudget when placing chunks. */
    aheadMarginUnits: 14,
    /** Objects further than this behind the player are recycled to their pool. */
    despawnBehindUnits: 14,
  },

  collision: {
    /** Hitboxes are slightly smaller than visuals — forgiving (spec §6). */
    hitboxShrink: 0.85,
    /** Broad-phase: only test colliders within ±this z-window of the player. */
    zWindowUnits: 7,
  },

  player: {
    width: 1.0,
    height: 1.8,
    depth: 0.8,
  },

  powerups: {
    magnet: { durationS: 8, radius: 5.5, pullSpeed: 26 },
    doubleUp: { durationS: 10, multiplier: 2 },
    liftoff: { durationS: 6, flyHeight: 3.4, riseTimeMs: 500 },
    glider: { maxDurationS: 20, cooldownS: 12 },
    zen: { durationS: 5, floatyGravityMult: 0.5 },
    dash: { durationS: 3, speedMult: 1.45, fovKickDeg: 10 },
    /** Re-collecting an active power-up extends it, capped at base × this. */
    extensionCapMult: 1.5,
    /** Replacing an active movement power-up refunds this many points. */
    replaceRefundPoints: 50,
    /** Icon blinks + soft audio cue this many seconds before expiry. */
    expiryWarnS: 2,
  },

  revive: {
    countdownS: 3, // 3-2-1 countdown on the default revive button
    spawnFreeS: 2, // cleared stretch after revive
    invincibleS: 1.6, // flicker window after revive
    perRun: 1,
  },

  progression: {
    /** Crystal bonus per consecutive-day streak length (index = day-1, last repeats). */
    streakBonuses: [25, 50, 100, 150, 250, 400, 600],
    activeMissions: 3,
  },

  camera: {
    fovDeg: 60,
    near: 0.1,
    /** Chase offset from the player anchor (behind + above; world scrolls +z). */
    offset: { x: 0, y: 3.15, z: 5.6 },
    /** Where the camera looks, relative to the player anchor. */
    lookAt: { x: 0, y: 1.15, z: -5.5 },
    /** Soft catch-up lerp rate (per second) — never hard-parented (spec §11). */
    followLerp: 6,
    /** Lateral lookahead fraction of lane offset during lane changes. */
    lateralLookahead: 0.4,
    rollDeg: 2, // roll on lane changes
    /** Subtle FOV creep at max speed (+deg over base). */
    fovSpeedCreepDeg: 3,
    dashFov: { inMs: 150, holdMs: 250, outMs: 400 },
    shake: { crashMs: 200, crashMagnitude: 0.35 },
  },

  render: {
    pixelRatioCap: 2,
    toonSteps: 4, // gradient-map bands for MeshToonMaterial
    /** Neon glow pass — disabled automatically at quality L1+ (spec §18). */
    bloom: {
      strength: 0.75,
      radius: 0.55,
      threshold: 0.5,
    },
    adaptive: {
      /** If avg frame time exceeds this over sampleFrames, step quality down. */
      frameBudgetMs: 20,
      sampleFrames: 30,
      pixelRatioSteps: [1.0, 0.85, 0.7], // multiplied into the device ratio
      particleScaleSteps: [1.0, 0.6, 0.35],
      fogPullSteps: [1.0, 0.9, 0.78], // scales fog far (draw distance)
    },
  },

  track: {
    segmentLength: 10,
    segmentCount: 12, // pooled scrolling slabs — enough to cover fog distance
    shoulderWidth: 2.4,
  },

  environment: {
    switchEveryM: 1000, // gateway transition cadence (spec §9)
    transitionM: 60, // fog/palette lerp distance around the gateway
  },

  audio: {
    defaultMaster: 0.9,
    defaultMusic: 0.65,
    defaultSfx: 0.9,
  },

  haptics: {
    powerupMs: 30,
    nearMissPattern: [10, 30, 10] as number[],
    crashMs: 100,
  },

  particles: {
    /** Hard cap on simultaneously-live particles (scaled by adaptive quality). */
    maxLive: 900,
  },

  loop: {
    maxDeltaMs: 50, // clamp dt spikes (tab defocus) — spec §18
  },

  storage: {
    prefix: 'crystal-rush:',
    keys: {
      ageAck: 'age-ack',
      settings: 'settings',
      highScore: 'high-score',
      crystalsTotal: 'crystals-total',
      streak: 'streak',
      missions: 'missions',
      unlocks: 'unlocks',
      selection: 'selection',
      tutorialDone: 'tutorial-done',
    },
  },

  legal: {
    // COMPLIANCE: legal text is NEVER hardcoded (spec §2). These placeholders
    // exist so an unconfigured build visibly reminds the host to inject the
    // state-mandated warning + license number via Game.init({ config: ... }).
    ageLabel: 'For ages 21+',
    disclaimer: '[Host: inject your state-mandated warning via config.legal.disclaimer]',
    licenseLine: '[Host: inject your license number via config.legal.licenseLine]',
  },

  telemetry: {
    fpsSampleEveryS: 10,
  },
};

export type GameConfig = typeof Config;

/** Recursive partial for init-time overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** Deep-merges host overrides into the live Config (arrays are replaced). */
export function applyConfigOverrides(overrides: DeepPartial<GameConfig>): void {
  mergeInto(Config as Record<string, unknown>, overrides as Record<string, unknown>);
}

function mergeInto(target: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const key of Object.keys(src)) {
    const s = src[key];
    const t = target[key];
    if (
      s !== null &&
      typeof s === 'object' &&
      !Array.isArray(s) &&
      t !== null &&
      typeof t === 'object' &&
      !Array.isArray(t)
    ) {
      mergeInto(t as Record<string, unknown>, s as Record<string, unknown>);
    } else if (s !== undefined) {
      target[key] = s;
    }
  }
}

/** Derived jump physics — gravity/velocity computed from apex height + airtime. */
export function computeJumpPhysics(): { gravity: number; jumpVelocity: number } {
  const T = Config.jump.airtimeMs / 1000; // total airtime, symmetric arc
  const h = Config.jump.apexHeight;
  const gravity = (8 * h) / (T * T); // h = g(T/2)²/2  →  g = 8h/T²
  const jumpVelocity = (gravity * T) / 2;
  return { gravity, jumpVelocity };
}

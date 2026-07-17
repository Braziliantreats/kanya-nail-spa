# Crystal Rush

A production-quality HTML5/WebGL **endless runner** (Subway Surfers–style) built to feed a
dispensary **rewards/loyalty program** through clean, pluggable integration seams.

Three.js + TypeScript strict + Vite. **Zero binary assets** — every model, particle, icon,
music loop and sound effect is generated in code, so the whole game ships as a small static
bundle you can host or embed anywhere.

> **COMPLIANCE-FIRST.** The game contains **no cannabis imagery, no consumption depiction,
> no medical claims, and nothing styled for minors** — by design and by automated test
> (`tests/compliance.test.ts`). A 21+ age-gate placeholder blocks play until the host wires
> real verification, and the persistent legal footer renders host-injected warning text and
> license number only (never hardcoded).

---

## Quick start

```bash
npm install
npm run dev        # local dev server
npm run build      # production build → dist/ (static, relative paths, embeddable)
npm run preview    # serve the production build
npm test           # vitest suite (solver 10k sweep, physics, rules, compliance)
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # eslint
```

Open with `?debug=1` for the instrumentation overlay (FPS, draw calls, state, pooled object
counts, adaptive-quality level) plus a `window.__crystalRush` handle for the test harness.

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Change lane | swipe left/right | ← → or A/D |
| Jump | swipe up | ↑, W, or Space |
| Slide | swipe down | ↓ or S |
| Fast-fall (air) | swipe down while airborne | ↓ while airborne |
| Deploy Glider | tap its HUD chip | G or F |
| Pause | tap ❚❚ | Esc or P |

All schemes work simultaneously; inputs are buffered ~120 ms with jump queuing.

## What's inside

- 3-lane auto-runner, speed 8→22 u/s, four difficulty tiers, exact frame-rate-independent
  jump physics (identical arc at 30 fps and 60 fps — unit-tested)
- 18 authored obstacle patterns across 7 archetypes, validated at spawn time by a
  **solvability solver** (10,000-draw sweep at max speed passes 100%); air-control patterns
  are provably impossible without fast-fall and gated to tier 3
- Crystals (1 instanced draw call), near-miss detection with hit-stop, six power-ups with
  the full stacking/extension/expiry rule set, once-per-run revive
- 3 procedural characters, 5 environments with 1,000 m gateway transitions, synthesized
  adaptive music per environment, layered SFX, haptics
- Daily streaks, rotating missions (`src/data/missions.json`), crystal-total cosmetic
  unlocks — no pay
- Colorblind presets, high contrast, reduced motion, keyboard-only and touch-only play,
  silhouette+icon obstacle telegraphing (passes a desaturation test)
- Object pooling everywhere, instancing, zero per-frame allocation, pixel-ratio cap 2, and
  an adaptive quality governor (pixel ratio → particles → draw distance)

## Integration guide (the seams the host owns)

Everything is injected at init; every seam has a working default:

```ts
import { Game } from './src/Game';

Game.init({
  container: document.getElementById('game-container')!,
  uiRoot: document.getElementById('ui-root')!,

  // Rewards/loyalty — the ONLY bridge between gameplay and your backend.
  rewardsBridge: {
    onPointsEarned(delta, meta) {/* batched ~500ms, meta = {source, runId} */},
    onRunComplete(summary)     {/* distance, coins, score, powerupsUsed, nearMisses, durationMs */},
    onMilestone(id, meta)      {/* 'daily_streak' | 'mission' | 'unlock' | 'revive_used' | ... */},
    onSessionStart(meta)       {},
  },

  // Real age verification (spec §2). The shipped modal is a PLACEHOLDER.
  ageGate: { verify: async () => await myVerificationFlow() },

  // Storage in iframe/incognito embeds (falls back localStorage → memory).
  storageProvider: { name: 'host', get: async (k) => ..., set: async (k, v) => ..., remove: async (k) => ... },

  // Gate revives behind a rewarded action (default: 3-2-1 countdown button).
  reviveProvider: { request: async () => await showRewardedThing() },

  // Analytics — the game never bundles an SDK.
  telemetry: { track(event, data) { myAnalytics(event, data); } },

  // Tuning + MANDATED LEGAL COPY (never hardcoded):
  config: {
    legal: {
      disclaimer: 'STATE-MANDATED WARNING TEXT HERE',
      licenseLine: 'License #ABC-123456',
    },
    score: { coinValue: 10 },              // reward-relevant values are host-tunable
    progression: { streakBonuses: [25, 50, 100, 150, 250, 400, 600] },
  },
});
```

Every tunable number in the game — physics, spawn pacing, power-up durations, scoring,
camera, haptic patterns — lives in `src/core/Config.ts` and accepts deep-partial overrides.

## Architecture

```
src/
  main.ts                 bootstrap + DI
  Game.ts                 orchestrator + update loop + FSM/UI wiring
  core/                   Config, FSM, event bus, loop, pooling, storage, settings, easing
  systems/                input, movement, spawn (+solver), collision, score, power-ups,
                          tutorial, progression, camera
  render/                 renderer, toon materials, environments/props, player rig,
                          obstacles + instanced crystals, particles, pickups
  audio/ haptics/         Web Audio synth engine; Vibration wrapper
  ui/                     DOM overlay: screens, HUD, power-up chips, revive, footer, debug
  integrations/           RewardsBridge, Telemetry, AgeGate, ReviveProvider (+defaults)
  data/                   patterns, missions.json, characters, environments, powerups,
                          accessibility remaps
tests/                    solver sweep, physics, score math, power-up rules, storage
                          fallback, FSM, compliance greps
```

Conventions enforced by tests: no direct `localStorage` outside `core/Storage.ts`, no
`navigator.vibrate` outside `haptics/`, no `AudioContext` outside `audio/`, no banned
medical-claim words anywhere.

## Real-device validation checklist

Everything above is verified headless (unit suite + scripted Chromium runs). Before launch,
confirm on physical hardware:

- [ ] 60 fps on a mid-range phone (`?debug=1` → watch FPS/draw calls; the adaptive governor
      should rarely leave L0)
- [ ] Haptic patterns on Android (iOS Safari has no Vibration API — silently skipped)
- [ ] Audio starts after first tap (autoplay policy) and survives lock/unlock
- [ ] Safe-area insets on a notched device, portrait and landscape
- [ ] Real age-verification flow wired via `ageGate` before public launch

## License / assets

All code and generated art/audio in this repository are original. No third-party assets,
fonts, or SDKs are bundled; the only runtime dependency is [three.js](https://threejs.org)
(MIT).

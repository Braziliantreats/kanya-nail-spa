# CLAUDE.md — Crystal Rush

HTML5 endless runner (three.js + TS strict + Vite) feeding a dispensary rewards program.
Read `README.md` for the integration surface. The authoritative product spec lives in the
original build prompt; `src/core/Config.ts` is the single source of truth for tunables.

## Commands

```bash
npm run dev / build / preview
npm test               # vitest — includes a 10k-chunk solver sweep; must stay 100%
npm run typecheck      # tsc --noEmit, strict; zero errors expected
npm run lint           # eslint flat config; zero warnings expected
```

Browser verification: build, `vite preview`, drive with Playwright using
`?debug=1` + `window.__crystalRush` (fsm/run/movement/spawn/powerups/... are reachable).

## Hard rules (enforced by tests/compliance.test.ts — do not break)

- COMPLIANCE (legal, not stylistic): no cannabis imagery/consumption/medical-claim words
  anywhere — including comments for the banned-word list. Zen Mode FX stay abstract.
  Legal text is never hardcoded; it comes from `config.legal.*`.
- `localStorage` only inside `src/core/Storage.ts`; `navigator.vibrate` only inside
  `src/haptics/`; `new AudioContext` only inside `src/audio/`.
- Every tunable number goes in `Config.ts` — no magic numbers in systems.
- Zero allocation in per-frame code: pools, typed arrays, module-scope scratch objects.
  Event-driven one-shots (SFX nodes, DOM popups) may allocate.
- Movement integration must stay frame-rate independent (velocity-Verlet jump — tested).

## Architecture map

- `Game.ts` — orchestrator. Boot order matters: storage → settings → renderer/environment →
  systems → wiring block (particles/audio/progression + bus listeners) → input → screens.
  All cross-system coupling goes through the typed `EventBus` (`core/Events.ts`).
- FSM (`core/StateMachine.ts`): BOOT→AGE_GATE→(BLOCKED | MENU)→TUTORIAL/PLAYING⇄PAUSED,
  crash→REVIVE→(PLAYING | GAMEOVER). `isRunning` gates the whole sim update.
- Spawning: `data/patterns.ts` (authored chunks) → `systems/solver.ts` (pure BFS
  solvability; re-validated per spawn at current speed) → `SpawnSystem` (pooled visuals,
  reaction-budget horizon). New patterns MUST pass the solver test sweep.
- World scrolls +z toward the camera; player stays near z=0, lanes at x = -2/0/+2.
- Rendering budget: <100 draw calls. Crystals + particles + streaks + side props are
  instanced (1 draw call each). Check with `?debug=1`.
- Integrations (`integrations/`) are interfaces with defaults; hosts inject at `Game.init`.
  Points flow through `DebouncedPointsEmitter` (~500 ms batches) — never call the bridge
  directly from gameplay.

## Testing patterns

- Pure-logic systems (solver, movement, score, FSM, storage) test in node directly.
- three.js constructs fine headless — `PowerupSystem` tests build real scenes/materials.
- UI/DOM is exercised via the Playwright scripts (not in vitest; keep it that way).

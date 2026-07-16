# MayhemTBD Product Spec — Consolidated Research Folder
**Compiled:** July 16, 2026
**Source runs:** Run 1 (market study, claims C001–C067) → Run 2 (product layer, C068–C091) → Run 3 stress test + amendment (C092–C111) → old parallel study (cross-checked, mostly superseded)

## How to use this folder
- `01-market.md` — how the deal market actually works, both sides. Context for every decision.
- `02-kit-spec.md` — THE BUILD DOCUMENT. Section-by-section spec, both presets, technical requirements, cut list.
- `03-copy-bank.md` — wireframes, headlines, verified quotes you may use in marketing, and BANNED numbers you must never use.
- `04-boosters.md` — paid add-on lineup, ranked, with kill list.
- `05-rate-card.md` — the rate/benchmark data for sample kits, with freshness rules.
- `06-positioning.md` — the edge, the 60-second pitch, and its preconditions.
- `07-research-plan.md` — the primary research to run (interviews, DM questions, A/B test, verification queue).
- `08-gaps-and-risks.md` — **read this before building anything.** Every known hole, provisional bet, and risk.

## Status legend (used throughout)
- **[SOLID]** — survived the Run 3 adversarial audit; multiple independent, current, named sources.
- **[PROVISIONAL]** — plausible and specced, but the evidence is thin or single-voice. Ship it instrumented; validate via `07-research-plan.md`.
- **[UNVERIFIED-QUEUE]** — promising material excluded from the spec until checked at source.
- **[BANNED]** — traced to fabricated/content-farm sources. Never use in product, copy, or thinking.

## Provenance warnings
1. **Run 2's full report is NOT reproduced here.** Its conclusions survive via Run 3's audit, but the detailed competitor tables and live-kit teardowns live only in the Run 2 chat. Export that report and drop it in this folder as `99-run2-raw.md`.
2. The raw Run 1 report and Run 3 outputs should also be archived alongside this folder — this folder is the synthesis, not the evidence.
3. All findings are **US-DTC-centric** unless noted. UK/EU (ASA/CMA rules) and B2B were out of scope.

## The one blocking item
**FINDING ZERO [C068/C101]:** mayhemtbd.com/creatorprogram currently serves the homepage, not a creator program page. Verified twice on separate days. Every claim in `06-positioning.md` is a conformance claim that this bug falsifies. **Nothing launches, ships, or gets pitched until this URL resolves to a real, server-rendered page.**

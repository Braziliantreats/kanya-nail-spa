# 02 — The Kit Spec (build document)

**Architecture verdict [SOLID]:** ONE system, TWO rendered presets (Influencer / UGC), differing in what is *hidden*, not just reordered. Building one template for both objectively under-serves each [C007][C058].

## Influencer preset — section order (amended, post-stress-test)
Order status: fit-first-with-proof-teaser is the shipping default; proof-literally-first is the **A/B challenger**, not the default [PROVISIONAL — instrument from day one].

1. **Header + fit line + proof teaser.** Name, photo, niche tag, ONE sentence mapping audience → buyer's customer, one-line proof teaser. The fit line is generated via forced structured input: `"[%] [demographic] in [location] who [behavior]"` — the done-for-you onboarding mechanic that prevents generic bios (pre-mortem mitigation #2). Specificity of audience description is the most-cited scan-stopper.
2. **Proof block.** 1–3 structured case cards. Fields per card: brand · deliverable · date · reach/impressions · ER vs. live-computed tier range (formula stated) · conversion evidence where it exists (codes/clicks/ROAS) · **branded-vs-organic performance** ("last 3 branded posts averaged X views; organic median Y" [C105] — no competitor surfaces this, cheap to compute) · one-line partner testimonial inside the card. Cards support TWO framings, toggleable: conversion proof AND awareness proof (reach, ER quality, saves/shares, consistency) — awareness is the dominant KPI for the majority buyer [C102]. **Zero-deal creators:** "first case study" wizard builds a card from best organic content [C092]; the proof block must never render empty.
3. **Snapshot card [PROVISIONAL].** The copyable one-pager: handle + positioning line, fit vs. ICP, ER vs. benchmark, 1–2 results, proposed deliverables, dated CPM sanity range. 9:16 sized, "Copy summary" button, key numbers also exposed as copyable text (spreadsheet-paste-able [C105][C107]). Build the cheap version; validate with real marketers before elaborating (F3).
4. **Live verified stats.** Auto-synced, "updated today" stamp (daily-fresh is table stakes — Beacons ships it free [C095]). Include **consistency stat** (median views, last 10–20 posts) instead of spike-distorted averages [C105]. Benchmark context computed live per rules in `05-rate-card.md`.
5. **Offer menu with D.U.E. scoping.** Deliverable packages; explicit line items: usage window, whitelisting/Spark, exclusivity, raw files, 2-round revision policy, rush [C094][C007][C014][C037][C067]. **Dollar figures default OFF** — "rate ranges on request" + creator toggle for scoped ranges [PROVISIONAL — the #1 question for brand-side DM research]. Support a "base + commission" package format (hybrid structures are the direction [C105]).
6. **Curated samples.** 3–6 best posts with view counts. Hard cap. No embedded feeds [C077].
7. **Terms strip.** 50/50 payment · W-9 ready · FTC-compliant · **whitelisting-ready ✓** (FB Page linked, music cleared for paid usage [C037]) · response-time promise.
8. **Contact.** Email + form, present at top AND bottom.
9. **Bio.** 50–80 words, LAST [C092].

## UGC preset — differences
- Audience demographics **hidden by default** (irrelevant to the buyer [C051]).
- The **work library is the core**: organized by format / niche / hook style, each sample with ad metrics (CTR, hook retention).
- Case cards default to ROAS/CPA framing [C007].
- **Prices ON by default** — posted deliverable menu [SOLID: marketplace economics make "ask me" absurd at $178–198 deal sizes [C100][C082]]. Three bands per `05-rate-card.md`, usage menu front-and-center.

## Technical non-negotiables
- **Server-rendered.** Kits must load without JavaScript (Pillar's JS-only kits fail fetches/link-previews [C081] — this is a stated product feature, our reliability proof point).
- Mobile-first, ~390px; key info within the first 2–3 phone screens ("page count" dogma is false — the actual C010 source says 4–8 pages is normal [C092]).
- Every stat carries a date. Undatable stats are omitted.
- Loads correctly in email/DM link previews.
- Instrumented from day one: scroll depth, section clicks, kit-view → inquiry attribution.

## Cut list [SOLID unless noted]
- Follower count as the opener → demote to a stats row [C040][C071].
- Logo walls without attached results [C076][C077].
- Unbounded post feeds [C077].
- Generic testimonials outside case cards.
- Life-story bios up top [C092].
- Email-gating the kit.
- Stats older than 90 days displayed without a refresh (staleness reads as amateur).
- Any fixed page-count rule — replaced by the 2–3-screen principle.

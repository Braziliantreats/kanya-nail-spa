---
name: creator-extract
description: >
  Creator Extract pipeline — scrape/transcribe creator content, extract tips
  from BOTH text AND visuals, classify into tiers. Trigger when the user says
  "scrape", "extract", "creator pipeline", "process my saves", or "go through
  my saved videos".
---

# Creator Extract

Scrape/transcribe creator content, extract tips from BOTH text AND visuals, classify into tiers.

## Pipeline

### Step 0: Collect from Saved Collections
- If the user shares screenshots of saved posts/videos: read them, extract creator names, post titles, URLs visible in the screenshots
- Build a scrape queue from what you find, confirm with the user before proceeding
- WHY: Creators show URLs, tools, settings ON SCREEN that they never say out loud. Screenshots catch what transcripts miss.

### Step 1: Scrape
Use web search or whatever tools available to find the content. Get transcripts, captions, post text.

### Step 2: Extract Tips (TWO PASSES)
**Pass 1 — Text:** Pull actionable tips from transcripts/text. For each:
- TIP: one-sentence actionable instruction
- EVIDENCE: data cited, or "claim only"
- SOURCE_TYPE: verbal | visual | both

**Pass 2 — Visual:** From any screenshots/images, extract:
- URLs shown on screen
- Tool/product names visible in browser tabs, UI headers
- Settings/configurations demonstrated
- Skills/plugins/extensions shown
- Code snippets or prompts visible on screen

Do NOT discard visual references even if the verbal tip is vague. "Go check this out" is vague, but if the screen shows a URL — that's concrete intel.

### Step 3: Classify Tiers
- **Tier 1 — Safe Default:** Zero risk, universally accepted → implement
- **Tier 2 — Test First:** Strategy-level, could backfire → test 30 days
- **Tier 3 — Situational:** Only applies in certain contexts → tag conditions
- **Tier 4 — Unverified:** No evidence, too vague → park

### Step 4: Output
Present grouped by tier. Include a "Visual Finds" section for any tools/URLs/resources shown on screen.

## Guardrails
- Extract PRINCIPLES, not scripts. Rephrase into our language.
- Track who said it FIRST, not how many repeated it
- Tag if creator SELLS what they're recommending
- Monthly batch — this is not a substitute for building
- 90-day expiration on anything adopted as SOP

# Green Rush — Avatar Design Kit

How to take the runner avatars from "derpy primitives" to Bitmoji-grade, using
free tools only. This kit contains:

1. Ready-to-paste **ChatGPT / image-AI prompts** that generate consistent
   avatar design sheets in four selectable art styles.
2. The **variable map** that ties every prompt slot to the game's existing
   customization catalog (`js/config.js → GR.CATALOG`), so generated art
   always matches an option the player can actually pick.
3. The **free tool pipeline** (image → 3D model → rig → GLB → Three.js).
4. The **honest Bitmoji answer** and three engineering tiers for upgrading
   `js/avatar.js`, from quick wins to a full modular-GLB system.

---

## 1. The style system (player-selectable art styles)

Bitmoji works because every asset obeys ONE style bible. We define four
styles; the player picks a style, and every customization option (hair, top,
face…) exists in all four. Each style below has a "style lock" paragraph —
paste it at the top of EVERY prompt you send so all generations match.

### Style A — "Sticker Toon" (the Bitmoji-alike)

> STYLE LOCK: 3D cartoon avatar in the style of a friendly mobile sticker
> character. Head-to-body ratio 1:2.75 (oversized head, small rounded body).
> Simplified anatomy: mitten hands with a suggested thumb, tube limbs with
> soft tapering, no visible knees or elbows. Face is FLAT-SHADED on the head
> surface: large almond eyes drawn on (never protruding 3D eyeballs), thin
> arched brows, small simple nose bump, expressive vector-like mouth. Smooth
> matte surfacing, soft two-tone cel shading, subtle ambient occlusion, no
> specular highlights on skin. Clean silhouette, no outlines. Cheerful,
> approachable, unisex-friendly. White background, soft studio lighting.

### Style B — "Claymation" (polish what the game already has)

> STYLE LOCK: Handmade stop-motion clay character, Aardman-inspired.
> Head-to-body ratio 1:2.5. Visible soft clay surface with faint fingerprint
> texture. Eyes are small flat oval decals pressed INTO the face (not googly
> spheres), thick sculpted brows, tiny ball nose. Rounded chunky limbs,
> oversized shoes. Warm matte lighting like a miniature film set. Every part
> looks individually sculpted and attachable: hair, hat, and clothes read as
> separate clay pieces. White background.

### Style C — "Chibi Anime"

> STYLE LOCK: Chibi anime 3D character, VRoid/Nendoroid-inspired.
> Head-to-body ratio 1:2. Huge glossy anime eyes painted flat on the face
> with two highlight dots, tiny nose tick, small mouth. Cel shading with one
> hard shadow step and thin dark-tint outline. Hair built from chunky
> stylized locks with a soft gradient. Simplified two-tone clothing. White
> background, front-facing studio light.

### Style D — "Blocky Retro" (low-poly / voxel-flavored)

> STYLE LOCK: Charming low-poly game character, Crossy-Road-inspired.
> Head-to-body ratio 1:2.5. Faceted geometry, flat colors, ZERO textures —
> every surface a single solid color. Face is painted flat pixels/shapes on
> the head block: square or rounded-square eyes, simple line mouth. Chunky
> proportions, no fingers. Isometric-friendly. Bright saturated palette,
> soft global illumination, white background.

---

## 2. Master prompts (paste into ChatGPT)

Replace `{{...}}` variables using the tables in section 3. Always prepend the
STYLE LOCK for the chosen style.

### 2.1 Hero character sheet (the "does it look good?" test)

```
{{STYLE LOCK}}

Design a hero avatar for a family-friendly endless-runner mobile game
(Temple-Run-like, third-person, character seen mostly from the BACK while
sprinting). Produce ONE character design sheet on a single image:

- Front view, 3/4 view, and BACK view, full body, same character, T-pose
  arms slightly lowered (A-pose).
- Character spec: {{skin tone}}, {{build}} build, {{height}} height,
  {{hair style}} hair in {{hair color}}, {{brow}} brows, {{eye style}} eyes
  in {{eye color}}, {{mouth}} mouth, {{facial hair}},
  wearing a {{top color}} {{top}} with {{pattern}} pattern,
  {{bottom color}} {{bottoms}}, {{shoe color}} sneakers,
  {{hat}}, {{glasses}}, {{extra}}.
- The BACK view must stay interesting: readable hair silhouette, hood/collar
  detail, contrasting sole/heel on the shoes.
- Big readable silhouette at small screen size; nothing thinner than a
  finger; strong color blocking between top / bottoms / shoes.
- No background props, no text labels, plain white background.
```

### 2.2 Customization catalog sheet (one per slot, keeps options consistent)

```
{{STYLE LOCK}}

Same character, same camera, same lighting in every cell. Produce a clean
4x3 grid sheet showing the SAME base head wearing each of these 12 hair
styles, one per cell, labeled: Fresh Fade (bald), Buzz Cut, Short Crop,
Side Swoop, Afro, Twin Puffs, Top Bun, Ponytail, Long Flow, Locs, Mohawk,
Braids. Neutral dark-brown hair on all of them. Front 3/4 view, head and
shoulders only, white background. The hair must read as a separate
attachable piece over an identical scalp.
```

Repeat with the other catalogs: tops (T-Shirt, Hoodie, Tank Top, Track
Jacket), bottoms (Jeans, Joggers, Shorts, Cargos), hats (Beanie, Dad Cap,
Backwards Cap, Bucket Hat, Headband), glasses (Shades, Rounds, Hearts),
extras (Headphones, Gold Chain).

### 2.3 Expression sheet (face states the game needs)

```
{{STYLE LOCK}}

Same character head, 2x3 grid, labeled cells: Smile, Big Grin, Smirk,
"Woo!" open mouth, Cheeky tongue-out, Dizzy knocked-out (spiral or X eyes,
wobbly small 'o' mouth). Identical head angle and lighting in every cell,
front view, white background. Eyes and mouth are FLAT graphics on the face
surface — no 3D eyeballs.
```

### 2.4 Run-cycle reference (so the animation reads right)

```
{{STYLE LOCK}}

Side-view action sheet of the same character: 1) full-sprint contact pose,
2) mid-air jump with knees tucked and arms up, 3) low slide leaning back on
the heels, 4) tripped/dizzy face-plant. Exaggerated squash-and-stretch
cartoon poses, white background, no motion blur.
```

### 2.5 Style-selector marketing shot (for the in-game style picker)

```
Produce ONE image split into 4 vertical panels, each showing the SAME
avatar spec rendered in a different art style, labeled:
1) Sticker Toon  2) Claymation  3) Chibi Anime  4) Blocky Retro.
[Paste all four STYLE LOCK paragraphs here, one per panel.]
Identical pose (relaxed idle, slight smile), identical outfit spec:
{{...same variables as 2.1...}}. White background.
```

### 2.6 Negative rules (append to every prompt)

```
AVOID: protruding googly eyeballs, realistic human proportions, visible
teeth-by-default, tiny heads, photorealism, fabric micro-texture, harsh
specular shine on skin, muddy desaturated colors, background scenery,
watermark text, extra fingers, asymmetric eyes.
```

The single biggest "derp factor" in the current build is the protruding
googly sphere eyes — every prompt above forces flat painted eyes instead.

---

## 3. Variable map (prompt slot → `GR.CATALOG` id)

Use the game's exact option lists so every generated sheet corresponds to a
selectable option. From `js/config.js`:

| Prompt variable | Catalog | Values |
|---|---|---|
| `{{skin tone}}` | `skins` | 12 hex tones `#f6d7bd` … `#4a2a18`, `#f8dfd0` — describe as "light peach … deep espresso" |
| `{{build}}` / `{{height}}` | `builds` / `heights` | slim/medium/broad, short/medium/tall |
| `{{hair style}}` | `hairStyles` | bald, buzz, short, swoop, afro, puffs, bun, pony, long, locs, mohawk, braids |
| `{{hair color}}` | `hairColors` | black→blonde naturals + red/purple/blue/green/pink/silver |
| `{{eye style}}` | `eyeStyles` | chill, round, happy, sleepy, wink |
| `{{brow}}` | `brows` | soft, flat, arch, thick |
| `{{mouth}}` | `mouthStyles` | smile, grin, smirk, open, tongue (+ dizzy game state) |
| `{{facial hair}}` | `facialHair` | none, mustache, goatee, beard |
| `{{top}}` / `{{pattern}}` | `tops` / `patterns` | tee/hoodie/tank/jacket · solid/tiedye/stripes/leaf/checker |
| `{{bottoms}}` | `bottoms` | jeans, joggers, shorts, cargo |
| `{{hat}}` | `hats` | none, beanie, cap, backcap, bucket, headband |
| `{{glasses}}` | `glasses` | none, sun, round, heart |
| `{{extra}}` | `extras` | none, headphones, chain |

Freckles and blush are boolean toggles — mention them explicitly when on.

---

## 4. Free tool pipeline (image → playable avatar)

ChatGPT images are 2D concept art — they can't be dropped into the Three.js
game directly. Two routes from concept to playable:

### Route 1 — Ready Player Me (fastest to "actual Bitmoji quality")
- **Ready Player Me** (readyplayer.me) — free avatar platform with a web
  customizer (face, hair, clothing, accessories), selfie-to-avatar, and a
  free developer tier. Exports rigged **GLB** you load with the
  `GLTFLoader` already vendored in this repo.
- **Mixamo** (mixamo.com, free Adobe account) — upload the GLB/FBX, get
  professional run / jump / slide / stumble animations auto-retargeted.
- Result: genuinely Bitmoji-grade 3D avatars in days, not months. Trade-off:
  their art style, their customizer UI, requires network on first load.

### Route 2 — Own the assets (full control, all free)
1. **ChatGPT / Bing Image Creator** — generate the design sheets above as
   modeling reference.
2. **Blender** (blender.org) — model ONE base body per art style; sculpt
   hair/hats/tops as separate attachable meshes that all fit the same scalp
   and torso sockets. Optional head-start meshes: **Quaternius**
   (quaternius.com, CC0 modular stylized characters) and **Kenney**
   (kenney.nl, CC0).
3. **Meshy or Tripo AI** (free tiers) — optional: image-to-3D a concept
   sheet to get a rough mesh to clean up in Blender.
4. **Mixamo** — auto-rig the base body + free animation clips, or keep this
   repo's existing procedural `AvatarAnimator` (it's good).
5. **Krita or GIMP** (free) — paint the face/eye texture atlas; the game
   already swaps face textures (`setFace`), keep that mechanism.
6. Export **one GLB per attachment**, tint colors at runtime via
   `material.color` — that keeps the existing color catalogs working.

Skill-wise you need: basic Blender modeling (a weekend of YouTube:
"Blender low poly character" / Grant Abbitt or Imphenzia tutorials), no
rigging skills if Mixamo does it, and the Three.js you already have.

---

## 5. How close can we get to Bitmoji?

Honest answer: **visually ~85–90%, and nobody will call it derpy** — but not
by adding more spheres. Bitmoji's polish comes from three things you can
copy and one you can't:

Copyable with free tools:
1. **Flat painted faces.** Bitmoji faces are 2D graphics on a 3D head. The
   current game paints the mouth on the head texture but uses protruding 3D
   eyeballs — that mismatch is 80% of the derp. Paint eyes + brows + mouth
   into ONE face texture atlas.
2. **One style bible.** Every asset drawn to the same proportion/shading
   rules (that's what the STYLE LOCK paragraphs enforce).
3. **Modular attachments on fixed sockets.** Hair/hat/top/bottom are
   separate meshes snapped to standard scalp/torso sockets, tinted at
   runtime.

Not copyable: Bitmoji's sheer breadth (hundreds of artists' worth of
options). Compete on charm and cohesion, not option count.

---

## 6. Upgrading `js/avatar.js` — three tiers

### Tier 1 — Quick wins, keep the procedural system (1–2 days)
- **Kill the googly eyes**: delete the 3D eye spheres/lids and paint eyes,
  brows, and lashes into `paintHeadTex` next to the mouth. Keep `setFace`
  texture-swapping for blink/dizzy (cheaper than scaling eye groups too).
- **Fix the outline hull**: `hull.scale.setScalar(1.05)` on non-uniformly
  scaled meshes (head is scaled 0.94/1.16/0.96) makes uneven, gappy ink
  lines. Either drop outlines for Style A, or offset vertices along normals
  in a shader/geometry pass instead of scaling.
- **Proportions pass**: shrink nose ~30%, drop ears ~20%, raise mouth
  toward the eye line — the current mouth-at-chin placement reads "muppet".
- **Palette pass**: current colors are near-max saturation; pull everything
  ~15% toward pastel and the whole game instantly looks more professional.

### Tier 2 — Style selector (the feature you asked for)
- Add `artStyle` to `GR.DEFAULT_AVATAR` + a `styles` catalog: `sticker`,
  `clay`, `chibi`, `blocky`.
- Implement each style as a **material/geometry preset**: `clay` = current
  toon+bump; `sticker` = smooth Lambert, no outline, higher poly spheres;
  `chibi` = 2-step toon + thin outline + bigger painted eyes; `blocky` =
  flat-shaded low-seg geometry (`flatShading: true`, 6–8 segment spheres).
- The rig, animator, and catalogs don't change — only materials, segment
  counts, and the face-painting function branch on style. This is very
  achievable in the current codebase.

### Tier 3 — Modular GLB pipeline (Bitmoji-grade)
- Replace primitive assembly with a rigged base-body GLB per style + one
  GLB per hair/hat/top attachment (built via section 4 Route 2, or swap the
  whole system for Ready Player Me via Route 1).
- Keep `GR.CATALOG` ids as the manifest — each id maps to an attachment
  file. Saved player configs keep working.
- The repo already loads GLBs (`vendor/gltfloader.global.js`, robot.glb),
  so the loading tech is proven.

Recommended path: **Tier 1 this week** (biggest visual jump per hour),
**Tier 2 next** (ships the style picker), grow into **Tier 3** per style as
assets get made.

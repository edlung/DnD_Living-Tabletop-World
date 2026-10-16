# Stage 320 design — draft 1 (adopted)

Visual language and scene. Work order: `work-orders/OPUS_STAGE_320.md`. Decision record: ADR 0034.
Owner decisions: `reviews/OWNER_DECISIONS_9_2026-10-15.json` (designs adopted by the session) and
`reviews/OWNER_DECISIONS_10_2026-10-15.json` (the owner's concepts set the direction; all art by GPT).

## Owner decisions (Q8, 2026-10-15)

- **Direction:** the owner's seven GPT-made concepts in `docs/design/stage-320/owner-concepts/`
  ("Вот по этим концептам нужно строить"). They replace the session's prototypes, which were drawn
  by Claude and are withdrawn; they are not art and nothing of them ships.
- **All art by GPT:** "GPT будет все нужное генерировать. Art, наборы assets, UI, equip, skins,
  models, etc." Every picture is made by an OpenAI image model. Code draws only exact game markup
  over that art (grid, rings, path, area, bars, text, controls) and never illustration.
- **Art style for Stage 330 (Q6):** the concepts' painting style (below), not the earlier
  "Parchment & Ink" engraving style. The curated Ravenford set is regenerated in it.

## 1. What the concepts establish

1. **The world fills the screen.** A painted place is the background of every screen; interface
   floats over it in dark glass panels. Who is present stands in the scene with a name plate.
2. **Dark glass, thin light lines.** Near-black blue panels (about 88% opaque), 1 px pale hairlines,
   10 px corners, soft drop shadow. Gold is reserved for emblems, numerals and headings' small
   ornaments; teal-cyan marks selection, focus and the primary action; red marks hostiles and danger.
3. **Serif everywhere.** Classical serif for names and titles, a sturdy text serif for UI and body,
   capitals with wide tracking for section labels ("YOUR TURN", "CAMPAIGN / CHRONICLE").
4. **Icons beside words.** Engraved line glyphs before every action and record type; round
   portraits with rings; HP as thin green bars under portraits.
5. **Context, not dashboards.** Actions appear beside the selected person or place; combat shows
   only what the turn needs; reactions arrive as a prompt with two clear choices.
6. **The Chronicle is a book** on a candle-lit desk: parchment pages, a title, an illustration,
   handwritten margin notes, key moments, people met.
7. **The battle is a diorama:** a painted board seen at an angle, figures standing on it, glowing
   rings under them (cyan party, red hostile), a dotted movement path, a glowing area preview.

**Brand.** The concepts carry the placeholder "D&D NEXT"; D&D is a third-party trademark. The product
keeps its name — Living Tabletop World / «Живой настольный мир» — with a GPT-made emblem.

## 2. Concept elements and the alpha

Stage 320 is presentation only. Each concept element maps to an existing surface or is outside the
alpha (no new contract, rule, projection, or perspective data):

| Concept element                                                                                                                                         | Alpha surface                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Player view: painted place, NPC plates, action menu, dialogue panel, party rail                                                                         | Scene, presence, details with server-listed actions, conversation (§5.2–5.3)      |
| DM view: Player/DM toggle, NPC panel with persona, DM notes, knows-about                                                                                | Perspective switch; entity details in the DM perspective (§5.4, §5.7)             |
| DM creates a place: speak → generate → review → adjust → part of the world                                                                              | Authoring: intent → proposal → review → edit → confirm (§5.7)                     |
| Combat: initiative, active card, turn tray, target card, area, reaction                                                                                 | Battlefield HUD over the board (§5.5)                                             |
| Chronicle book, key moments, people met, margin notes, flashback                                                                                        | Chronicle and flashback (§5.6)                                                    |
| Equipment and spell art                                                                                                                                 | Catalog art for the rules' weapons and spells (§4)                                |
| Hit chance, target AC/HP, resistances of hostiles                                                                                                       | Shown only when the perspective's projection already carries them; never inferred |
| Level-up, full spellbook, inventory grid with equip, world map of regions, relationship graph, triggers, timeline editor, voice input, rumour generator | Outside the alpha; no surface is invented                                         |

## 3. Visual language (tokens)

Tokens live in `apps/web/src/styles/tokens.css` as custom properties; components use only tokens.

**Colour (dark is the only theme; the Chronicle's pages are the one light surface):**

| Token                                                     | Value                                                 | Use                                                 |
| --------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `--ink-950` / `--ink-900` / `--ink-850`                   | `#05090e` / `#0a1119` / `#0e1620`                     | page ground, top bar, sheet ground                  |
| `--glass` / `--glass-raised`                              | `rgb(11 16 23 / 0.88)` / `rgb(18 25 34 / 0.94)`       | panels, popovers                                    |
| `--line` / `--line-strong`                                | `rgb(220 228 236 / 0.16)` / `rgb(220 228 236 / 0.30)` | hairlines, dividers                                 |
| `--text` / `--text-muted`                                 | `#ece6da` / `#a9a294`                                 | text (muted text ≥ 4.5:1 on `--glass`)              |
| `--gold` / `--gold-bright` / `--gold-deep`                | `#c9a45c` / `#e6c784` / `#8a6a33`                     | numerals, emblems, small ornaments, headings' rules |
| `--teal` / `--teal-fill` / `--teal-glow`                  | `#46c0dc` / `#123f56` / `rgb(70 192 220 / 0.45)`      | focus, selection, primary action, active tab        |
| `--side-party` / `--side-hostile` / `--side-neutral`      | `#4fd6e6` / `#e5483b` / `#d8b44a`                     | token rings, initiative marks                       |
| `--hp` / `--hp-low` / `--danger`                          | `#3dbb7a` / `#d9822b` / `#e25b45`                     | bars, warnings                                      |
| `--magic` / `--fire`                                      | `#a07cff` / `#ff8a3d`                                 | spell accents, area preview                         |
| `--page` / `--page-ink` / `--page-ink-muted` / `--rubric` | `#ebdfc6` / `#2b2015` / `#54422f` / `#8c2716`         | Chronicle pages                                     |
| `--page-floor`                                            | `#d6bc8f`                                             | darkest parchment under the pages' text (a veil)    |

Epistemic types keep their words and gain a glyph and a hue: FACT gold, EVIDENCE teal, TESTIMONY
ivory, RUMOR violet, INFERENCE sky, HYPOTHESIS amber, CONTRADICTION red, UNKNOWN grey, SECRET deep
red. Hue never carries meaning alone.

**Type (self-hosted, OFL, Latin + Cyrillic):** Cormorant Garamond 600/700 for names, titles and
capital section labels (uppercase, tracking 0.12em); Alegreya 400/500/700 for UI and body (base
16 px, UI 14–15 px minimum, lining tabular figures for stats); Bad Script only for short decorative
annotations on Chronicle pages (≥ 18 px, never the only carrier of information).

**Shape, light, motion:** radius 10 px panels, 8 px controls, pills for chips; shadow
`0 12px 32px rgb(0 0 0 / 0.45)`; glass blur where supported (solid `--glass-raised` otherwise).
Selection is a teal ring with soft glow; hover lifts by light, not by movement. Transitions 160–240
ms ease-out for panels and cards; a waiting reaction pulses twice, then rests. Under
`prefers-reduced-motion: reduce` every transition and pulse is removed.

## 4. Art: GPT only

**Two classes, never mixed:**

1. **UI kit** — app-level pictures that state nothing about the world: icon glyphs, textures
   (backdrop, panel grain, parchment), the Chronicle's empty book, emblem, compass rose, portrait
   ring, divider, corner, d20, the neutral figure silhouette, the neutral mist used where no image
   is approved, battlefield ground, the three cover pieces (low crates, boulder, wall) and the
   difficult-ground patch, and catalog art for the rules' weapons and spells (longbow, shortbow,
   scimitar, dagger; Hunter's Mark, Detect Magic, Healing Word, Misty Step, Fireball,
   Counterspell, Ashen Bolt, Binding Hex). Shipped with the client in `apps/web/src/assets/`.
2. **World images** — places, people, objects, chapter illustrations, figures: campaign content,
   DM-approved, served by the asset pipeline (ADR 0022/0023), delivered by Stage 330.

**Honesty.** A UI-kit picture never stands in for a world image. Where no approved world image
exists the slot shows the neutral mist (places) or the neutral silhouette (people) and says so in
text. Battlefield pieces show the rules' state only — a cover piece marks a cover level, the
difficult patch marks difficult ground; they do not claim what the object is. Item and spell art
is keyed by the rules catalog ID and shows the catalog entry, never a particular world object.

**Channel and provenance.** UI-kit pictures are generated once through Codex CLI's image tool on
the owner's ChatGPT subscription (owner decision Q6), with the concepts attached as style
references. `apps/web/src/assets/ui-kit.manifest.json` records, per file: prompt, reference
concepts, channel, generation date, SHA-256 of the GPT original, and the processing recipe.
Originals stay outside the repository; processing is reproducible from them with
`scripts/ui-kit/` (sharp): grid slicing and luminance masks for glyphs, black-to-alpha extraction
for gold ornaments and pieces, resizing, WebP/PNG encoding. Nothing is retouched by hand.

**Glyphs** are alpha masks tinted by CSS (`mask-image` + `currentColor`), so one GPT glyph serves
every state colour. A glyph is decorative (`aria-hidden`); every icon-only control has an
accessible name and a visible tooltip.

## 5. Layout

### 5.1 Shell

- **Top bar** (56 px, `--ink-900`): emblem and wordmark; campaign name and the open session's
  title; live badge, perspective switch (DM: "DM view" / "As <character>"), refresh, leave.
- **Stage:** everything below the top bar. Its background is the current place's approved image
  (variant by phase and weather, as today) under a vignette, or the neutral mist.
- **Dock** (bottom, 64 px): Scene, Places, Journal, Chronicle; DM adds "Add to the world",
  "Encounter", "Time and weather", "History". Dock items open **sheets** that rise over the lower
  stage (≤ 46% of the viewport height) and leave the scene visible above; the Chronicle opens as a
  full-screen book (a modal dialog, Escape closes, focus returns).
- **Right panel** (400 px): the selection's details and actions; opens on selection, closes with
  its button or Escape. Sheets sit to its left, so a DM can read a selection and use a tool at
  once. Every panel stays mounted while hidden, keeping drafts, selections and unsubmitted intent
  (ADR 0033).

### 5.2 Scene

- Location cartouche at the top-left: place name (Cormorant), then "Day 1 · 10:00 · clear" as the
  labelled "Scene conditions" group.
- Party rail at the left: round portraits (approved image or silhouette) with a gold ring, HP bar
  when the projection carries it, presence dot.
- Who is present: medallions with name plates along the lower third (the curated scenes leave
  that band calm). Selected: teal ring and glow; its plate stays lit while the right panel shows
  it. The arrangement stays symbolic and says so ("Symbolic arrangement — no distances shown").
- The result of an action appears where it happened: the outcome notice is anchored above the
  medallion it concerns (the stage's bottom centre when it concerns the place).
- "Beyond this place": exits as cartouche buttons at the stage's bottom-right; known destinations
  and the location choice in the Places sheet.

### 5.3 Conversation and knowledge

- NPC speech appears in the scene: the dialogue panel at the stage's lower left carries the
  speaker's portrait, "Says: <name>" (Russian: «Говорит: <имя>») and the line in quotation marks;
  the player's options are numbered rows beneath it.
- What was learned appears as typed records: cards with the type's glyph, word and hue, the
  statement, attribution and provenance — visually distinct from speech (card vs. quote), never
  merged with it. New knowledge from an action slides in under the outcome notice.

### 5.4 Details, places, journal

- Right panel: portrait header (approved image or silhouette, name or "Unidentified …", kind),
  then the server-listed actions as an icon list (Talk, Ask, Inspect, …), then what this
  perspective knows (typed records), then the full sheet on demand. DM perspective: the same panel
  with DM-only fields as the projection supplies them; "Perform as <NPC>" stays here.
- Journal sheet: known people and places, recent events, hypotheses and recall.

### 5.5 Battlefield

When the current place has an encounter the stage shows the battlefield; a Scene / Battlefield
switch keeps the scene one click away.

- **Board:** ground texture (or the encounter's approved map once one exists); difficult squares
  show the difficult patch; cover squares stand the matching cover piece; grid hairlines; all
  geometry from the projection only. Desktop shows the board tilted like a table
  (`perspective` + `rotateX`), with tokens and pieces standing upright; a "Flat / Tilted" control
  switches; phones and tablets start flat. Hit-testing, focus order and accessible names are the
  same in both modes.
- **Tokens:** medallion (approved portrait or silhouette), ring by side, current turn glowing,
  down/dead desaturated with a glyph, conditions as glyph pips, HP bar only when the projection
  carries hit points, name plate (or "Unidentified …").
- **HUD:** initiative strip at the top (portraits in order, initiative total when supplied, current
  highlighted, round number at the right); active combatant card at the left (portrait, HP, AC and
  speed when the sheet is the viewer's own, conditions); the selection's options in the right
  panel (target options, attack details the server supplies); **turn tray** at the bottom only
  while the viewer may act (server-listed actions as glyph buttons — no permanent action bar);
  movement path as cyan squares and a dotted line (advisory, as today); area preview as glowing
  squares from the server's preview; the **reaction prompt** as a prominent card ("Reaction:
  Counterspell" with "Cast" / "Don't interfere") that takes focus and is announced once.
- DM encounter controls live in the Encounter sheet; acting for a player shows the acting bar
  across the top of the stage (ADR 0033 §7).

### 5.6 Chronicle and flashback

- The Chronicle opens as a book: the GPT book spread scales to the viewport; the left page holds
  the chapter title, the illustration slot and the prose; the right page holds key moments, what
  was learned (typed records) and people met; sources sit in the margin as small notes. Chapters
  are ribbon tabs. Pages scroll inside themselves; nothing is paginated by guesswork. Phones show
  one parchment page with the same order. DM chapter generation sits in the book's header.
- A flashback plays as a scene: a framed, sepia-toned vignette of the remembered place (approved
  image or mist), the remembered line large in italic serif with its attribution, and "Return".

### 5.7 DM tools

- Add to the world (authoring): the intent field with a quill glyph; "Creating…" while the
  proposal is prepared (static under reduced motion); the proposal as a card listing what will be
  added, each with a check glyph; "Who will see"; Edit, Confirm, Cancel; afterwards "Added to the
  world · revision N". Undo lives in History.
- Time and weather: phase glyphs (sun, moon), weather glyphs, the next-day control.
- History: entries with time, actor and undo preview; Encounter: start, turns, suggestions,
  skip/act-as with the reason prompt.

### 5.8 Sign-in

GPT key art full-bleed; a glass panel at the left with the emblem, wordmark, tagline, the campaign
and access-token fields and the existing notes.

## 6. Widths

Checked at 390 × 844 (phone), 820 × 1180 (tablet) and 1440 × 900 (desktop).

- **Desktop ≥ 1200 px:** as above.
- **Tablet 768–1199 px:** right panel overlays the stage as a drawer; sheets span the width; board
  flat by default.
- **Phone < 768 px:** stage art in the top 42% with the medallion row beneath; the right panel and
  sheets become full-height bottom sheets; the dock is a tab bar with glyphs and short labels; the
  board is flat, scrolls in both directions, and has zoom buttons. No horizontal page scroll.

## 7. Accessibility

- Keyboard: every control reachable in visual order; Escape closes the topmost sheet, panel or
  book and returns focus; the reaction prompt receives focus when it opens; board squares keep
  their names; a skip link to the stage.
- Contrast: text ≥ 4.5:1 and large text ≥ 3:1 on its actual background (panels over art use
  `--glass` ≥ 88% opaque); focus ring ≥ 3:1 against neighbours. Automated axe scans of key screens
  fail on serious or critical violations, colour contrast included.
- Reduced motion: no transitions, pulses or tilt animation.
- Both languages: every new string goes through `t()` with Russian entries; all journeys pass in
  English and Russian.

## 8. What does not change

Contracts, rules, projections, routes, authorization and what any perspective receives. The
client still computes no legality, cost, range or area; visual state (tilt, open sheets) stays in
the client's memory, outside world state and browser storage. Existing journeys keep their
assertions; where a selector moves (a control now inside a sheet) the journey opens the sheet and
asserts as before. Perspective-isolation journeys keep their strength.

## 9. Parts and evidence

- **A — foundation and scene:** tokens, fonts, the UI kit and its manifest, glyph and medallion
  primitives, shell (top bar, stage, dock, sheets, right panel), sign-in, scene, conversation and
  knowledge, details, places and journal.
- **B — battlefield:** board, pieces, tokens, tilt, HUD, turn tray, area preview, movement,
  reaction prompt, DM encounter sheet, acting bar.
- **C — Chronicle and DM tools; finish:** book and flashback; authoring, time and weather, history
  sheets; responsive and accessibility pass; screenshots at three widths in both languages
  (`reports/evidence/stage-320/`); `reports/STAGE_320_COMPLETION.md`.

Evidence: `pnpm validate`; all journeys in both languages; axe scans; no horizontal overflow and
key controls visible at the three widths; screenshot set; UI-kit manifest complete (every shipped
picture has a GPT provenance entry; a unit test fails on an asset without one).

# Stage 320 — Visual language and scene

- Date: 2026-10-16 (Europe/Oslo). Branch `stage-320-visual`.
- Status: **IMPLEMENTED (parts A, B and C); OWNER PLAY ACCEPTANCE PENDING.** The owner deferred
  play acceptance and all manual checks of this stage (`reviews/OWNER_DECISIONS_9_2026-10-15.json`);
  per `AGENT_WORKFLOW.md` (Product Acceptance) the stage is complete only after the owner plays
  its affected flows on this build.
- Work order: `work-orders/OPUS_STAGE_320.md`. Contract: `docs/STAGE_320_DESIGN.md` (adopted).
  Decision record: `docs/adr/0034-visual-language.md`. Owner decisions: Q8 (the owner's seven
  GPT-made concepts set the direction; every picture is made by an OpenAI image model; code draws
  only game markup) — `reviews/OWNER_DECISIONS_10_2026-10-15.json`.
- Revisions (on `091aa13`): design `5498a60`; GPT UI kit `a12bd5c`; part A `b414104`; glyphs
  `5001cfc`; part B `37978ad`; glyphs `bcf0cc6`; part C `eaff995`; project status `c7ebf76` (PR 5);
  the review fixes of parts B and C are the commit that adds "Review of parts B and C" below
  (parent `c7ebf76`). No push was made.

## What the stage does

Presentation only: no contract, rule, projection, route, authorization or command changed, and
no perspective receives anything new (`docs/GATE_COVERAGE.md`, Stage 320 section).

**A. Foundation and scene** (`6a18da1`). Tokens (`apps/web/src/styles/tokens.css`), self-hosted
OFL fonts with Cyrillic (Cormorant Garamond, Alegreya, Bad Script), the GPT UI kit in the client
(`apps/web/src/assets/`, `ui-kit.manifest.json` with each picture's prompt, channel, original's
SHA-256 and processing recipe, enforced by `tests/ui-kit/`), glyphs as `currentColor` masks,
medallions, approved world images through the asset API or the honest mist and silhouette. The
shell: top bar, stage over the place's image, dock with sheets (one at a time, mounted while
hidden), the selection's right panel, the Chronicle as a modal dialog; sign-in over the key art;
the scene (cartouche, party rail with presence, who is present as medallions, ways beyond); the
conversation in the scene; typed records with glyph, word and hue; Places and Journal sheets; the
DM's tools as sheets.

**B. Battlefield** (`ee8c880`). The board drawn from the projection over the GPT ground, the
difficult patch and the three cover pieces, tilted like a table on a wide screen (flat below
1200 px, a Flat/Tilted control, zoom on a phone), the same square buttons and names in both
views; tokens as medallions with side rings, the current turn's glow, down/dead states,
condition pips and hit points only when the projection carries them; the HUD (initiative strip
as the encounter's anchor, active card, side panel with the server's options and catalog art,
the turn tray only while the viewer may act); movement route and Fireball's previewed area; the
reaction prompt that takes focus once, over the battlefield or the scene; the DM's Encounter
sheet and the acting bar.

**C. The Chronicle as a book, the flashback as a scene, the DM's tools, the finish** (this
commit).

- **Chronicle** (`apps/web/src/chronicle/`): a full-screen dialog over the stage (Escape closes,
  focus returns to the dock). The GPT book spread scaled to the viewport; chapters as ribbon tabs
  (bookmark glyph); the left page holds the window of world time, the title, the plate (the
  chapter's main place as the perspective saw it at the chapter's end, through the existing
  presentation route, or the neutral mist and "No approved picture of this place yet"), and the
  prose exactly as written with each passage's sources as a margin note (its entries and their
  epistemic types; what recorded them, in words; the event references on demand; Bad Script only
  for the ≥ 18 px decorative mark); the right page holds the key moments (each memory with "Open
  flashback"), what was learned as typed records in inks that read on parchment, and the people
  met as medallions. Pages scroll inside themselves. Below 1024 px wide (or 600 px high) the
  spread gives way to one GPT parchment page with the same order. Which prose a chapter holds is
  said honestly ("Told as the plain record" for the template; the provider and model on demand).
  The DM writes a chapter from the book's header with the existing waiting and failure texts; the
  new chapter opens. The book stays mounted while closed and re-reads in the background, so the
  DM's draft title survives.
- **Flashback**: a framed, sepia-toned vignette of the remembered place (approved image or the
  mist and its note; GPT corner ornaments frame it), the remembered line large in italic serif
  with its speaker and epistemic type (or "from your memory" for the memory's own summary), who
  else was there, and Return. It takes focus; Escape or Return goes back to the button that
  opened it, the next Escape closes the book.
- **DM tools**: Add to the world — the intent with the quill glyph, "Creating…" with a turning
  ring that stands still under reduced motion, the proposal card listing what will be added with
  check glyphs and "Who will see" (read from the proposed commands only), risk, issues and
  warnings, then Confirm, Edit and Cancel; afterwards "Added to the world · revision N" (the card
  scrolls into view in its sheet; acknowledgements and the editor belong to one revision). Time
  and weather — the day counter, phase and weather glyphs, the next-day control, the place's sky
  now. History — each entry with its kind glyph, when, status, the undo preview ("Undo is possible
  now…" or the blockers) and Undo. Performing an NPC in the selection's panel, with a message
  that is not speech set apart from a spoken reply and the answer brought into view.
- **Known issues of parts A/B, each fixed with a test that fails on the client before part C**:
  Escape in a field holding a draft closes nothing, and the last selection's panel stays mounted
  (keyed by entity, re-read in the background after the viewer's own actions) —
  `tests/e2e/drafts.spec.ts`; the spoken line sits in the conversation's polite live region and
  the result leaves it out, so it is announced once — `apps/web/src/exploration/speech.test.ts`;
  while the conversation with the selected NPC shows, its options live in its panel only, the
  selection's panel offers "Go to the conversation", the conversation re-reads after the viewer's
  own actions, unavailable options show the server's reason, a refused talk closes the
  conversation — `tests/e2e/conversation.spec.ts`, `speech.test.ts`; on a phone the party rail is
  a compact strip and every scrolling surface keeps the result's measured height as padding and
  scroll padding, so no control stays under it — `tests/e2e/phone-layout.spec.ts`.
- **Battlefield follow-ups**: a combatant the projection does not name is "Unidentified creature
  N" / «Неопознанное существо N» (numbered in turn order, then position; `combat/labels.ts` over
  `@ltw/ui` `combatantLabels`) in tokens, the turn order, cards, options, the banner, square names
  and the Journal's encounter summary; plates and the turn order keep the number when the words
  shorten; the DM keeps the names it receives. Cover pieces stand at the square's back edge,
  behind and above anyone there, scaled so a wall reads as a wall, with a cover badge (½, ¾,
  total) on the figure and a terrain card for the pointed, focused or chosen square. Prone,
  slowed, incapacitated and unconscious have their own glyphs; `bookmark`, `day-counter`,
  `next-day`, `sign-in` and `hidden` are used where they fit.
- **Finish**: axe at 390 × 844, 820 × 1180 and 1440 × 900 covers sign-in, the scene, a
  conversation, every DM sheet, the proposal card, the history with an entry, the battlefield
  states, the Chronicle book and a flashback (text contrast checked a second time against its own
  panel, the book's against the pages' measured tone `--page-ground` = `#e1cba7`, the mean of the
  GPT pages; every page ink is at least 5:1 on it); keyboard paths and focus return; reduced
  motion; no sideways scroll at any width.

## Validation (offline; no provider was called, `.env.local` was not read)

`pnpm validate` on the final source (exit 0, 213 s), holding the shared validation lock:

- `prettier --check .`: "All matched files use Prettier code style!"; ESLint with
  `--max-warnings=0`: no findings; `tsc -p tsconfig.json`: no errors.
- `context-budget: 853 active files checked, 0 over target, 0 over hard limit`.
- Unit: `Test Files  237 passed (237)`, `Tests  2521 passed (2521)`.
- Build: `✓ built in 166ms` (the existing "Some chunks are larger than 500 kB" notice, as in part A).
- `db:migrate`: `"applied":[],"alreadyApplied":9`; `seed:ravenford`: `"accepted":0,"duplicate":91`.
- Integration: `Test Files  34 passed (34)`, `Tests  186 passed (186)`.
- Browser journeys: `80 passed (1.8m)` (71 before part C, nine new; every earlier assertion kept
  or strengthened: the battlefield journeys now also assert that no combatant ID shows, the
  Russian battlefield is held to no Latin word at all).

Regressions proven: with part C's client changes stashed and its tests kept, the new unit tests
failed (`combatantLabels is not a function`; no live region; `warning` for every condition; IDs in
square names) and the nine new or changed regression journeys failed, each at the defect it pins
(`drafts`, `conversation`, `phone-layout`, `combat-turn`, `chronicle-book`); restored, all pass.

Screenshots: `pnpm exec playwright test -c playwright.evidence.config.ts` (the `pnpm
evidence:screens` tour; not part of `pnpm validate` or CI): `6 passed (2.1m)`, then the part C tour
again `2 passed (28.2s)`. **230 JPEG** (each ≤ 250 KB, the largest 150 KB) in English and Russian
at the three widths, all at the part C revision: `part-a/` 84 (sign-in, scene for player and DM,
details, conversation, Places, Journal, every DM sheet, the stage during an encounter, the empty
book), `part-b/` 96 (turn, target, move, area, reaction over the battlefield and the scene, the
DM's battlefield and Encounter sheet, acting — tilted and flat), `part-c/` 50 (the DM writing a
chapter, the book, the flashback, a conversation's single controls, the proposal card, the added
NPC, history with an entry, time and weather, performing an NPC). Index:
`reports/evidence/stage-320/index.md`. They were looked at and the layout fixed where it did not
read like the concepts (plate height and margin notes on one page, numbers lost in truncated
labels, the rail on a phone's battlefield, the reaction banner, notices over the conversation).

## Review of parts B and C (2026-10-16)

Findings of the review of `c7ebf76`, each fixed with a regression test that fails on the client of
`c7ebf76` — its client changes stashed, the new tests, fixtures and test seeding kept — and passes
after:

1. **Tilted board clicks** (medium-high). Figures were transparent to the pointer, so the
   visual centre of an upright portrait chose the square behind it. What is drawn of a figure —
   the round portrait, plate, pips and cover badge — now takes the pointer for its own square in
   both views (the space around them and the ring stay transparent); focus order and names are
   unchanged and pip tooltips work. `combat-board-pointer.spec.ts` (own campaign; Elowen starts
   prone): at 1440 × 900 tilted, pointing at a raider's portrait centre (over the row behind)
   shows its square in the terrain card and opens its options; Elowen's own portrait opens her
   options, never "Move here"; her pip takes the pointer. Before: no terrain card for 8, 4. A
   plate wider than its square now covers its neighbours' centres, so journeys point at a
   square's visible part (`clickSquare`, used once in `live-stand-in.spec.ts`).
2. **Narrow screens hid the cast warning** (medium). Below 1200 px the turn tray shows each
   option's cost, range note or reason under its button and the ally warning above them —
   visible echoes of the side panel, whose alert stays the one announcement; its measured
   height (`--tray-h`) keeps the stage's content and the result clear of it.
   `combat-narrow.spec.ts` at 390 × 844 and 820 × 1180: the warning is in view and on top,
   Fireball's button shows "Level 3 slot". Before: no warning in view.
3. **False "no approved picture"** (low-medium). The plate and the flashback say "No approved
   picture of this place yet" only when the presentation has no image; while an approved image
   loads or after its fetch failed the mist makes no claim; a place the view may not see says
   "No picture of this place to show" (`chronicle/picture-note.ts`; `picture-note.test.ts`
   renders the vignette with an approved image not yet fetched).
4. **A new chapter replaced the page** (low-medium). The chapter first shown stays chosen; a
   chapter written meanwhile is marked "New" on its ribbon until opened; behind a flashback the
   pages stay laid out (`inert`, unseen), so they keep their place and Return finds its button.
   `chronicle-pinned.spec.ts`. Before: the book switched to the new chapter.
5. **The reaction behind the open Chronicle** (low-medium). A reaction asked of the viewer closes
   the book, keeping its chapter and each page's place (the dialog gives scroll positions back
   when it reopens); the prompt waits while the modal is open and takes focus once it has closed
   (the dialog opens and closes in a layout effect). `combat-book-reaction.spec.ts`: Chronicle
   open → the DM casts → book closed, prompt focused and on top, answered, focus on the turn
   banner; the book reopens at the same chapter and place. Before: the book stayed open.
6. **Perform NPC framed non-speech as speech** (low). Refusals, "No words are available…" and
   failures are a plain status, without "{npc} says" and without "Spoken, not a recorded fact."
   (`perform-npc.test.ts`); `ai-feedback.spec.ts` and `dm-tools.spec.ts` (including the Tomas
   journey, which had asserted the spoken caption over a non-reply) now assert the honest labels.
7. **History Undo contradicted its preview** (low). Undo is disabled while the preview says the
   world refuses it, described by the reason and its blockers (`authoring-undo.spec.ts`, which
   no longer clicks it into the server's refusal; `live-stand-in.spec.ts`).
8. **Accessibility** (minor). The turn banner's live words say only whose turn it is and show
   "Your reaction is needed" outside them, so the reaction is announced once — by the alert
   dialog taking focus; when the question goes away with focus in it, focus returns to the banner
   (`combat-scene-view`, `live-combat`, `combat-book-reaction`). Parchment: on the GPT pictures
   under the text areas the darkest parchment reached luminance 0.24 (darkest 5 % ≈ 0.50, the
   muted ink 4.3:1; 4.07:1 on the part C screenshot, as the review measured). A "lighten" veil
   lifts anything darker than `--page-floor` (`#d6bc8f`, the pages' 10th percentile) under the
   text areas, feathered outside them; `--page-ink-muted` is darker (`#54422f`) and four
   epistemic inks slightly so. Every page ink now reads at 4.5:1 or better on the darkest
   parchment (the muted ink 5.2:1 by the pictures; 5.1:1 on the darkest rendered pixel; the
   darkest 5 % on the new screenshot 5.14:1). `tests/ui-kit/parchment-contrast.test.ts` measures
   the pictures (before: every ink under 4.5:1, the muted ink 2.29:1); axe checks the book's text
   on `--page-floor`.

**CI timeouts** (hosted run 38842954980: the battlefield scans took 34.5, 33.2 and 36.2 s and the
DM tools, book and flashback scan 30.2 s against the 30 s timeout; nothing was violated). The
scans keep every rule and every state at every width: 120 s per test in
`accessibility.spec.ts`; axe in legacy mode (one `axe.run` in the page — the same violations,
passes and incomplete results were measured on every state; the helper asserts the page has no
frames); colour contrast once per state, on the pass with the art set aside (it reaches every text
the pass with the art can); each battlefield state reached once and scanned at the three widths by
resizing (three sign-ins instead of nine); the DM tools and the book scanned in two tests with
campaigns of their own. Measured locally with `--workers=1` and nothing else running: the spec
1.1 min → 39.7 s, its longest test 11.3 → 5.1 s; with the page's CPU throttled 4×, the three
battlefield tests 17.3–17.7 s each → 12.5, 8.8 and 8.1 s, the DM tools and book 19.9 s → 8.4 and
8.0 s.

`pnpm validate` (exit 0, 210 s), holding the shared lock: Prettier "All matched files use
Prettier code style!", ESLint no findings, `tsc` no errors;
`context-budget: 862 active files checked, 0 over target, 0 over hard limit`; unit
`Test Files  240 passed (240)`, `Tests  2533 passed (2533)`; build `✓ built in 178ms`;
`db:migrate` `"applied":[],"alreadyApplied":9`; `seed:ravenford` `"accepted":0,"duplicate":91`;
integration `Test Files  34 passed (34)`, `Tests  186 passed (186)`; browser journeys
`85 passed (1.7m)` (80 before: four new journeys and the book's own axe test).

Regressions proven: with the client of `c7ebf76` the three new unit test files failed (no
`pictureNote`, no `PerformAnswer`, every ink under 4.5:1) and 11 journeys failed, each at the
defect it pins — `combat-board-pointer` (terrain card), `combat-narrow` (warning not in view),
`chronicle-pinned` (no "New"; the page switched), `combat-book-reaction` (book not hidden),
`combat-scene-view` and `live-combat` (the banner announced the reaction), `ai-feedback` and
`dm-tools` ×2 (the spoken caption over non-speech), `authoring-undo` and `live-stand-in` (Undo
enabled) — and the book's axe scan (its text against `--page-floor`, which `c7ebf76` lacks).
Restored, all pass.

Screenshots: `pnpm evidence:screens` `6 passed (2.1m)`; 36 affected JPEG kept (each ≤ 250 KB),
the rest left as they were (their differences were rendering noise or server data, not these
fixes): `chronicle` (part A), `target` and `area` on a phone and a tablet, `book`, `book-dm` and
`dm-perform` (`reports/evidence/stage-320/index.md`). They were looked at in both languages.

Not changed: cover pieces stay transparent to the pointer (a wall rising over the square behind
points at that square); the reaction prompt closes the book rather than opening over it.

## Concept elements outside the alpha (no surface invented)

Level-up, the full spellbook, the inventory grid with equip, the world map of regions, the
relationship graph, triggers and the timeline editor, voice input, the rumour generator, the "AI
Dungeon Master" assistant panel and its suggestion chips; in the Chronicle concept, loot and
rewards, real-world session dates, the book's filter tabs (sessions, quests, locations, NPCs,
items) and handwritten player notes; in the DM concepts, "DM Notes", "Relationships" and
"Triggers" tabs, quick-adjust chips ("make him more friendly") beyond the editable fields of ADR
0029 §3, and generating whole places with interiors and inventories; hit chance, resistances and
target AC are shown only where a projection already carries them (none for players).

## Limitations

- The browser-test server has no image, dialogue or narrator provider, so every screenshot shows
  the honest mist, no spoken words and the plain-record chapter; approved images arrive with Stage 330. The flashback and the plate use the place's presentation exactly as the perspective may
  see it; people met show their current portraits.
- The player's `EncounterView` still carries the IDs of combatants it does not name (only the
  visible labels changed); recorded for Gate 06.
- Outside a fight the scene's unnamed medallions read "Unidentified creature" without a number
  (there is no turn order to number them by).
- Pictures that would read closer to the concepts but do not exist (not drawn; for the image
  model): a ribbon-tab picture for the Chronicle's chapters, a candle-lit desk behind the book, a
  dedicated frame for the flashback vignette (the corner ornament stands in for it).
- `docs/PROJECT_WORKFLOW.md` was not changed here (other stages edit it in parallel worktrees).
- Owner play acceptance and the owner's manual checks are pending.

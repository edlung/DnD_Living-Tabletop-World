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
- Revisions (on `a911d32`): design `aadf058`; GPT UI kit `c46e7d0`; part A `6a18da1`; glyphs
  `16fefe1`; part B `ee8c880`; glyphs `f5d869a`; part C is the commit that adds this report
  (parent `f5d869a`). No push was made.

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

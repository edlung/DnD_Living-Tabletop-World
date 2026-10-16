# Browser journeys

Start with `playwright.config.ts` and `support/session.ts`, then the one journey.
Run `pnpm test:e2e` after installing Playwright Chromium. Both servers are owned
by Playwright: Vite on 4310 and the real seeded HTTP application on 4311.

- `apps/server/src/testing/ui-server.ts` composes the real World Engine and dev
  personas over deterministic in-memory storage. No external AI provider runs.
- These are browser journeys through real HTTP projections, not mocked domain
  behavior. Route interception is limited to delayed/failed transport cases.
- Stage 200 baseline campaigns stay read-only. Each Stage 210 mutation journey
  owns a campaign from `fixtures/investigation-campaigns.json`, prepared by
  `ui-investigation-campaigns.ts` through real commands. Never share one mutable
  campaign between tests or depend on another test's order or state.
- Keep secrets in server/test fixtures. Node-side checks may import the shared
  knowledge-boundary fixture; client source must never import it.
- `fixtures/hidden-character.json` is a secret browser-boundary sentinel seeded
  through a real DM command. Its name and ID must disappear from the complete
  DOM, including perspective options, outside the DM perspective.
- The UI server also gives Mira the approved reference sheet via a real DM
  command, proving that authorized NPC sheets stay reachable for the DM.
- `ui-campaigns.ts` prepares a separate `ui-combat` campaign with the existing
  ambush fixture and a real open Counterspell window and stays read-only. Each
  Stage 220 combat mutation journey owns a campaign from
  `fixtures/combat-campaigns.json`, prepared by `ui-combat-campaigns.ts`.
- Investigation checks use scripted d20 results of 15. The unknown-concept
  campaign omits initial caravan-related visible knowledge and visible
  memories; it tests server-driven action visibility before and after learning.
- Generated traces/screenshots belong in ignored `test-results/`;
  inspect a failed journey narrowly, never load generated artifacts wholesale.
- Stage 230 authoring journeys each own a campaign from `fixtures/authoring-campaigns.json`
  (`ui-authoring-campaigns.ts`). The browser-test server routes `reasoning` to the
  deterministic offline interpreter, so "Add a young guard near North Gate…" proposes
  Tomas Reed with no external provider. Namespace player command IDs per campaign (IDs
  are unique per actor across campaigns); scan rendered text, not stylesheets, for UI words.
- AI feedback (`ai-feedback.spec.ts`, ADR 0032 checkpoint C): `ui-ai-feedback` adds a second
  character (Bram Holt) for the stale-reply check, and `ui-ai-no-start` never gets a durable AI
  request start in `ui-server.ts`, so its intents, replies and chapters carry a null trace ID. Only
  dialogue delays are intercepted; the answers are the real server's.
- Live session (`live-*.spec.ts`, ADR 0033): two browsers share each campaign of
  `fixtures/live-campaigns.json` (`ui-live-campaigns.ts`) and never press "Refresh world".
  The live stream never ends while a page lives, so response-body collectors skip it
  (`isLiveStream` in `support/session.ts`); its frames are held to the fixed grammar by the
  server tests. Only the stream's transport is touched: the reconnect journey cuts the open
  stream (`window.stop()`) and fails reconnects through `LIVE_URL`, and the stale-window
  journey in `combat-reactions.spec.ts` keeps its player's stream down so that only the
  backend learns of the close.
- DM table tools (ADR 0033 §6–8): `live-stand-in.spec.ts` (the DM skips an absent player's turn
  while her screen follows; the DM acts as Elowen with a reason, the history lists the attack
  and undoes it) and `dm-history.spec.ts` (an authoring commit listed after a reload with a
  working undo; no history for a player or in a lower perspective; four open pages keep their
  rows and stay open, never showing "Reading the history…" again, when a new entry moves every
  older page's cursor) own campaigns of
  `fixtures/live-campaigns.json`. `authoring-undo.spec.ts` undoes from the history list that
  replaced the review's screen-local undo, with the same assertions. Helpers: `support/dm.ts`.
- Shell (Stage 320, `docs/STAGE_320_DESIGN.md` §5.1): controls live in the dock's sheets, one
  open at a time, and a closed sheet stays mounted but `hidden`. Open the sheet that holds a
  control first (`support/shell.ts`: `openSheet`, `closeSheet`, `chooseLocation` for the Places
  sheet's location choice, `openChronicle` for the Chronicle dialog; dock words in the campaign's
  language). Role queries skip hidden sheets, label and text queries do not: a hidden draft keeps
  its value, but assert visibility only on an open sheet. An open sheet covers the lower stage, so
  close it before clicking a medallion. Keep journeys' assertions when a control moves.
  `expectOnTop` asserts that nothing covers an element (`elementFromPoint` at its centre), for a
  result, a prompt or a Retry that must stay reachable (`outcome-layer.spec.ts`; the DM tool
  campaign `ui-dm-outcome`).
- Battlefield (Stage 320 part B, design §5.5): the journeys' default 1280 × 720 viewport shows the
  board tilted; squares keep their names (`square()`); a combatant the player does not know by
  name is "Unidentified creature N" (numbered in turn order: the ambush's raiders are 1–3, the
  shaman 4) and journeys assert that no ID shows (`not.toContainText('goblin')`); the options of a chosen combatant are
  described in its region "Options for …" and carried out from the turn tray (`turnTray()`, only
  while the viewer may act, with End turn), the anchor (`anchor()`) holds the round, whose turn
  and the viewer's hit points, and the reaction prompt is "Reaction: Counterspell" with Cast
  (named "Cast Counterspell") and "Don’t interfere". The Encounter summary in words lives in the
  Journal sheet. `collectApiBodies(…).assertPlayerBoundary(extra, perceived, ownViews)` exempts
  only the viewer's own views (its own sheet, read for the active card) from the extra markers.
  `combat-scene-view.spec.ts` owns `ui-live-scene-window`: on the scene view the turn banner and
  the reaction prompt stay shown, focused and answerable.
- `accessibility.spec.ts` (helper `support/axe.ts`: `expectAccessible`, `WIDTHS`): axe scans
  (`@axe-core/playwright`) of sign-in, the scene with a selection, a conversation, every DM sheet
  (Add to the world, Encounter, Time and weather, History) and the battlefield (the player's turn,
  a chosen target with a previewed area, the reaction prompt, the DM's Encounter sheet) at
  390 × 844, 820 × 1180 and 1440 × 900, plus the Russian scene on a phone; serious or critical
  violations (colour contrast included, a second pass with the art set aside so text is checked
  on its panel, the book's on the pages' measured tone `--page-ground`) and any sideways page
  scroll fail. Read-only, except one test that owns `ui-dm-a11y` (`dm-tool-campaigns.json`): it
  adds Tomas, writes a chapter, and scans the proposal card, the history with an entry, the
  Chronicle book and a flashback at the three widths. Axe needs pages of `browser.newContext()`.
- Stage 320 part C journeys (each a campaign of `dm-tool-campaigns.json` when it writes):
  `chronicle-book.spec.ts` (the DM writes a chapter from the book's header; the player reads two
  pages, margin notes, key moments, what was learned, people met; a flashback takes focus and
  Escape or Return goes back to its button, then Escape closes the book to the dock; under
  reduced motion the sheet and "Creating…" stand still), `conversation.spec.ts` (each
  conversation control exists once; "Go to the conversation"; a talk the server refuses — the
  live stream is cut so the stale option stays — closes the conversation), `drafts.spec.ts`
  (Escape in a field with a draft closes nothing; the closed panel keeps a draft through the
  DM's own action), `phone-layout.spec.ts` (the party rail is a compact strip; a result never
  keeps a scene control under it). Each fails on the client before part C.
- Evidence tour (`pnpm evidence:screens`): `playwright.evidence.config.ts` runs
  `tests/evidence/*.evidence.ts` against the same servers and writes JPEGs (≤ 250 KB) to
  `reports/evidence/stage-320/` (`part-a/`; `part-b/` for the battlefield: each state at the
  three widths, tilted and flat; `part-c/` for the book, the flashback, the DM's tools with
  content and a conversation; both languages; its own servers, so it may act), listed in
  `reports/evidence/stage-320/index.md`. It is not part of `pnpm test:e2e`, `pnpm validate` or
  CI; hold the shared lock like any Playwright run. Look at the images, never load the folder
  wholesale.
- Specs that import server test support (`support/investigation.ts` → `scenario/secrets.ts`)
  load workspace packages from their builds: run `pnpm build` before `pnpm test:e2e` after a
  contract change (`pnpm validate` does).

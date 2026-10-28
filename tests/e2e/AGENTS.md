# Browser journeys

Start with `playwright.config.ts` and `support/session.ts`, then the one journey.
Run `pnpm test:e2e` after installing Playwright Chromium. Every server is owned
by Playwright: Vite on 4310 and the real seeded HTTP application on 4311 (development
personas), and for production sign-in a second Vite on 4312 in front of the invitation-mode
application on 4313.

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
  Tomas Reed with no external provider. `authoring-drafts.spec.ts` (a reload and a perspective
  switch restore the draft; a witness elsewhere is never moved) and `authoring-edit-npc.spec.ts`
  (an NPC's card edit, the player's view of the new name) follow owner decisions 11. Namespace player command IDs per campaign (IDs
  are unique per actor across campaigns); scan rendered text, not stylesheets, for UI words.
- AI feedback (`ai-feedback.spec.ts`, ADR 0032 checkpoint C): `ui-ai-feedback` adds a second
  character (Bram Holt) for the stale-reply check, and `ui-ai-no-start` never gets a durable AI
  request start in `ui-server.ts`, so its intents, replies and chapters carry a null trace ID. Only
  dialogue delays are intercepted; the answers are the real server's. With no NPC voice here, a
  performed NPC's answer is the panel's plain status: journeys assert no "{npc} says" status and
  no "Spoken, not a recorded fact." (`ai-feedback.spec.ts`, `dm-tools.spec.ts`).
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
  replaced the review's screen-local undo; while the history's preview says the world refuses an
  undo, Undo is disabled and described by its reason (the blockers), as in the stand-in journey.
  `dm-tools.spec.ts` (`timeHistory`) finds the DM's day change and rain in History, undoes the
  rain the day change names as its blocker, then the day, and the scene returns to Day 1.
  Helpers: `support/dm.ts`.
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
  the reaction prompt stay shown, focused and answerable. The banner announces only whose turn it
  is (`turnAnnounced()`, its live words) and shows "Your reaction is needed" while asked
  (`bannerWords()`, what it shows); after an answer focus is on the banner (`turnBanner()`).
  A figure is part of its square: `clickSquare(page, x, y)` (or `clickWhereShown(page, locator)`
  for a square found by other names) points at the part of a square in view where a plate or an
  upright figure covers its centre — on the tilted board an occupied square's own name plate,
  drawn in the plates' layer, always does (Stage 330 combined state: the plate takes the pointer
  for its own square, outside the square's button). Review of parts B and C:
  `combat-board-pointer.spec.ts` (owns `ui-combat-board`, Elowen starts prone: at 1440 × 900
  tilted, a portrait's visual centre chooses its own square, the terrain card reads it, a pip
  takes the pointer; on the image journeys' `battle`, read-only: a standing figure's body chooses
  its own square, and tilted and flat a plate drawn over the figure of a combatant in front
  chooses its own combatant), `combat-narrow.spec.ts` (owns `ui-combat-narrow`: at 390 × 844 and
  820 × 1180 the tray shows Fireball's slot and the ally warning in view),
  `combat-book-reaction.spec.ts` (owns `ui-live-book-window`: a reaction asked over the open
  Chronicle closes the book, takes focus, is announced once and answered; the book reopens at
  its chapter and place) and `chronicle-pinned.spec.ts` (owns `ui-dm-pinned`: a chapter written
  while the player reads is marked "New" and replaces nothing). Each fails on the client of
  `c7ebf76`.
- `accessibility.spec.ts` (helper `support/axe.ts`: `expectAccessible`, `WIDTHS`): axe scans
  (`@axe-core/playwright`) of sign-in, the scene with a selection, a conversation, every DM sheet
  (Add to the world, Encounter, Time and weather, History) and the battlefield (the player's turn,
  a chosen target with a previewed area, the reaction prompt, the DM's Encounter sheet) at
  390 × 844, 820 × 1180 and 1440 × 900, plus the Russian scene on a phone; serious or critical
  violations (colour contrast included, checked with the art set aside so text is checked on its
  panel, the book's on the darkest parchment under its text `--page-floor`) and any sideways page
  scroll fail. Read-only, except two tests that own campaigns of `dm-tool-campaigns.json`:
  `ui-dm-a11y` (adds Tomas; the proposal card and the history with an entry) and `ui-dm-a11y-book`
  (writes a chapter; the Chronicle book and a flashback), at the three widths. A state is reached
  once and scanned at each width by resizing (`atEveryWidth`; the battlefield's player turn and
  target, reaction prompt and Encounter sheet are one test each), and each scan runs every rule
  once, in axe's legacy mode (one `axe.run` in the page — the screens have no frames, which the
  helper asserts — without a blank page per scan); the file allows 120 s per test for a two-core
  runner.
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
- Production sign-in (Stage 340 part B, ADR 0036 §7): `sign-in.spec.ts` (the DM invites, the
  player joins through the link, plays and is signed out at once when the DM revokes — through
  the live stream: the player sends no other request meanwhile; a link opened and left sends no
  request at all and stays unused, and one redeem follows "Take your seat"; a used, forged or
  malformed link shows one fixed failure; a signed-in browser is asked before an invitation
  replaces its sign-in — keeping first and focused, replacing unavailable until a moment passed
  and a key or pointer was used; signing out asks first and is final; the keyboard),
  `sign-in-tabs.spec.ts` (three tabs showing the DM's world, their live stream held down through
  `LIVE_URL`, drop to signed out when shown again, at a refused refresh and back online, once
  another tab replaced the sign-in with a player's link), `sign-in-ru.spec.ts` (Russian; an
  English browser keeps the ended campaign's language) and `sign-in-accessibility.spec.ts` (axe
  at the three widths and the Russian phone) run on `apps/server/src/testing/ui-sign-in-server.ts`
  behind the second Vite server, whose origin is its `PUBLIC_ORIGIN`; their pages use
  `test.use({ baseURL: SIGN_IN_ORIGIN })`. Each owns a campaign of
  `fixtures/sign-in-campaigns.json` (`ui-sign-in-campaigns.ts`: Elowen's seat released; the
  scans' campaigns keep her seated and add Seren's empty seat). The operator's DM links come from
  `support/sign-in.ts` (`dmToken`, three per campaign, each works once), derived from the per-run
  `LTW_UI_SIGN_IN_SEED` of `playwright.config.ts`; `openInvitation` opens a link and takes the
  seat (nothing is sent before). A token is never printed: assertions about one are yes/no
  (`holdsAny`, `captureRequests`, `expectNothingKept` — the address, the history entry, timing
  entries, storage, cookies, IndexedDB, Cache Storage, service workers, the document — and
  `expectUnreachable`, a heap snapshot of the page through the DevTools protocol, taken before
  anything else reads the page; a finished join page is replaced by a fresh start page, so these
  read the new one), and these specs keep no trace or screenshot (a failing one's `error-context.md` may still
  show a throwaway test link).
- Evidence tour (`pnpm evidence:screens`): `playwright.evidence.config.ts` runs
  `tests/evidence/*.evidence.ts` against the same servers and writes JPEGs (≤ 250 KB) to
  `reports/evidence/stage-320/` (`part-a/`; `part-b/` for the battlefield: each state at the
  three widths, tilted and flat; `part-c/` for the book, the flashback, the DM's tools with
  content and a conversation; both languages; its own servers, so it may act), listed in
  `reports/evidence/stage-320/index.md`, and to `reports/evidence/stage-330/part-b/` (the curated
  pictures in the client and the DM's image controls; `stage-330-part-b.evidence.ts`, listed in
  its `index.md`). It is not part of `pnpm test:e2e`, `pnpm validate` or
  CI; hold the shared lock like any Playwright run. Look at the images, never load the folder
  wholesale.
- Specs that import server test support (`support/investigation.ts` → `scenario/secrets.ts`)
  load workspace packages from their builds: run `pnpm build` before `pnpm test:e2e` after a
  contract change (`pnpm validate` does).
- Images (ADR 0035): at start the UI server imports the curated Ravenford pictures, through real
  commands approved by the DM, into the campaigns of `apps/server/src/testing/ui-image-campaigns.ts`
  (`ravenford`, `ui-combat` and every Russian campaign); every other campaign has no images, so
  the neutral fallback stays covered. No external image provider runs.
- Stage 330 part B journeys own the campaigns of `fixtures/image-campaigns.json` (Tomas, whom the
  player meets unnamed, has the opaque ID of `fixtures/image-entities.json`; ADR 0008), prepared by
  `apps/server/src/testing/ui-image-journeys.ts` (each in English and Russian): `site` (Elowen at
  the Abandoned Caravan Site among the objects), `battle` (the ambush on Elowen's turn), `review`
  (curated candidates not yet approved, a request waiting, one being generated, one failed; no
  worker, so these stay; read-only) and `tomas`/`retry` (Tomas Reed with no picture at Market
  Square, a failed request). The UI server's asset worker runs with the placeholder generator for
  `tomas`, `tomasRu` and `retry` only. `images-curated.spec.ts` (the curated scene, figures
  standing and inside medallions, the battle map, an object's plate; read-only),
  `images-dm.spec.ts` (request with a note, generate again, discard, approve, replace, a figure;
  the player sees nothing of a candidate — page, presentation, bytes by hash, every API body —
  and the approved picture through the live signal; try again from the Images sheet; Russian),
  `images-accessibility.spec.ts` (axe of the Images sheet and an entity's images at the three
  widths and the Russian phone and tablet; the keyboard order; Escape). Helpers `support/images.ts`: a
  picture is served when its `src` is a `blob:` URL of decoded bytes (`expectServedPicture`).
- Stage 330 part B review journeys (English only), each owning a campaign of the same file:
  `images-commands.spec.ts` — `supersede` (as `tomas`, with the worker: the older of two figures
  approved last is what the player sees and the DM's list approves; a state picture's words),
  `pending` (as `review`: an approval's answer dropped with `route.fetch()` then `abort`; the
  pending command with Retry in the panel, the Images sheet and another entity's panel; Retry
  answers `duplicate` there), `double` (as `review`: lineage reads delayed by a route so the
  pressed card stays; a double press and a forced third press send one `RequestAsset`), `keyboard`
  (as `review` without Thorne's waiting request: focus to the next card, the entity's heading,
  the sheet) and `panel` (as `review`: focus once per command, not on a later lineage read caused
  by a command sent through `page.request`); `battlefield-plates.spec.ts` reads `battle` only (each
  plate the topmost thing at its centre, ends and number while every element of the board lets
  pointers through, at 1440 × 900 and 820 × 1180, tilted and flat). A journey that changes its
  campaign cannot be repeated against the same server (`--repeat-each` needs fresh servers).

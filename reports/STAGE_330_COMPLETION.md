# Stage 330 — Images

- Date: 2026-10-16 (Europe/Oslo). Branch `stage-330-images`, rebased onto Stage 340's final head
  `d6085f9` (on `main` with Stage 320 merged).
- Status: **IMPLEMENTED (part A server, the curated GPT set, the authorized live smoke, part B
  client, part B review fixes, the Chronicle's pictures and the combined state with Stages 320
  and 340); OWNER PLAY ACCEPTANCE PENDING.** The owner deferred manual checks; the stage is
  complete for the owner only after they play the affected flows. Part A was reviewed by a
  separate review agent that the part A implementer started (its medium findings fixed before
  commit); an independent review of part B (a fresh agent, read-only) found five issues,
  all fixed; the combined state's regression is fixed with a new journey (below).
- Work order: `work-orders/OPUS_STAGE_330.md`. Contract: `docs/STAGE_330_DESIGN.md` (adopted under
  the owner's delegation, `reviews/OWNER_DECISIONS_9_2026-10-15.json`). Decision record:
  `docs/adr/0035-images.md` (amendments for part A, the smoke, part B, the part B review and the
  combined state). Owner decision Q6 (2026-10-15): OpenAI image models only; the curated Ravenford
  set is made once with Codex CLI on the owner's ChatGPT subscription and imported as approved by
  the DM; pictures the DM asks for in play go through OpenRouter within a $5 ceiling. Owner
  decision 10: every picture is GPT's; code draws only game markup and shades.
- Decisions taken in the stage: image bytes stay in PostgreSQL for the alpha (`ltw_asset_contents`,
  ≤ 2 MB each, in Stage 350's dumps; object storage when a dump passes 2 GB or 5 minutes, ADR 0035
  §5); a picture has a purpose (`image`, `figure`, `battle-map`); approving a picture supersedes
  the approved pictures of its kind (`AssetApproved` version 3); in-play spending is a durable
  reserve-then-settle ledger whose ceiling only the operator sets.
- Commits (hashes after the rebase): design, ADR 0035 and the curated set `7fe7d57`; part A
  server `6a7a390`; moonlit camp and identity report `b9689da`; live smoke tool and orphaned
  reservations `718c30c`; the live smoke `bf18e42`; the Chronicle's GPT pictures `fafa952`;
  part B client `d4f9c2c`; part B review fixes `f3cf321`; the Chronicle's pictures wired, the
  combined-state fixes and this report in the commit after it ("Stage 330: Chronicle desk, ribbon
  and flashback frame; combined-state fixes; completion report").

## What the stage does

- **Purposes.** `RequestAsset` takes an optional `purpose` (`image` by default, `figure`,
  `battle-map`), kept on the asset and in `PlayerAssetView`. Presentation chooses images as
  before; `EntityPresentation` adds `figure` (a character's newest approved tabletop figure) and,
  for a place, `battleMap` (its newest approved top-down map). Both are derived variants of the
  canonical reference: lineage, approval, undo hold and visibility unchanged. Payloads carry
  `purpose` only when it is not `image`, so earlier histories read and re-decide unchanged.
- **OpenRouter generator** (`apps/server/src/images/`, `LTW_IMAGE_GENERATOR=openrouter-openai`;
  placeholder by default): allowlisted `openai/gpt-5.4-image-2` (or `gpt-5-image-mini`), a fixed
  style prompt from the owner's concepts, a task from the entity's recorded description, variant,
  purpose and the DM's typed note; a derived variant sends its canonical reference as the input
  image, a new reference two curated style references. Only an inline data URL is read, then
  re-encoded to WebP ≤ 1,536 px and ≤ 1.5 MB. The key only from `OPENROUTER_API_KEY`, never
  logged; refusals, timeouts and provider errors keep the neutral fallback; a job that made no
  call fails as `UNAVAILABLE`.
- **Ledger and operator CLI** (migrations `0011`, `0012`, append-only): before a call the job
  reserves its model's worst case ($0.50 or $0.20) against the stored ceiling under one exclusive
  lock; it settles to the provider's reported cost, or keeps the whole reservation. No stored
  ceiling, or zero, means no call. `pnpm ai:operator image-budget-set` (owner's authorization
  recorded), `status`, and for orphaned reservations (a job that stopped between reserving and
  settling) `image-reservations --older-than-minutes <n>` and `image-reservation-settle` (whole
  or at an explicit amount, outcome `orphaned`, only after 15 minutes, the authorization required
  beside it by the database).
- **The curated GPT set**: 45 pictures (`fixtures/ravenford-ru/assets/manifest.json`: entity,
  variant, label, purpose, file and original hashes, exact prompt, references) — six portraits (the
  four named characters' look from the owner's concepts), eight places, five neutral investigation
  objects, night, rain, fog and night-rain variants, three wounded variants, six tabletop figures
  and a battle map of the Old Trade Road. `seed:ravenford` imports them through real commands
  (`RequestAsset` → worker with the `curated` generator → `ApproveAsset` as the DM), idempotently,
  approving only a job that produced the committed picture.
- **DM controls** (`apps/web/src/images/`, DM perspective only): the selection's panel and the
  Images sheet show each entity's approved pictures (Replace), candidates (Approve, Discard,
  Generate again), requests waiting, being made or failed with the fixed reason (Try again) and
  a request form (main picture, a state, a figure, a battle map; a note marked as reaching the
  image model). One command at a time; what an approval did is read from the lineage after it; a
  lost answer holds the controls and shows with Retry wherever the DM looks; focus never falls to
  the page. The DM's live coverage includes the lineage, so the controls follow the worker.
- **Figures**: on the tilted battlefield a combatant stands as its approved figure, inside the
  medallion on the flat one, in the scene as a standing figure; name plates lie in a layer above
  every figure. **Battle map**: the encounter place's approved map replaces the UI kit's ground
  while the viewed place is where the fight is. **Object pictures**: a thing's or a place's
  approved picture is a plate in its panel. Players see only approved pictures.
- **The Chronicle's pictures** (GPT, `fafa952`, provenance in `ui-kit.manifest.json`): wherever the
  book opens as a spread (at least 1024 × 600: a desktop, a tablet on its side) it lies on the
  candle-lit desk, its picture's edges fading into the wood, the desk shaded under the title;
  chapter tabs are the red ribbon (bookmark glyph and title as before, accessible names unchanged),
  shaded across the middle so the words read at 4.5:1 on every pixel
  (`tests/ui-kit/chronicle-art-contrast.test.ts`); the flashback's vignette sits in the gold
  flashback frame instead of the corner ornament, sized so the line and Return stay in view. The
  parchment floor and its test are unchanged; nothing new moves (reduced motion unaffected).

## The combined state (Stage 330 on Stage 320's and Stage 340's final clients)

Git reported no conflicts, but the first checks on the rebased branch failed: the type check (Stage
320's `picture-note.test.ts` built a `PlayerAssetView` without the new `purpose`), then in the
first full run seven journeys (`accessibility` battlefield, `combat-area` ×2, `combat-turn`,
`language-ru` battlefield, `live-stand-in` ×2). Stage 320's fix for tilted hit-testing made every
`.token-plate` take the pointer; Stage 330 had moved the painted plates into their own layer above
the board, outside any square, so a press on a plate reached no square and covered the centre of
the combatant's own square on the tilted board ("board-plates intercepts pointer events"). Standing
figures, new in Stage 330, did not take the pointer at all, so pointing at one reached the square
behind it — the fault Stage 320 had fixed for portraits. Fixed:

- A plate takes the pointer for its combatant's square: a press chooses it, the pointer lights
  the square and the terrain card reads it (`combat/board/plates.tsx`, `board.tsx`); the plate's
  room in the token stays inert. A standing figure takes the pointer like a portrait, over its
  body (`figures.css`). Around plates and figures every press reaches the squares.
- The seven presses on an occupied square of the tilted board point at the square where it shows
  (`clickSquare`, Stage 320's helper, and `clickWhereShown` for Russian names), because its own
  plate now lies over its centre; every assertion is unchanged. Stage 320's evidence tour does the
  same. A new journey (`combat-board-pointer.spec.ts`, the image battle campaign) proves the
  combined rule at 1440 × 900: a standing raider's body chooses its own square, not the one behind;
  tilted and flat, a plate drawn over the figure of the combatant in front chooses its own
  combatant, never that figure or the square beneath.
- `combat-narrow`, `phone-layout`, `outcome-layer`, the `chronicle-*` and `images-*` journeys and
  `battlefield-plates` passed on the rebased branch unchanged.

## Validation (offline; no provider was called in these runs; `.env.local` was not read)

| Step                                                                                        | Result                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Part A (`b297275` before the rebase), `pnpm validate`                                       | unit 2537 (238 files), integration 197 (36 files), E2E 59 — pass; context budget 809 files, 0 over target                                                                                                                                                                                       |
| The smoke tool and orphan settlement (`8f6c952` before the rebase), `pnpm validate`         | unit 2558, integration 203, E2E 59 — pass                                                                                                                                                                                                                                                       |
| The authorized live smoke (`pnpm images:smoke`, OpenRouter)                                 | PASSED — below                                                                                                                                                                                                                                                                                  |
| Part B, `pnpm validate`                                                                     | unit 2759 (266 files), integration 211 (38 files), E2E 103 — pass; context budget 967 files, 0 over target                                                                                                                                                                                      |
| Part B review fixes, `pnpm validate`                                                        | unit 2783 (270 files), integration 212 (38 files), E2E 110 — pass; context budget 978 files, 0 over target                                                                                                                                                                                      |
| Rebased onto `d6085f9`, first `pnpm validate` (own database `ltw_stage330b`)                | type check failed (fixed); then unit 2829 (276 files), integration 212, E2E 110 passed and 7 failed (the plates, above)                                                                                                                                                                         |
| This commit, `pnpm validate` (`ltw_stage330b`; migrations 0001–0012, 0010 before 0011/0012) | format, lint, types, context budget (994 files, 0 over target); unit 2832 (277 files), integration 212 (38 files), E2E 118 (the 7 above and 1 new) — pass; the new journey fails on the board client of `f3cf321`                                                                               |
| Evidence (`pnpm evidence:screens`)                                                          | Stage 320 part C: its 50 screens taken again (40 changed) and 4 new, both languages; Stage 330 part B: 48 taken again (37 byte-identical, 11 differ by noise and a presence dot); the Stage 320 part B tour runs with the new pointing (its screens kept as Stage 320 took them) — 6 tours pass |

## The authorized live smoke

One run, authorized by owner decision 9 (Q6), recorded in
`reviews/STAGE_330_OPERATOR_RECORDS_2026-10-16.json`: on a throwaway local database the operator
set the $5 ceiling; `pnpm images:smoke --generator openrouter-openai` authored Tomas Reed without
any paid text call, and his portrait was generated by `openai/gpt-5.4-image-2` in 125 s
(reserved $0.50, settled at the provider-reported **$0.240833 of $5**). The player saw no picture,
listing or bytes before the DM approved it and the portrait after. Transcript
`reports/evidence/stage-330/live-smoke-2026-10-16.txt`, picture
`reports/evidence/stage-330/tomas-reed-live-2026-10-16.webp`; no key or secret in either. No other
paid call was made in the stage.

## Identity of the curated set

`reports/STAGE_330_IDENTITY.md`: the session compared every derived picture with its canonical
reference (face, hair, costume, palette, silhouette; architecture and landmarks): all hold; one
minor drift (Orin's shop sign lost its flask in the rain); the abandoned camp at night was
regenerated twice (lit lanterns falsely showed someone there) and the first tracks picture was
rejected (boot prints are a clue the players must earn). A language model's judgement on
downscaled pictures, not a human's; in-play pictures reach players only after the DM approves.

## Reviews

- **Part A** was reviewed by a review agent started by the part A implementer; its medium findings
  were fixed before the commit (a placeholder SVG canonical reference now fails as `UNAVAILABLE`
  before any reservation; the import approves only the committed picture — provider `curated` and
  the manifest's hash — and the server's worker skips its requests; the generator is built before
  the server listens and `sharp` loads only for OpenRouter), as were most low ones. The live smoke
  then exercised the generator, the ledger and the visibility rules end to end on a real provider.
- **Part B** (an independent agent, read-only; five findings, all fixed in `f3cf321`, ADR 0035
  amendment "part B review"): approving an older picture did not replace the newer one players saw
  — an approval now supersedes the approved pictures of its kind, `AssetApproved` version 3,
  earlier approvals canon as recorded, the `80d06df` history loads and continues; the approval
  message claimed what players see before the lineage showed it; a command whose answer was lost
  was invisible outside its panel and a second press could send a second, possibly paid, request;
  focus fell to the page when a command took away its card; figures in front hid the name plates
  (and numbers) of combatants behind them.
- **Combined state** (this commit): the plate and figure hit-testing above, found by the full run
  after the rebase. The new journey fails on the board client of `f3cf321` (checked: the pointer
  on the standing raider's body reached the square behind it) and passes on this commit.

## Gate 06 surfaces (row 330; details in `docs/GATE_COVERAGE.md`)

The image routes and their additive fields (`purpose`, `figure`, `battleMap`); `RequestAsset`
with `purpose` and the `UNAVAILABLE` failure; the OpenRouter generator (outbound request, the key,
answer handling); the image ledger and its operator commands, orphaned settlements included; the
curated import as the DM; the live smoke tool; the DM's image controls and the DM-only lineage in
the live coverage; approval supersession and `AssetApproved` version 3 (a changed Gate 05
boundary: approval, lineage, undo, re-decision). The Chronicle's pictures and the battlefield's
hit-testing are presentation only (no route, rule, projection or authorization changed).

## Limitations and residual risks

- Reservations are estimates: a call is reserved at its model's assumed worst case ($0.50 or
  $0.20) and settled to the reported cost; a cost above the reservation is recorded and logged,
  never refused after the fact, and a call without a reported cost keeps its whole reservation.
- One server instance: the ledger's lock is in PostgreSQL, but the image worker and the per-process
  limits assume one instance in the alpha.
- Missing pictures (part B): battle maps exist only for the Old Trade Road; Tomas and the hooded
  watcher have no figures; factions have no pictures; Mira, Orin and Thorne have no wounded
  variants. The DM can request each in play (within the ceiling), or a later curated run can add
  them.
- Identity drift in pictures the DM generates in play is judged only by the DM's approval.
- On the tilted board an occupied square's own name plate lies over its centre; a press there
  chooses the same combatant through the plate. Browser tests point at a square where it shows.
- Owner play acceptance pending.

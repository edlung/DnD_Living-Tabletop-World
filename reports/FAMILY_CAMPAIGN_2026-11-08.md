# «Маяк Между Ветрами» — готовая семейная кампания

Authority: active owner goal of 2026-11-08; one adult DM, three players; wonder, mystery,
humour and an affecting ending. Scope: `work-orders/FAMILY_CAMPAIGN_2026-11-08.md`.
One session/model designed, implemented and checked the work. No independent or human play
acceptance is asserted. Status: TECHNICALLY_VERIFIED / READY_FOR_FAMILY_PLAY.

## Delivered content

Start: `campaigns/lighthouse/index.html`; practical instructions: `campaigns/lighthouse/README.md`.
The entire book opens from disk without accounts, network or installation.

- Twelve evenings / 36 episodes, with read-aloud openings, choices, checks, consequences,
  recovery after failure, clues, staged hints, props, breaks, endings and personal epilogues.
- Four selectable supported level-3 heroes; default party of three, three replacement variants,
  and a separate four-player variant. One adult remains the DM. No age/gender role assignment.
- Eleven world locations, nine major NPCs, 22 essential inspect clues, 17 handouts and five
  illustrated story items. Four observational quests; the journal never pretends that an
  unplayed ending succeeded. Four world-control rings and three substantive final arrangements,
  plus a safe temporary decision. No compulsory companion sacrifice.
- Three optional encounters for three heroes; ten-by-eight maps built from actual encounter
  geometry, print tokens and a private island route. Peaceful routes remain available.
- Thirty selected original raster illustrations: 12 scenes, four heroes, eight individual NPC
  portraits (Omb appears in his observatory scene), five objects and one maintenance automaton.
  The first Lighthouse version is retained; `lighthouse-v2.png` corrects the visible ring count.
  Original PNGs and compact WebP copies, alpha preserved, hashes and actual built-in imagegen
  prompts/provenance recorded. No project provider job or model version was invented.
- Private DM entry and individually shareable player pages. The static book is a DM-owned local
  artifact, not an authenticated public hosting surface; the README makes this distinction clear.

## Project changes

`apps/web/src/workshop/package-import.tsx` and `package-file.ts`: content-only JSON import in an
empty owner draft, strict schema and 512 KiB UTF-8 bound, preview before explicit OWNER revision
save, same payload/nonce on uncertain retry. Uncertain writes retain their UI; revoked owners
lose the mounted private subtree through the existing owner client. Existing revisions cannot be
overwritten by the empty-draft import. Activation remains a separate normal confirmation.
Russian strings and scoped styles accompany the control.

`apps/server/src/campaigns/encounter-books.ts`, combat routes and main composition: workshop
campaigns can list and start prepared party-versus-hostile encounters from their immutable
activated scenario. Before this change the family fixture returned an empty list. The adapter
checks the canonical scenario digest and translates local keys into allocated identities; it
never falls back to Ravenford for missing prepared content. The ordinary DM authorization,
World Engine commands and request idempotency remain authoritative. Mixed neutral-side
encounters still use the manual combat tools; this pack has no such encounters.

`scripts/lighthouse/curated-art.ts` / `import-art.ts`: exact frozen-package matching before any
art mapping, existing hash-checked curated loader and normal request/worker/approval commands.
Default CLI mode only checks; `--confirm` is an explicit offline operator import after normal
owner activation. The ordinary publication-gated engine is used. `curated-import.ts` accepts an
explicit source reason so Lighthouse imports are not mislabeled as Ravenford. Local art is
reviewed in the book before activation; the draft's provider-image pipeline is not impersonated.

Repository context map, domain guidance and reproducible build/book/art/check commands are updated.
No production dependency, migration, credential change, publication or live campaign activation.

`apps/web/src/shell/reserved-height.ts`: the turn tray's ancestor height was written inside
ResizeObserver delivery, causing native feedback-loop errors while the battlefield resized.
The first measurement remains synchronous; subsequent changed heights are coalesced into one
cancellable animation frame. The regression listens to native `window.error`, which Playwright's
`pageerror` does not capture for this browser message. It failed before and passed after the fix.
The dice journey now waits for the answered result field: a roll of 15 cannot accidentally match
the already-visible DC 15 while the request is still pending.

## Verification

- Compiler: READY, no findings; 64 entities, 54 knowledge records, three encounters, four quests,
  12 prepared situations. All four three-hero combinations and the four-hero variant materialize.
- Family checks: nine passing tests, including actual immutable storage, activation worker and
  gated campaign publication in memory; normal DM encounter start, duplicate retry, outsider404,
  player403; every essential clue discovered through the player's ordinary inspect command.
- Initial player knowledge excludes the antagonist's secret. Curated portraits retain the same
  boundary: the player cannot fetch the hidden antagonist's manifest or bytes even by exact ID/hash,
  and can read their own hero's portrait. Art import is byte-bound and idempotent; edited/mismatched
  source packages are refused. All local book links and PNG/WebP hashes are checked.
- Browser upload: invalid JSON, file preview without saving, actual server READY assessment,
  OWNER provenance, lost first save response, exact repeat, one revision, reload and disabled
  replacement after saving. No live activation is caused by the file picker.
- Book: ten page/state types × 1440/768/390/320 = 40 measured views, zero layout errors/warnings
  and zero axe violations. Screenshots inspected; all NPC and hint disclosures opened for audit.
- Import: four widths, no measurable layout errors/warnings and passing axe; the existing dark
  theme is the only app theme. Existing spacing-token information from the audit is retained.
- Full validation uses the dedicated local database `ltw_family_campaign_check_20261108`.
  Format, lint, typecheck, context budget, 3,605 unit tests / 410 files, build and 369 PostgreSQL
  integration tests / 71 files passed. The initial browser run had 242 passes and two live-update
  timeouts (dice answer and table waiting strip). Both passed in the subsequent focused run:
  16/16 in 44.0s, including the new resize regression. The first failure is retained in
  `evidence/family-campaign-2026-11-08/initial-validation.json`; it is not relabeled as a pass.
  The next complete run passed 244/245 in 10.6m, including the table display and resize test.
  Its one failure was an incorrect new test selector (`is-answered`; the actual status is
  `is-rolled`), while the trace showed the delivered result. After correcting the selector,
  all nine dice journeys plus the resize regression passed: 10/10 in 22.4s. Thus all 245 unique
  browser cases have passing coverage across the full and final focused runs. There was no
  single entirely green `pnpm validate` invocation; the initial failures and corrections are
  explicitly retained rather than hidden by automatic retries.
- After the final art correction: family tests, typecheck, scoped lint, link/hash checks and the
  book's full four-width audit repeated. Generated originals were preserved.
- Final code checks: typecheck, root format check, context budget (1,753 active files; zero over
  target/hard limit), build and `git diff --check` passed. A full ESLint scan found one void-arrow
  style issue in the new resize test; it was corrected and all three final changed source/test
  files passed scoped ESLint. The earlier full scan had passed before that test was added.
  The production build retains the existing advisory about chunks larger than 500 kB.
- The dedicated PostgreSQL database was dropped after the successful integration run. The local
  book audit server was stopped; the book remains usable directly from disk.

## Adversarial and editorial pass

Tried malformed/oversized/forged package input, uncertain repeat, stale/other campaign content,
wrong scenario digest, player/outsider encounter access, hidden-art byte lookup and mismatched art
mapping. Existing owner-bound client regressions cover cookie replacement/revocation. None of
these paths gains activation authority, private knowledge or arbitrary canonical writes.

Checked each episode for a choice, an actionable hint ladder and a recovery path; essential
information has alternate sources. An old letter copy was moved to its proper location rather
than encoding a future confession at the opening. The finale has four tasks for three players
without simultaneous-role deadlock; a neutral safe pause remains possible. Epilogues depend on
what the players actually did, not assumed victories.

## Limits and handoff

The actual family has not played the campaign yet. Timing, encounter difficulty and emotional
response are design judgments with technical verification, not a human acceptance claim.
The book and authored package are ready for review; live activation and operator art import
remain deliberate user actions. The default database, real accounts and deployment were not changed.

Selected evidence: `reports/evidence/family-campaign-2026-11-08/`. Full transcripts are temporary
local logs; retained evidence contains measurements and screenshots, not authentication material.
`verification.json` records the checks; `file-identity.json` records the exact delivered workspace
relative to base commit `e69c3290ca34cbde4a837591bfb477b899581142`. No commit is fabricated.
Handoff: `handoffs/FAMILY_CAMPAIGN_2026-11-08.md`.

PASS — authored content, local visuals and scoped technical integration. Human family play,
runtime activation, operator art transfer and deployment remain unperformed.

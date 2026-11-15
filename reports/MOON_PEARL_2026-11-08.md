# Moon Pearl — complete family campaign delivery

Scope: `work-orders/MOON_PEARL_2026-11-08.md`. Owner request: «Давай еще кампанию».
This is an original content delivery for one adult DM and three players, including ages 8 and 14.
It does not begin a numbered product stage or activate a real campaign.

## Delivered experience

`campaigns/moon-pearl/index.html` opens **«Тайна Лунной Жемчужины»**: a museum substitution,
an underwater city of dry galleries, a false audio alibi, an auction in a giant shell and the
rediscovery of a city's many makers. The stolen Pearl is a crafted voluntary sound archive.
It is neither a living fuel source nor a mind reader. The ending separates return, accountability,
forgiveness and the players' choices about access to the archive.

The complete Russian book contains twelve evenings, thirty-six playable scenes, four selectable
heroes, nine recurring NPCs, thirteen locations including the region, twenty-two physical clues,
eighteen handouts, five keepsakes and the movable Pearl itself. Forty-two local HTML pages include
the DM guide, player-only entry, chapter pages, twenty-four illustrated/document cards, three
tactical maps, a fifteen-connection route diagram and printable tokens. The fourth hero is an
alternative in a three-player party; four simultaneous heroes require a separate fifth DM.

Each evening includes read-aloud text, practical choices, three escalating hints, concrete
continuations after failure, flexible spotlight roles, consequences, breaks and a stopping point.
Early recovery, skipped locations, a delayed auction, refusal of combat and an unresolved final
decision all have usable continuations. Evening number is not a city-day clock.

The first-party imagegen tool created 34 selected original illustrations: fourteen environments,
twelve portraits, two transparent figures and six objects. Original PNGs, compact WebP derivatives,
exact prompts, dimensions and SHA-256 provenance are included. The tool did not disclose a model
version. One rejected workshop draft contained an out-of-place physical Pearl and generic people;
the selected edit removes them. The reference and its hash remain recorded. No project-provider
generation, API key, billing configuration or paid provider job was used.

## Files and application integration

- `campaigns/moon-pearl/`: source, art, local book and five native packages.
- `scripts/moon-pearl/`: separate compiler/renderer, exact-package art importer and four test files.
- `tests/e2e/pearl-package-import.spec.ts`: actual owner file upload, preview, uncertain-save retry,
  READY revision and reload. `ui-workshop-links.ts` adds its isolated fixture identity.
- `package.json`, `.prettierignore`, context map, workflow and E2E instructions: entry points.
- `eslint.config.js`: excludes captured `reports/evidence/**/measurements/**` harnesses from
  active application linting, fixing a demonstrated project-service parse error. Architecture
  checks and active source coverage are unchanged.
- Evidence and handoff: `reports/evidence/moon-pearl-2026-11-08/`,
  `handoffs/MOON_PEARL_2026-11-08.md`.

All five packages pass the real compiler with READY and no findings. Default: 70 entities,
57 knowledge entries, three encounters and four quests; other party variants have 68, 69, 69
and 73 entities. The native importer creates an OWNER revision with opaque server identities.
Activation remains a separate explicit DM action. Curated art import checks the exact saved
package, verifies source bytes, uses existing World Engine commands and is idempotent.

## Verification

The detailed command ledger and exact package identities are in `verification.json`; captured
logs include unsuccessful initial attempts and later retests. No monolithic `pnpm validate`
success is claimed: its constituent checks were run explicitly, using an isolated local database
instead of environment-file defaults. The shared checkout contains concurrently authored work.

| Check                                                 | Result                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm pearl:build` / `pnpm pearl:book`                | Five READY packages; 42 linked pages                                                     |
| `pnpm pearl:check`                                    | 9 tests in 4 files passed                                                                |
| Revised Acorn tests / unchanged Lighthouse tests      | 9 + 9 passed separately                                                                  |
| Scoped format, lint and TypeScript                    | Passed for this campaign and its integration surface                                     |
| Global TypeScript / context budget / production build | Passed; context snapshot 1,894 active files, none over target                            |
| Full browser suite                                    | 247 passed, Chromium and iPad coverage, 11.7 minutes                                     |
| Native Moon import and four-width audit               | Passed; no measured layout or axe violations                                             |
| Full book layout                                      | 42 pages × 4 widths = 168 measurements, no non-info findings or axe violations           |
| Revised theatre/card and map retests                  | Rechecked after their respective changes; see measurements                               |
| PostgreSQL migrations                                 | 32 applied; second run applied none                                                      |
| Seed idempotency                                      | First: 188 accepted / 51 pictures; second: 188 duplicates / 51 present, same version 415 |
| Full integration suite                                | 368 passed; one test timed out under the concurrent load                                 |
| Isolated integration retest                           | Both tests in the affected file passed with unchanged timeouts and two workers           |
| Global unit retest                                    | 3,672 passed, 126 failed, 12 failed files; failures are outside the three family packs   |
| Global lint retest                                    | Two errors in concurrently edited `scripts/noir-campaigns/phrases.ts`                    |
| Global format retest                                  | 124 files flagged in concurrent work/evidence; scoped formatting passed                  |

The integration timeout also caused the affected test's cleanup to call `pool.end()` twice.
Both results are retained, rather than replacing the failed full run with the isolated success.
The explicitly created `ltw_moon_pearl_check_20261108` database was removed after verification.
Unidentified throwaway databases belonging to other runs were not swept.

Global unit failures concern unfinished collection exports, package/content checks and five
computed imports in their audit scripts caught by the existing architecture test. These active
parallel scopes were not rewritten or excluded to manufacture a green result. Earlier global
TypeScript and lint failures changed as those authors worked; only the recorded snapshots are
claimed. The production build retains the existing Vite warning about a chunk above 500 kB.

## Visual and editorial repairs

The light book was inspected at 1440, 768, 390 and 320 px; the native workshop's dark surface was
also inspected at all four widths. Cover, heroes, guide, chapter text, handout, tactical map, route
diagram and print-token closeups were reviewed. Focus and print behavior are recorded in evidence.
No dark book theme is offered. Browser measurements do not constitute a physical printer test.

Visual review caught route shortcuts passing behind unrelated city nodes. Those shortcuts now
curve through empty space; the graph's actual connections are unchanged. City labels were sized
to avoid collisions. The abandoned direct SVG screenshot timed out; the final SVG was rendered
locally for inspection and remains embedded in the audited maps page.

The owner's parallel originality audit identified a theatre-scene repetition with Acorn. Chapter
5 now follows an acoustic investigation: locate applause in an empty hall, establish the old
recording's provenance and reproduce a limited finding with an independent witness. Cast,
handout and later-outline outputs were aligned. The auditing chat reported A2/F1 VERIFIED_FIXED
for that revision; this is a limited editorial check, not a universal originality guarantee.

Its subsequent owner-authorized F2 correction to Acorn is separately documented in
`reports/ACORN_ORIGINALITY_REVISION_2026-11-08.md`. Lighthouse, previous delivery reports and
their captured evidence remain byte-identical for the 201 baseline files in `preservation.json`.
Acorn art is preserved; its explicitly authorized content delta has its own before/after manifest.

## Adversarial pass

| Attempt or alternate play                               | Result                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Recover the Pearl before evening 9                      | Later play becomes catalog verification and public exhibition preparation; no scripted re-theft                      |
| Treat repeated voice as proof of theft                  | Recording establishes an unreliable alibi only; access, order, crate route and object identification are independent |
| Skip archive/theatre or refuse an NPC                   | Physical records, witnesses and explicit alternate leads preserve progress                                           |
| Fail all indispensable rolls                            | All 22 central clues are inspect actions without mandatory DC                                                        |
| Arrive after the planned auction                        | Disputed-lot hold or notification to the purchaser preserves a return route                                          |
| Use the Pearl as telepathy/truth detector               | Authored limits prohibit either; voluntary recorded sounds have bounded provenance                                   |
| Force a drowning/sacrifice ultimatum                    | Dry niches, waiting and a city crew provide another route; postponement has practical costs                          |
| Treat planned scenes as history                         | Native state contains prior records only; future plans remain DM outline, never executed facts                       |
| Import a modified package with old art assumptions      | Exact-version match rejects the mismatch before importing                                                            |
| Retry import or encounter start                         | Real World Engine idempotency checks pass                                                                            |
| Reveal hidden NPC art through player metadata/raw bytes | Real HTTP projections deny both paths                                                                                |
| Require four heroes at a three-player table             | Three flexible roles and optional fourth-person variants; unselected hero/art binding absent                         |
| Turn restored ownership into compulsory forgiveness     | Responsibility, access and personal forgiveness remain separate decisions                                            |

The first prepared-encounter test tried to list the Glass Court encounter while heroes were still
at the museum. The fixture was corrected to move them through the real World Engine before the
query; no application contract was weakened. Every chapter, clue link, player navigation boundary,
selected original/runtime hash and the rejected edit-reference hash was checked.

## Limits and disposition

The authored campaign and its isolated technical checks are delivered. Whole-checkout validation
is not green while the explicitly listed parallel scopes remain unfinished. This delivery makes
no human playtest, emotional-effect, final-balance, production-import or deployment claim. Session
lengths are planning estimates. The family can begin from the local book; real application play
still requires the normal owner import, DM activation and deliberate art transfer.

PASS for the scoped campaign delivery; global validation remains PARTIAL as recorded above.

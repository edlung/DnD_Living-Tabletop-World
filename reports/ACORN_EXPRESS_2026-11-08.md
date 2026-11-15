# Acorn Express — complete second family campaign

Status: technically verified and delivered for owner play. Owner scope:
`work-orders/ACORN_EXPRESS_2026-11-08.md`. This is a separate content delivery, not a new numbered
product stage. The same session authored, implemented and checked the work; no independent or human
play acceptance is claimed.

## Delivered experience

«Экспресс “Тысяча Желудей”» is a standalone Russian woodland railway adventure for one adult DM and
three players, including ages 8 and 14. It contains twelve developed evenings and thirty-six scenes,
four selectable level-3 heroes, nine principal NPCs, twelve places including the region, fourteen
route connections, twenty-two essential inspectable clues, eighteen handouts, five narrative items,
three optional encounters, three matching tactical grids, a route diagram and printable figures.
The final three evenings provide the storm journey, a consequential choice of home and personal
letters on the return trip. There are three positive directions, safe deferral and honest handling
of a coercive or unresolved outcome. Later events are plans, not already executed facts.

The DM book has forty-one local HTML pages with a cream, jade and amber presentation, responsive
layouts, printable cards, staged hints, read-aloud passages, individual spotlight suggestions,
fail-forward routes, three practical station projects and personalised epilogue prompts. The
late handout includes three illustrated possible homes; the viaduct handout includes separate
stopper, brake and signal cards. HTML works offline from disk. The whole folder remains private
DM material; player navigation is a convenience, not a public-hosting security boundary.

Start with `campaigns/acorn-express/index.html`, `README.md`, `guide.html` and `sessions/01.html`.
Players start at `players.html`. The package and all four alternative party files are available
under `campaigns/acorn-express/`; every three-seat selection and the optional four-player party
materialize as READY through the real compiler. The main package has 68 entities, 56 knowledge
records, 12 situations, 4 observational quests and 3 encounters; it is below the import size limit.

## Art and reproducibility

Thirty-one original built-in imagegen outputs: thirteen scene paintings, eleven portraits,
two transparent figures and five item illustrations. Originals are kept in
`campaigns/acorn-express/assets/`; exact prompts and actual tool-output basenames are in
`assets/prompts.json`. Model version and monetary cost were not reported by that tool.
`assets/manifest.json` records the SHA-256 of originals and WebP conversions, dimensions,
transparency, intended reveal and subject bindings. Originals total 111,693,739 bytes; runtime
copies total 20,042,662 bytes. Conversion changes encoding only and preserves alpha.

The optional art operator uses the existing curated import and World Engine, defaults to read-only,
and requires an exact match to the frozen native campaign before resolving opaque entity IDs.
It rejects edited source, skips absent heroes, validates bytes before writing and remains
idempotent. The final cups scene is a DM-showable epilogue illustration, not a preselected ending.
No project image provider, paid API fallback or fabricated AI job was used.

## Changed surfaces

- New `campaigns/acorn-express/`: authored source, 31 PNG/WebP pairs, book, cards, maps, package,
  party variants, provenance and start instructions.
- New `scripts/acorn-express/`: cohesive content compiler adapter, sheets, optional encounters,
  renderer, asset conversion, exact-package art operator and tests.
- New `tests/e2e/acorn-package-import.spec.ts`; one separate `acorn-import` fixture in the existing
  testing link registry. E2E guidance documents ownership of this fixture.
- Root command aliases, generated-file formatting exclusions, the context map and current workflow
  now point to the second campaign. No production dependency or application behaviour change was
  necessary for this goal.
- This report, its handoff and evidence identify only this goal's changes against the captured
  starting workspace. The preceding Lighthouse delivery was already dirty. All 162 of its captured
  content, tooling and evidence files remain byte-identical.

## Verification

| Check                                            | Result                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| All five package files through real compiler     | READY, no findings                                                                                |
| Focused campaign tests                           | 9 passed in 4 files                                                                               |
| Full unit suite                                  | 3,614 passed in 414 files                                                                         |
| Full lint, typecheck, context budget             | Passed; 1,776 active files, none over target/hard limit                                           |
| Production build                                 | Passed; existing bundle-size advisory remains                                                     |
| Migration twice, seed twice in disposable DB     | Passed; repeated seed accepted 0 new events                                                       |
| Full integration suite                           | 369 passed in 71 files                                                                            |
| Full browser suite                               | 246 passed in 9.6 minutes, including the new real import journey                                  |
| Local book audit                                 | 164 measurements: 41 pages × 1440/768/390/320; 0 errors/warnings, 0 axe violations, unique titles |
| Final changed-page audit and native import audit | 32 book rechecks + 4 native import widths; no findings or axe violations                          |
| Format and final artifact identity               | Final format receipt and goal-specific SHA-256 manifest in evidence                               |

Validation was run as explicit components rather than the root `validate` wrapper: migration and
seed used the built JavaScript entry points with an explicit disposable database URL, without
loading environment files. Test storage is local or in memory. Production campaign activation,
deployment, credentials and external communications were outside this delivery.

Initial diagnostic failures are preserved honestly: art tests were first attempted before the
manifest was generated; the first full unit run saw one stale generated package after an editorial
rename and the sandbox denied a loopback socket test. After rebuilding and allowing the local
socket, the full unit suite passed. The first book audit started some text-only pages before their
CSS loaded and reported 23 undersized links; waiting for complete loading removed those findings.
The cover's text overlay was also strengthened following visual inspection. The return line on the route diagram was moved around intermediate stations, and the documented route count was corrected to fourteen. Print-token crops and a handout heading were corrected during the final visual pass. These are not human
playtest results.

## Adversarial and editorial pass

| Challenge                                                | Outcome                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Players infer the living passenger in evening 1–2        | Later scenes move to evidence, responsibility and practical help; they do not conceal the answer again                    |
| Skip or reorder a station                                | Independent witnesses, original records and ordinary letters preserve the route forward                                   |
| Fail every essential check                               | All 22 essential clues are inspect actions without DC; each scene has a specific continuation                             |
| Refuse combat or decline the storm chase                 | Three encounters have peaceful exits; an early warning turns the storm into safe work at a stop                           |
| Three players cannot cover four mandatory roles          | Three flexible actions; tasks can be sequential or supported by local workers; fourth hero is optional                    |
| Early agreement with Velt or prior removal of restraints | Later scenes respect that agreement and the actual installation state                                                     |
| Tosha already protected by the party                     | No offscreen abduction to force the climax; his location follows recorded decisions                                       |
| All heating projects delayed                             | Warm carriages and reduced routes provide a costly but safe fallback; no forced sacrifice ultimatum                       |
| Coercive or unresolved final choice                      | Honest non-graphic consequences and a concrete opportunity to revise it; no automatic happy ending                        |
| NPC knows a later scene before meeting the party         | Sol's knowledge is limited to an old recording; Berest knows general biology, not a future encounter                      |
| Unselected fourth hero                                   | No entity or art binding appears in the three-player native package                                                       |
| Public/player secret leakage                             | Initial knowledge excludes the mystery; hidden NPC portrait metadata and raw bytes are denied in the real HTTP projection |
| Stale art source or repeated import/start                | Exact-package rejection and idempotency verified through real in-memory activation and World Engine commands              |
| Art/encounter mismatch                                   | Tactical dimensions and terrain are rendered from encounter data; all original/runtime hashes and local links verified    |

No invented runtime outcome, state write outside the World Engine or independent-review label was
introduced. Manual chapter pacing and the affective quality of the ending still need the actual
family's feedback. The prepared encounters are conservative for three level-3 characters, but this
is editorial balancing rather than measured human play balance. Actual activation and local art
transfer remain explicit owner/DM actions described in the README.

Technical disposition: PASS. Owner/family play acceptance remains unclaimed.

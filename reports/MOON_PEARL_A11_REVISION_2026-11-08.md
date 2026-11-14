# Moon Pearl — A11/A12 tide-light revision

Scope: `work-orders/MOON_PEARL_A11_REVISION_2026-11-08.md`. The continuing owner-authorized
originality audit found two narrow repetitions. A11 concerned both family adventures interrupting
a weather transition with two automata taking tools and the same permission/disable/combat choices.
The first proposed replacement, a cargo/decorations decision, was then rejected under A12 because
its whole/seams/flat outcomes repeated Small Banner. That draft and its preliminary report are
preserved as rejected evidence. This report describes the subsequent implemented version.

## Result

Chapter 10.2 is now **«Три моря в одном окне»**. During a safe wait, the tide casts a changing
light pattern through the glass. Players independently describe it, compare positions, keep one
observer at a fixed mark, use a stationary white sheet to separate light from the wall pattern,
and remove a cup's shadow as a separate experiment. A personal image such as a fish or a hand
is distinguished from the visible lines; no metaphor is a hidden correct answer.

The group can preserve a sequence with position/time notes, retain different personal drawings,
or simply enjoy the moment. Drawing takes attention, so they decide whether to alternate observing
and recording. A missed phase remains unknown, and the next tide need not repeat it exactly.
No obligatory roll determines access to the sight or the value of a player's participation.

Chapter 11 reflects the actual choice: volunteered observations or drawings may stand beside the
exhibition, while a private experience remains private. Skipping the episode creates no invented
record. The light is not a founders' code, a new theft clue, a navigation safety signal, or an image
stored by the sound-only Pearl. The custodian's real crossing signal remains authoritative. The
Pearl stays in its actual custody, including offsite custody, throughout.

The final cross-check also corrected `world.truth[9]` / native `truth-10`: waiting may postpone
the meeting but does not damage decorations or cargo. The new chapter and its world facts now
describe the same consequence; the five packages and guide were rebuilt after that correction.

The obsolete **«Перепутанный маршрут»** encounter, both route automata and its generated battle
map were removed. The two unrelated optional encounters remain. Book counts, native entities,
tokens, art-binding manifest, handout and all five packages now agree. All 34 selected illustrations
and their original/runtime/provenance files are byte-identical; no art generation or editing was
needed. Acorn, Lighthouse, Small Banner and initial Moon delivery evidence were not modified.

## Verification

| Check                                       | Result                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Regression before encounter removal         | Failed as expected: the prepared list still contained three encounters                                   |
| Final `pearl:build`                         | All five variants READY, no findings                                                                     |
| Native default                              | 68 entities, 57 knowledge entries, 2 encounters, 4 quests                                                |
| Other native variants                       | 66, 67, 67 and 71 entities; all have 2 encounters                                                        |
| `pearl:art` / final `pearl:book`            | Updated bindings and 42 linked pages; original/runtime bytes unchanged                                   |
| Final `pearl:check`                         | 9 tests / 4 files passed                                                                                 |
| Removed encounter start                     | Old `scenario-3` start returns 404 and leaves the world version unchanged                                |
| Retained engine boundaries                  | Real activation, clue inspection, encounter start/retry, secret art and exact-version import checks pass |
| Final native owner import                   | Real upload, READY save, uncertain-response retry and reload passed                                      |
| Final scoped TypeScript / ESLint / Prettier | Passed                                                                                                   |
| Context budget                              | 1,902 active files, none over target or hard limit                                                       |
| Final affected-page layout                  | 7 pages × 4 widths, no non-info findings or axe violations                                               |

Affected pages: guide, handout catalog, light-observation card, maps, tokens and chapters 10–11.
Checked at 1440, 768, 390 and 320 px; representative chapter/card views were visually inspected.
The native import was measured at the same widths. Styles and application runtime code were
unchanged. Initial cargo-draft measurements are kept separately and are not the final verdict.
After the last world-truth correction, native import and all four guide widths passed again.

The narrative pass covers waiting without participation, disagreeing interpretations, a missed
phase, different positions versus passage of time, an extra shadow, offsite Pearl custody,
keeping a drawing private, and skipping the episode. Each has an explicit continuation. Comparing
Small Banner's actual source confirmed its cargo mechanism; the final Moon scene contains no
ready artwork transfer, seam/flat compromise, agreed repacking or delayed cargo opening.

All five packages were checked for removed encounter/entity keys and discarded cargo language.
Their later outlines contain the new chapter goal and DM constraints. The native schema includes
chapter goals/notes for later evenings, not every scene title; full play text remains in the book.
No application schema was changed to satisfy a text-search assumption.

## Identity and limits

Evidence: `reports/evidence/moon-pearl-a11-2026-11-08/`. `before.json` uses the prior delivered
identity for this pack and separately captures protected packs/evidence. `delta.json` records
changes/deletion and art preservation; `verification.json` records the final checks and package
hashes. The failed-before regression and rejected cargo draft remain visible.

The earlier full-suite delivery results are historical. This narrow content revision does not
claim a fresh full project regression, integration database run, or family playtest. Existing
saved campaigns are not silently rewritten: a fresh owner import creates the revised version,
and exact-package art matching deliberately rejects a different older package. No live game,
credentials, dependencies, deployment, provider job or other authors' source was changed.

The owner-authorized auditing chat subsequently closed A11 and A12 as VERIFIED_FIXED. Its final
retest compared the complete scene, chapter 11 link, corrected truth, 58 HTML fields, all nine
handout fields and all five packages; a second reviewer checked the causal difference from
Small Banner and Basalt. Evidence:
`reports/evidence/campaign-originality-followup-2026-11-08/a11-a12-final-retest.json`.
This is a limited check of the identified scene mechanisms, not a universal originality guarantee.

PASS for the scoped implementation checks; the specific A11/A12 editorial findings are closed.

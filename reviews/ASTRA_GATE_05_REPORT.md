# Gate 05 — Full Ravenford Red Team: FAIL

## Review header

- **Review ID:** ASTRA-GATE-05-INITIAL
- **Stage/Gate:** Integrated backend, Stages 0–180 / Gate 05 (review activity Stage 190)
- **Commit/Build:** Code `e9c05ad46c15863b124b20fc4dd217f654f29777`; tested HEAD `33d1c978ccddd876429452ca7e79615f109d43db`. The later commit adds only the Stage 180 completion report and Gate 05 request.
- **Date:** 2026-10-04
- **Reviewer model:** GPT-6 (Codex), independent review context. Astra/MAX was requested; the exact runtime variant and effort were not exposed for independent verification.
- **Inputs:** [Handoff](../handoffs/ASTRA_GATE_05_REQUEST.md), `ASTRA_MASTER.md`, `ASTRA_REVIEW.md`, gate mission, architecture invariants, Ravenford/product/adversarial requirements, coverage and prerequisite ledgers, applicable ADRs 0006–0025 and prior gate regression intent. Builder evidence was non-authoritative.
- **Surfaces tested:** All due backend rows: knowledge, permissions, memory, investigation, contradictions, combat/reactions, NPC isolation, AI authoring/continuity, relevance, assets/jobs, visual history, Chronicle/flashbacks, quest projection, integrated play, concurrency, undo, historical writers and PostgreSQL restart.
- **Overall result:** FAIL
- **Required surfaces unavailable:** None in the implemented backend slice. Requests exercise authenticated Fastify handlers via `inject()`. No separately listening deployment, live external model or real image provider was tested; clients and production authentication are addressed below.
- **Owner-approved dispositions:** ADRs 0021–0025 define bounded ranking, local placeholder images, current approved images in past presentations, lexical prose checks with authoritative structured entries, and a projected quest log. These choices were respected. **No owner-approved disposition accepts either finding below.**

## Decision

**G05-H01 blocks Gate 05:** a recorded Chronicle chapter does not protect the entity names its generated entries used, so undo can leave that chapter inconsistent with effective history. **G05-M01** also requires remediation: the quest log reconstructs an earlier examination using the evidence's current location, changing past milestones after a later move.

Both findings reproduce through normal authenticated routes and persist after PostgreSQL reload. **1476 unit tests and 67 integration tests pass**, but do not cover these schedules. Earlier Gate 04 fixes remain effective in the rerun probes.

## Findings

### [G05-H01] Chronicle allows undo beneath names its recorded entries depend on

- **Severity:** High
- **Invariants:** **11 — EVERY CANONICAL MUTATION IS AUDITABLE** and **12 — WORLD HISTORY IS RECONSTRUCTABLE** for supported temporal domains; ADR 0006 §8 dependency-preserving undo and ADR 0024 §4 require a standing chapter to protect what its entries rest on. Profiles are timeless corrections under ADR 0006.
- **Category:** Events / Rollback / Timeline / Observability
- **Preconditions:** Seeded Ravenford contains Elowen's placement in Market Square. A DM may rename an entity and generate a DM Chronicle.
- **Reproduction:**
  1. Submit `UpdateEntityProfile` for `elowen-starwhisper`, naming her `G05 NAME THAT MUST NOT SURVIVE UNDO`. It is accepted as `http:dm-ravenford:g05-history-1`.
  2. POST `/campaigns/ravenford/chronicle` with `perspective: DM`, `from: 0`. The accepted chapter includes the entry and prose `G05 NAME THAT MUST NOT SURVIVE UNDO went to Market Square.`
  3. Submit `UndoCommand` targeting the rename while the chapter stands.
  4. Reload the engine/application and read the DM Chronicle; re-decide the effective command log.
- **Expected:** Refuse the undo as `UNDO_UNSAFE`, naming the dependent chapter, until the DM explicitly undoes that chapter. A permitted undo must preserve the meaning and reproducibility of all standing commands.
- **Actual:** Undo returns **200 / accepted**. The canonical character and chapter participant reference revert to `Elowen Starwhisper`, but the stored entry and prose retain the now-undone name. The re-decision oracle identifies `GenerateChronicle` as **“decides differently under current canon”**. Ordinary replay and structural integrity still pass, so they alone miss the broken dependency.
- **Adjacent reproduction:** Renaming `market-square` instead of the character produces the same defect. Both cases survive restart. Undoing the chapter afterward recovers the oracle. Attempting to undo the source placement while the chapter stands is correctly refused, showing that only part of the required dependency is protected.
- **Evidence:** [Executable recipe](evidence/gate-05/HISTORY_BOUNDARY_PROBES.md), [results](evidence/gate-05/history-boundary-results.json), `chronicle[0..1]`. Each case uses its own database; chapter ID `chronicle.00000000-00a2-4000-8000-000000000001` is reused only across those isolated cases. The saved entry resolves to the original placement event, while its name came from a different, subsequently undone command.
- **Cause:** [salience.ts](../packages/domain/src/chronicle/salience.ts), lines 31 and 147–156, reads current profile names while producing entry text, but line 172 stores only the source event's **written** facts in `rests`. The [Chronicle footprint](../packages/domain/src/chronicle/decide.ts), lines 82–94, reads only the clock and those incomplete `rests`. The profile reads are absent.
- **Impact:** A permitted DM undo leaves an authoritative structured chapter entry and its traced rendering founded on a removed correction. Its source references and effective command history no longer explain the recorded content. This is a dependency failure in a persisted record, not merely poor live-model prose.
- **Remediation direction:** Record every fact used to derive a chapter, including names and other selection/rendering premises, and preserve the existing history contract for chapters already written with incomplete dependencies. Do not rewrite historical events or merely change displayed text after undo.
- **Regression required:** **Yes — `chronicle_protects_generated_name_dependencies`**. Include character and location names, other named event families, restart, explicit reverse recovery, and earlier-writer compatibility if the dependency contract changes. Require re-decision equality as well as replay and structural integrity.

### [G05-M01] Later evidence movement rewrites an earlier quest milestone

- **Severity:** Medium
- **Invariant:** **12 — WORLD HISTORY IS RECONSTRUCTABLE**; ADR 0025 §2 defines the quest as the party's own historical milestones, with source events and occurrence times. The quest remains a projection, but projects the wrong past.
- **Category:** Timeline / State / Observability
- **Preconditions:** The Missing Caravan is active. Strange Symbol is examinable, and the DM can move it through `PlaceEntity`.
- **Reproduction:**
  1. As Elowen, enter the Old Trade Road and Abandoned Caravan Site, then inspect `strange-symbol`.
  2. GET `/campaigns/ravenford/quests?perspective=PARTY`: `evidence-examined` appears, sourced to that examination.
  3. Advance world time by 3600 seconds and, as DM, move the symbol to `north-gate`.
  4. Read the quest again and after restart.
- **Expected:** The party still examined the evidence at the site earlier. A later movement changes its current location, not that completed historical occurrence.
- **Actual:** **`evidence-examined` disappears**, although the examination event is unchanged and was not undone. Restart preserves the omission. Undoing only the later movement restores the milestone.
- **Reverse case:** Move the symbol to Market Square first, inspect it there, then advance time and move it to the caravan site. The quest now **adds `evidence-examined` retrospectively**, citing the original examination in town. No examination at the site occurred.
- **Evidence:** [Executable recipe](evidence/gate-05/HISTORY_BOUNDARY_PROBES.md), [results](evidence/gate-05/history-boundary-results.json), `quest[0..1]`, including unchanged examination records and before/after quest responses. Each case uses its own PostgreSQL database. Replay/integrity and PUBLIC/outsider controls pass.
- **Cause:** [projection.ts](../packages/domain/src/quest/projection.ts), lines 121–127, looks up `state.entities.get(entityId)?.placement` while iterating an older `EvidenceExamined` event. This is the entity's present placement, not its placement when the examination happened.
- **Impact:** Players lose earned progress or receive an invented historical milestone because of a later DM movement. The unchanged source event appears to support a place where the examination did not occur. Canonical event rows remain intact.
- **Remediation direction:** Resolve the examination's location from the effective history at that event's position, respecting world time and same-time command ordering. Avoid using current placement as historical evidence. Review adjacent milestone predicates for the same error.
- **Regression required:** **Yes — `quest_examination_uses_location_when_examined`**. Include moves away and into the site, same-time ordering, later-time moves, restart, and independent undo of movement versus examination.

## Independent validation

| Check                                                                                                                                                 | Result                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                                                                           | PASS — 145 files, **1476 tests**, including integrated Ravenford                                                                               |
| `pnpm test:integration`                                                                                                                               | PASS — 18 files, **67 tests**                                                                                                                  |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`                                                                                                           | PASS                                                                                                                                           |
| `pnpm context-budget`                                                                                                                                 | PASS — 465 active files, none over 500/700 lines                                                                                               |
| `pnpm format:check`                                                                                                                                   | PASS after formatting new review artifacts                                                                                                     |
| [History boundary recipe](evidence/gate-05/HISTORY_BOUNDARY_PROBES.md) / [results](evidence/gate-05/history-boundary-results.json)                    | **Both findings reproduced**, two variants each, with PostgreSQL restart and controls                                                          |
| [AI consumer recipe](evidence/gate-05/AI_CONSUMER_PROBES.md) / [results](evidence/gate-05/ai-consumer-results.json)                                   | PASS — 7 ranking modes, 4 Chronicle modes, **17 captured provider requests**, trace/flashback permissions and restart                          |
| [Asset/visual recipe](evidence/gate-05/ASSET_VISUAL_PROBES.md) / [results](evidence/gate-05/asset-visual-results.json)                                | PASS — safe metadata/content, variants, unknown entities, Day 1 after Day 60, cancellation/late completion/authoring undo, lineage and restart |
| [Scenario/sweep recipe](evidence/gate-05/SCENARIO_SWEEP_PROBES.md) / [results](evidence/gate-05/scenario-sweep-results.json)                          | PASS — 167 commands, 283 events; restart parity; **164 independent undo attempts: 40 accepted, 124 refused, no divergence**                    |
| [NPC regression](evidence/gate-05/regressions/NPC_PROBES.md) / [results](evidence/gate-05/regressions/npc-results.json)                               | PASS — 66 exchanges, **72 captured provider requests**, three NPCs, five attitudes, injection/fallback/repair and trace checks                 |
| [Authoring regression](evidence/gate-05/regressions/AUTHORING_PROBES.md) / [results](evidence/gate-05/regressions/authoring-results.json)             | PASS — 18 groups: horizon, permissions, validation, options, consent, atomicity, stale state and provenance                                    |
| [Concurrency regression](evidence/gate-05/regressions/AUTHORING_RACE_PROBES.md) / [results](evidence/gate-05/regressions/authoring-race-results.json) | PASS — 64 ordered races, 4 retry groups, 2 process-loss cases; actual separate Node processes for PostgreSQL races                             |
| [Suggestion regression](evidence/gate-05/regressions/SUGGESTION_PROBES.md) / [results](evidence/gate-05/regressions/suggestion-results.json)          | PASS — reaction pause, four resolution paths, restart and accepted subsequent suggestions                                                      |
| [State regression](evidence/gate-05/regressions/STATE_PROBES.md) / [results](evidence/gate-05/regressions/state-results.json)                         | PASS — 44 disclosure, generated-name dependency, recovery and Insight cases                                                                    |
| [Earlier-writer regression](evidence/gate-05/regressions/HISTORY_PROBES.md) / [results](evidence/gate-05/regressions/history-results.json)            | PASS — 103 old-reader prefix comparisons, 102 historical undo attempts and 12-command reverse recovery/reload                                  |

[Results index](evidence/gate-05/results.json) records the revisions, checks, findings and limits. All ten recipes were executed. The history-boundary recipe deliberately asserts the defects: its successful execution supports **FAIL**. The other recipes assert the expected behavior. No implementation fix was made.

## Coverage: directed and emergent attacks

**Pass A — invariant-directed attacks:** full prior suites and fresh regression probes exercise direct/indirect scope leakage, forged roles, disclosure and epistemic types, impossible memories and authoring, illegal combat/reaction actions, canonical mutation, duplicate/conflicting commands, rollback and provenance. New probes inspect exact ranker/Chronicle inputs, reject action-set manipulation and invalid citations, reject a stale chapter after a concurrent world-time change, exercise asset approval/worker permissions, cancel external work during authoring undo, and reconstruct old visual state. No forbidden supplied context or unauthorized canonical mutation was demonstrated in these cases.

**Pass B — emergent attacks:** rename a profile used by an already-recorded source event, generate a chapter, then undo the rename; move evidence after an examination and compare the earlier quest transition in both directions; sweep every effective undoable command of the completed story on an independent fork. The first two combinations produce H01 and M01. The integrated-story sweep passes, illustrating why happy-path oracles do not replace adversarial scheduling.

| Backend row due at Gate 05                                | Evidence / disposition                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 20: knowledge, perspectives, serialization and errors     | Full suites, NPC/provider scans and new route permissions pass in exercised cases                    |
| 30: scoped memory and temporal retrieval                  | Full suites, historical comparisons, disclosure/state probes and flashback controls pass             |
| 50–70: context, investigation and contradictions          | Full suites and playthrough; epistemic records retain types; M01 affects their new quest consumer    |
| 90: reactions, ordering, concurrency and undo             | Full suites and four-path suggestion regression pass                                                 |
| 100–120: intent horizon, authoring and continuity         | Authoring and 64-race probes pass; asset work correctly holds authoring undo                         |
| 130: NPC isolation, dialogue and actions                  | 72 exact requests and prior regressions pass; Talk does not mutate canon                             |
| 140: legal-action ranking and deterministic fallback      | New 7-mode probe and full suites pass; action details/legality preserved                             |
| 150–160: asset identity, jobs and historical presentation | New probes and full suites pass, including Day 60 retrieval and late discarded output                |
| 170: Chronicle and flashbacks                             | Scoped inputs, types, fallback and source access pass; **H01 blocks dependency-safe Chronicle undo** |
| 180: integrated backend and quest projection              | Played slice, semantics-ledger suite and undo sweep pass; **M01 breaks historical quest milestones** |

No backend row was deferred as a future surface. UI consumers are **NOT YET IN SCOPE**: Stages 200–230 must add boundary/E2E checks, Stage 240 supplies usability evidence, and Stage 250 links release-candidate evidence. Reopen affected gates when client or backend changes invalidate coverage. Production authentication remains the explicit owner decision in `docs/IMPLEMENTATION_PREREQUISITES.md` Q4 for session/auth UX at Stage 200 if production is intended, and before deployment; this review does not certify development persona tokens for production. External image generation is a separate future owner decision under ADR 0022.

## Limits and final summary

- **Findings:** 0 Critical, **1 High**, **1 Medium**, 0 Low. **Exact High blocker: G05-H01.** G05-M01 also lacks an owner-approved disposition.
- **Invariants exercised:** 1–18 and 20–23 through the implemented backend and full regression suites. Invariant 19's real UI/full-data access behavior remains a client-stage obligation. Findings concern **11 and 12**; no new secret-context disclosure was demonstrated.
- **Residual risk:** Finite scripts do not exhaust histories, schedules or model behavior. Provider tests capture exact local/scripted inputs; they do not measure live quality, latency or cost. Chronicle hedging is lexical by accepted ADR 0024; these checks do not prove arbitrary prose entails only its sources. Placeholder images test contracts, not a real generator's output quality.
- **Execution limits:** One complete set of independent recipes creates/removes **50 owned PostgreSQL databases** and one old-reader archive. Old-reader comparison asserts and omits only newly introduced empty collections (`investigation.shown`, assets, weather, chronicles); no historical rows are rewritten. No development database reset, root dependency reinstall, full CI wrapper, separate listening deployment or live external-provider call was performed. Process loss tests do not exhaust storage failover or network partitions; proposal locks retain the documented absence of a timeout.
- **Changed files:** Only this report and new evidence under `reviews/evidence/gate-05/`. Source, existing tests, fixtures, handoffs, completion reports and all prior reviews/evidence are unchanged.

Return to **Claude Opus 5.5 / MAX** under `EFFORT_MATRIX.md`: add failing regressions, remediate the findings, preserve older-writer compatibility, write `remediation/OPUS_GATE_05_REMEDIATION.md`, update the handoff for retest and STOP. Then request **GPT-6 Astra / MAX Retest 1** at `reviews/ASTRA_GATE_05_RETEST_1.md`. **Stage 200 remains blocked.** Review stops here.

FAIL

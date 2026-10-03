# Stage 70 Completion Report — Contradiction Engine

- Work order: `work-orders/OPUS_STAGE_070.md`
- Builder: Claude Opus 5.5 (matrix: MAX)
- Implementation revision: `781dc750cafbd5fa6ec4d3168be6091c1c823ae8` (branch `main`)
- Formal gate: **Astra Gate 02 — Contradiction / Knowledge Integrity**. Handoff: `handoffs/ASTRA_GATE_02_REQUEST.md`.
- Status: **AWAITING_ASTRA_REVIEW**. Stage 80 is not authorized until Gate 02 passes.

## Decisions

| ADR                                                                                                                                                                                                               | Decision                                                                                                                                                                                  | Approval                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0014](../docs/adr/0014-contradictions-and-epistemic-integrity.md)                                                                                                                                                | DM-only structured claims; deterministic contradiction detection in the joint holder scope; neutral wording; valid transitions; player-result hardening; contradiction relevance; fixture | Approved as written by the owner on 2026-10-03, before implementation. Owner choices: valid transitions only through new DM-authored records; claims visible to the DM only |
| Amendments: [0008](../docs/adr/0008-knowledge-boundary.md), [0012](../docs/adr/0012-context-engine.md), [0013](../docs/adr/0013-investigation.md), [0007](../docs/adr/0007-world-kernel-model-and-event-store.md) | Transition question closed; contradiction relevance; player results; defect fix and engine event guard                                                                                    | Follow from ADR 0014 or are technical                                                                                                                                       |

**Disclosed post-approval detail** (ADR 0014 §4, implementation note). It only tightens the approved text:

- Player results keep an always-empty `events` field.
- Player results drop rejection details, except schema issues about the player's own input.
- Players may not send `expectedVersion`; the request is rejected with 400, so stream versions stay out of player views (ADR 0008).

## Delivered

- **Claims.** The DM attaches a claim (subject, aspect, value) to a held, asserting record or to a clue with `SetClaim`.
  - The subject must already be one of the record's (or clue's) subjects. Claims are immutable.
  - Records shared by NPCs and evidence revealed by clues inherit the source's claim.
  - Claims appear only in DM views.
- **Detection.** Runs after every accepted decision and is deterministic.
  - Same subject and aspect with a different value is a conflict.
  - The conflict is recorded once per pair as a CONTRADICTION record, and only in the one holder scope whose audience sees both records. WORLD_TRUTH and DM are never compared.
  - The wording is neutral: "Conflicting accounts of X: A and B disagree." It quotes no statement and names no aspect or value.
  - The CONTRADICTION carries `CONTRADICTS` relations to both records, plus a DM-only `ContradictionDetected` event.
  - Undo dependencies are explicit: both records, both claims, and party membership.
- **Integrity.**
  - No type, statement, or relation of any existing record ever changes.
  - Facts come only from new DM-authored records.
  - Contradictions count as open questions for Context Engine relevance.
- **Fixture:** `contradiction-seed.json`. Asking Thorne about the caravan surfaces the Mira/Thorne contradiction for the party only.
- **Defect fixed (Stage 60, found by the randomized replay test).** Undoing an inspection that found nothing produced an empty `CommandUndone`, so the stream could not be reloaded. Such undo is now `NO_EFFECT`. The engine also validates every drafted event against the stored-event schema before appending. A regression test covers the case.

## Validation gate evidence — "Contradiction and knowledge-integrity deterministic tests pass"

| Item                      | Evidence                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mira/Thorne contradiction | `packages/domain/src/contradiction/detection.test.ts`: one PARTY contradiction with a neutral statement; both testimonies unchanged and still TESTIMONY; no FACT; no verdict words; NPC, PUBLIC, and other scopes see nothing; recorded once; absent `asOf` before detection               |
| Joint scope               | `joint-scope.test.ts`: every row of the ADR table, both orders, including WORLD_TRUTH/DM → none                                                                                                                                                                                            |
| Evidence vs. hypothesis   | `detection.test.ts`: a clue-claimed evidence record contradicts the party's goblin hypothesis, which stays a byte-identical HYPOTHESIS                                                                                                                                                     |
| Claims are DM data        | `detection.test.ts` and `contradiction-routes.test.ts`: no claim, aspect, or value in non-DM views or player results; DM views show claims                                                                                                                                                 |
| SetClaim rules            | `set-claim.test.ts`: holder scopes and asserting types only; subject must already be named; once only; DM-only; strict slugs                                                                                                                                                               |
| Randomized integrity      | `epistemic.property.test.ts`, 6 seeds, with an independent oracle: exact pairs and scopes; types never change; every perspective sees exactly its records and contradictions; canaries and claim slugs absent where they must be; replay and integrity hold, also after random claim undos |
| Undo/replay               | `contradiction/undo-and-replay.test.ts`; `investigation/undo-and-replay.test.ts` (regression)                                                                                                                                                                                              |
| HTTP end-to-end           | `apps/server/src/http/contradiction-routes.test.ts`: player path to Thorne, contradiction views and related records, other scopes empty, DM claims, hardened player results                                                                                                                |
| PostgreSQL                | `investigation.integration.test.ts`: contradictions persist and rebuild after a restart                                                                                                                                                                                                    |
| Context relevance         | `packages/context/src/relevance.test.ts`: a visible contradiction raises the topic; an NPC-only contradiction has no effect                                                                                                                                                                |

Mutation checks, each detected:

- PUBLIC + X broadened to PUBLIC
- different NPCs joined
- non-party character joined with PARTY
- agreement counted as conflict
- pair dedupe removed
- statement changed
- claims shown in non-DM views
- claim read missing from the footprint
- party-membership read missing
- shared copies lose claims
- player results unstripped
- contradiction not an open question
- claim subject unchecked
- empty undo allowed

## Commands and results (Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                                                                | Result                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local`                                                                               | PASS (format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration)                                                                                       |
| `pnpm test`                                                                                            | PASS — 50 files, 706 tests                                                                                                                                                        |
| `pnpm test:integration`                                                                                | PASS — 5 files, 19 tests                                                                                                                                                          |
| `pnpm context-budget`                                                                                  | PASS — 183 files, 0 over 500 lines                                                                                                                                                |
| Fresh volume: `pnpm db:migrate`; `pnpm seed:ravenford` ×2                                              | PASS — 83 commands → version 92, 21 entities; the second run writes nothing                                                                                                       |
| Built server, live `curl`: PARTY before/after asking Thorne, `NPC:mira-vale`, player `expectedVersion` | PASS — one neutral PARTY contradiction; none for Mira; player results carry only `outcome`; 400 for `expectedVersion`. The development database was then reset and reseeded clean |

## Assumptions and limitations

- Conflict uses strict value equality on DM-authored slugs. Compatible accounts must share a value. Nothing is inferred from text.
- Players cannot set claims; their hypotheses contradict only through DM claims.
- There is no command to leave the party. A future one must respect contradiction footprints.
- Earlier limitations still apply: dev authentication, no disguises, policy-only disclosure until Stage 130, Detect Magic at Stage 80, and travel without time.

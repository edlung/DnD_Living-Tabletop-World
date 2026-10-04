# Stage 120 Completion Report — Continuity Engine

- Work order: `work-orders/OPUS_STAGE_120.md`
- Builder: Claude Opus 5.5 (matrix: MAX)
- Implementation revision: `0c396d54c77c0d2766f4d3937e64354ea9fbaf2c` (branch `main`)
- Formal gate: none at this stage. Gate 04, after Stage 130, reviews Stages 100–130 (`docs/GATE_COVERAGE.md`).
- Status: **COMPLETE**. Stage 130 is not started and needs explicit authorization.

## Decisions

| ADR                                                                                                                                                                                                                                                                                                                              | Decision                                                                                                                                                                                                                                                                                      | Approval                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0019](../docs/adr/0019-continuity-engine.md)                                                                                                                                                                                                                                                                                    | Continuity checks by domain, with explanations and options. Relationships: an NPC's attitude toward the party. Lore as claims, including DM claims on world truth.                                                                                                                            | Chosen by the owner on 2026-10-04, before implementation: (1) "block + warnings" — see §2; (2) attitude toward the party (the relationship part of Q2; the runtime GUARDED-disclosure rule stays open for Stage 130); (3) claims including world truth. These answer the Stage 120 part of Q1. |
| Amendments: [0006](../docs/adr/0006-temporal-model-and-undo.md), [0007](../docs/adr/0007-world-kernel-model-and-event-store.md), [0013](../docs/adr/0013-investigation.md), [0014](../docs/adr/0014-contradictions-and-epistemic-integrity.md), [0017](../docs/adr/0017-ai-gateway.md), [0018](../docs/adr/0018-ai-authoring.md) | Relationship undo and premises (0006). New command, events, and version guard (0007). Attitude does not change disclosure yet (0013). Truth claims and quoted names (0014). AI proposals may contain claims and relationships (0017). New operations, checks, issue keys, and options (0018). | Follow from ADR 0019 and the owner's choices                                                                                                                                                                                                                                                   |

**One fix outside the stage's scope.** The extended randomized test found a footprint gap dating from Stage 70: a contradiction's neutral statement quotes names, but nothing recorded that dependency. Undoing a rename beneath a standing contradiction was therefore allowed, after which re-deciding it gave another statement.

- `ContradictionDetected` now lists the names it quotes (`named`, an additive field) and reads them. Such an undo is refused (ADR 0014 amendment, `contradiction/named.test.ts`).
- Events written before this lack the field and read only the subject's name. For them the gap remains as it was.

## Delivered

- **Checks**, in `packages/domain/src/authoring/continuity/` (timeline, geography, identity, knowledge, lore):
  - **Blocking:** `KNOWN_AFTER_DEATH`, and a dead NPC's attitude change (`TARGET_DEAD` in the kernel).
  - **Warnings:** `SPEAKER_NOT_ALIVE`, `MOVES_THE_DEAD`, `ENCOUNTER_HERE`, `RENAME_KNOWN`, `DUPLICATE_ACCOUNT`, `CLAIM_CONFLICT`, `DISCLOSURE_AGAINST_ATTITUDE`.
  - **Note:** `CLAIM_AGREES`.
  - **Stage 110 checks** are unchanged and now carry explanations and options.
- **Explanations and options.** Each finding names the entities, records, and world times involved. Each issue has a key.
  - Options are concrete revisions: an edit, a removal together with its dependents, or a repair for a rule rejection (a fresh entity or record ID, a time inside the allowed bounds). Warnings also offer an acknowledgement.
  - The server applies an option only on the DM's request (`POST …/revisions` with `{ basedOnRevision, optionId }`). The new revision records which option it applied and gets a fresh preview. A stale or unknown option answers 409; an acknowledgement answers 422.
- **Relationships:** `SetRelationship` produces `RelationshipChanged` and its state; undo, footprint, and integrity are covered.
  - A DM or the system sets it directly; an authoring proposal sets it at L2.
  - It is DM-only and creates no memories.
- **Lore:**
  - Proposals may set claims on NPC records (L2).
  - The DM may set claims on WORLD_TRUTH records, which contradiction detection never joins.
  - Continuity compares each new claim with every claim on the same subject and aspect, in every scope, on clues, and in world truth.
- **Exactness:**
  - `AuthoringPremisesRecorded` (reads only) records a holder's status when the death check read it.
  - Event types introduced after the dependency contract refuse version 1.
- **AI gateway:** the validator accepts a claim only on a record the same proposal adds, and a relationship only for a known NPC. The prompt asks for relationships only when the request says so.

## Validation gate evidence — "Conflicts are surfaced, not silently rewritten; Stage 110 regressions pass; warnings never bypass protected invariants or permit partial mutation"

| Item                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conflicts surfaced, with explanations | `continuity-checks.test.ts` covers each new check, its message, and its severity: Mira learning after her death; testimony from a dead speaker; moving the dead; a fight running here; a duplicate account; a hostile or wary NPC made willing; claims agreeing with Mira and conflicting with Thorne; a claim conflicting with world truth. `assess.test.ts` checks renames of known NPCs. Over HTTP, `authoring-options.test.ts` checks the warnings, notes, and messages.                             |
| Not silently rewritten                | Options leave the proposal unchanged; viewing never creates a revision. Only an explicit request applies an option, and the result is a new revision that needs its own preview and confirmation (`options.test.ts`, `authoring-options.test.ts`). Applying an option resolves what it was offered for (`options.test.ts`).                                                                                                                                                                              |
| Stage 110 regressions                 | Every Stage 110 suite passes unchanged except one assertion: renaming Mira now also yields the new `RENAME_KNOWN` warning, while the old `NAME_IN_USE` warning still fires. The full Tomas HTTP flow, routes, PostgreSQL tests, and the randomized property test all pass.                                                                                                                                                                                                                               |
| Warnings never bypass invariants      | Acknowledging a blocking issue's key does not commit it: the result is `AUTHORING_INVALID` with nothing changed (`options.test.ts`). Unacknowledged warnings still give `CONFIRMATION_REQUIRED` (Stage 110 tests). Consent stays a commit-time gate.                                                                                                                                                                                                                                                     |
| No partial mutation                   | Every rejection leaves the stream version unchanged, checked after every step of the randomized test. Stage 110's atomicity tests pass.                                                                                                                                                                                                                                                                                                                                                                  |
| Exact under undo                      | `options.test.ts`: undoing a resurrection beneath a commit that rested on it is refused. `relationships.test.ts`: an NPC cannot be undone beneath its attitude, and undo restores attitudes in reverse order. `named.test.ts`: an undo of a quoted rename is refused. The randomized test — 6 seeds × 90 steps, with claims, attitudes, deaths and resurrections, renames, and undo — runs the re-decision oracle after every accepted undo and at the end, plus replay, storage round trip, and reload. |
| Lore and secrecy                      | Truth claims never produce contradictions (`detection.test.ts`, and the Stage 70 randomized oracle with truth claims enabled). Attitudes and claims never reach player views (`relationships.test.ts`, `authoring-options.test.ts`).                                                                                                                                                                                                                                                                     |
| PostgreSQL                            | `authoring.integration.test.ts`: relationships, premises, and an applied option survive a restart; the new events are stored at version 2.                                                                                                                                                                                                                                                                                                                                                               |

**Mutation checks:** I injected 17 defects one at a time and reverted each; every one was detected:

- no death check;
- no premise recorded;
- the premise reads nothing;
- the relationship event reads no NPC;
- the contradiction ignores quoted names;
- a dead NPC's attitude changes;
- truth claims are refused;
- each of the seven new warnings is silenced (seven mutants);
- a removal leaves dependents behind;
- a relationship event at version 1 is accepted;
- claims are allowed on any record;
- the server applies any option.

## Validation

`pnpm validate:ci-local` exited 0 (`NODE_ENV=test`, docker-compose PostgreSQL 18). It ran:

- frozen install, format, lint, typecheck;
- context budget: 348 files, none over the limits;
- unit tests: 104 files, 1188 tests passed (34 more than Stage 110);
- clean build;
- migrate twice;
- seed twice;
- integration tests: 13 files, 55 tests passed.

## Residual risks and notes

- **Free-text lore is not compared**, only claims. For example, "a lifelong resident" against an eight-month arrival (ADVERSARIAL D2) is not caught unless the DM records it as claims.
- **The encounter check is unit-tested on a synthetic encounter.** The domain package cannot start a fight without `@ltw/combat`.
- **The quoted-names gap remains for contradictions recorded before this stage.** They lack `named`, and their statements keep the names they were written with.
- **Attitudes do not yet affect what NPCs share.** Stage 130 decides that, and which conditions make a GUARDED record shareable.
- **Stage 110 notes still apply.** No asset requests yet (Stage 150); the Anthropic adapter has not been run against the live API; a retried commit after success answers 409.

# Astra Gate 02 — Contradiction / Knowledge Integrity

- **Review ID:** ASTRA_GATE_02_INITIAL
- **Stage/Gate:** Stage 70 / Gate 02; includes Stages 30 and 50–60 and affected Gate 01 regressions
- **Code revision:** `781dc750cafbd5fa6ec4d3168be6091c1c823ae8`
- **Checkout revision:** `d7b57ce293bdce8fe59c43338ca41c6815bdff8d`. Only the Stage 70 completion report and Gate 02 handoff differ from the code revision.
- **Date:** 2026-10-03, Europe/Oslo
- **Reviewer model:** GPT-6 / Codex, independent Astra reviewer role. Requested configuration: GPT-6 Astra / MAX, per the handoff and `EFFORT_MATRIX.md`; runtime model alias and effort are not independently exposed to the reviewer.
- **Surfaces tested:** Knowledge, memory retrieval, sessions, entity context, player/DM commands, claims, contradiction detection, discovery/conversation memories, error/result serialization, caches, persistence, restart and undo.
- **Overall result:** FAIL
- **Required surfaces not tested:** None identified for the current gate. Future obligations are recorded below.
- **Owner-approved nonblocking dispositions:** None. The handoff's known limitation concerning undo dependencies is not an approved invariant exception.

## Assessment

Two blocking High findings were independently reproduced:

1. **G02-H01:** Memory location filtering exposes the existence and containment relationship of a hidden location through result membership and counts.
2. **G02-H02:** Undo can remove the knowledge or memory that authorized a player to enter a remote location while leaving that dependent movement effective.

Both reproduce with in-memory and PostgreSQL storage. G02-H01 also reproduces through a fresh engine over the persisted database. The normal validation pipeline passes, so its current tests do not catch these cases.

No additional violation was reproduced in the tested contradiction/type-transition behavior: conflicting testimony stayed testimony, player hypotheses stayed hypotheses, claim data stayed out of player results, and the tested joint-scope contradictions did not contaminate NPC knowledge.

## Authority and method

Read the Gate 02 handoff, `ASTRA_MASTER.md`, the Gate 02 mission in `ASTRA_GATE_PROMPTS.md`, `ASTRA_REVIEW.md`, `EFFORT_MATRIX.md`, `AGENT_WORKFLOW.md`, the context map, coverage ledger, applicable directory instructions and the prior Gate 01 report's scope/obligations.

Applied the handoff's authoritative sections of `ARCHITECTURE_INVARIANTS.md`, `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, `RAVENFORD_SPEC.md`, and `ADVERSARIAL_TESTS.md` A/B/C/G/I/J; product ADRs 0008, 0010, 0012, 0013 and 0014; HTTP ADR 0009; and temporal/undo ADR 0006. ADR 0011 supplied the approved skill-check/fixture background.

Inspected the public contracts, HTTP handlers, perspective and projection boundary, memory matcher/authoring rules, context inputs/actions, player command decisions/outcomes, claim detection/joint scopes, authorization, and undo footprints. Builder explanations and passing tests were treated as evidence to challenge, not authority to waive requirements.

The review made no changes to implementation, existing tests, fixtures, handoffs or prior reports. Authorized scenario writes ran only in fresh in-memory state and a throwaway PostgreSQL database. The ordinary development campaign remained at seed version 92. The temporary database was dropped and the review's live server was stopped cleanly.

## Findings

### G02-H01 — Hidden location ancestry influences scoped memory results

- **Severity:** High
- **Invariant(s):** **5 — NO KNOWLEDGE LEAKAGE.** Also violates ADR 0008's uniform absence requirement for hidden entities and the Stage 30 indirect-location retrieval boundary required by `docs/GATE_COVERAGE.md`.
- **Category:** Knowledge / Permission
- **Preconditions:** A visible memory names a known child location. Its canonical parent is not known or perceived by the requesting perspective. The caller can submit a candidate parent ID; knowing/guessing an ID is not authorization to learn whether it exists or contains the child.
- **Boundary implicated:** [memory/retrieval.ts](../packages/domain/src/memory/retrieval.ts), lines 147–154. The location predicate calls `isWithinLocation` on canonical state without a perspective or authorized containment boundary. Filtering memory records by scope beforehand does not protect the hidden location graph consulted afterward. [knowledge/projection.ts](../packages/domain/src/knowledge/projection.ts), lines 30–48, confirms that a memory naming a child does not automatically make its ancestors known.

**Exact reproduction**

Use a fresh seeded test campaign. Submit the following commands as the DM through `POST /campaigns/ravenford/commands`, each wrapped in `{ "commandId": "<unique key>", "command": ... }`:

```json
{"type":"CreateEntity","entityId":"hidden-vault","kind":"location","name":"Secret vault","existsSince":null,"location":{"type":"site","parentId":null}}
{"type":"CreateEntity","entityId":"known-room","kind":"location","name":"A remembered room","existsSince":null,"location":{"type":"room","parentId":"hidden-vault"}}
{"type":"RecordMemory","memoryId":"room-memory","scope":{"kind":"PUBLIC"},"memoryKind":"DECISION","summary":"A remembered room.","occurredAt":0,"locationId":"known-room"}
```

Elowen remains elsewhere. With `Authorization: Bearer dev-player-elowen`, issue:

```text
GET /campaigns/ravenford/entities/hidden-vault/knowledge?perspective=PLAYER
GET /campaigns/ravenford/entities/hidden-vault/context?perspective=PLAYER
GET /campaigns/ravenford/memories?perspective=PLAYER&location=hidden-vault
GET /campaigns/ravenford/memories?perspective=PLAYER&location=missing-vault
```

- **Expected behavior:** A hidden location and a nonexistent location must be indistinguishable. Neither result membership, total, score nor ordering may confirm the hidden entity or its private containment relationship. Legitimate authorized location filtering must remain available.
- **Actual behavior / evidence:** Both direct entity routes return **404**. The memory filter for `hidden-vault` returns **200, `total: 1`**, containing `room-memory`; the nonexistent location returns **200, `total: 0`**. The same differential occurs for PUBLIC, PARTY, PLAYER and Mira's NPC scope. It persists after PostgreSQL reload. See the three `G02-H01` entries in [results.json](evidence/gate-02/results.json).
- **Impact:** An unauthorized caller can confirm a concealed location and infer that a visible memory's location is inside it. The leak is a canonical relationship/existence oracle, not a demonstrated recovery of the Ashen Circle narrative. No escalation to DM and no forbidden memory record are needed during the read attack.
- **Suggested remediation direction:** Make location matching respect the requesting perspective and the permitted location/containment model. Hidden and absent targets must produce equivalent results; do not merely remove a field from the response or disable all nested-location retrieval. Add a noninterference check where only inaccessible ancestry differs.
- **Regression test required:** **Yes.** `recall_hidden_parent_matches_absent_without_disclosing_containment`, parameterized over PUBLIC/PARTY/PLAYER/NPC, memory/PostgreSQL and reload. Assert equal status, totals, IDs, scores and ordering for hidden versus absent targets; retain a positive authorized nested-location case.

### G02-H02 — Undo misses the knowledge/memory prerequisite of player movement

- **Severity:** High
- **Invariant(s):** **1 — WORLD ENGINE IS AUTHORITY**, specifically validation of the permitted undo transition; **12 — WORLD HISTORY IS RECONSTRUCTABLE**, under ADR 0006's current-canon and dependency-preserving undo contract. ADR 0006 §8 explicitly requires `UNDO_UNSAFE` when a later effective event read a fact written by the target command. `RAVENFORD_SPEC.md` also requires undo to preserve dependent knowledge/event consistency.
- **Category:** Knowledge / State / Rollback
- **Preconditions:** A player learns an otherwise unknown, unperceived remote location through one knowledge record or memory, then enters it. The DM subsequently attempts to undo that sole disclosure.
- **Boundary implicated:** [investigation/movement-and-hypotheses.ts](../packages/domain/src/investigation/movement-and-hypotheses.ts), lines 16–29, validates target selectability through `acting`/`target` but emits only `EntityPlaced`. Its [kernel/facts.ts](../packages/domain/src/kernel/facts.ts) footprint at lines 77–84 records entity/clock dependencies but no knowledge or memory premise. The known-entity projection merges knowledge and memory into IDs without retaining the premise used for the decision.

**Exact reproduction — knowledge variant**

On a fresh seeded test campaign:

1. As DM, create `remote-knowledge`, a location with `parentId: null`, `existsSince: null`, and no public knowledge/memory reference. Elowen is elsewhere.
2. As player, submit `EnterLocation` for Elowen and `remote-knowledge`. Observe **422 / `ENTITY_NOT_FOUND`**.
3. As DM, submit this command with client command ID `reveal-route`:

   ```json
   {
     "type": "AddKnowledge",
     "knowledgeId": "route-disclosure",
     "scope": { "kind": "PARTY" },
     "knowledgeType": "FACT",
     "statement": "The remote place is known.",
     "subjects": ["remote-knowledge"],
     "knownSince": 36000
   }
   ```

4. As player, submit `{ "type": "EnterLocation", "characterId": "elowen-starwhisper", "locationId": "remote-knowledge" }` with a fresh command ID. It is accepted.
5. As DM, submit `{ "type": "UndoCommand", "targetCommandId": "http:dm-ravenford:reveal-route" }`.

**Adjacent memory variant:** Repeat with a second unperceived location, `remote-memory`. Instead of AddKnowledge, create a PARTY DECISION memory with `memoryId: "route-memory"`, `occurredAt: 36000`, `locationId: "remote-memory"`, and a benign summary. Enter the location and undo that RecordMemory command. The same defect occurs.

- **Expected behavior:** Undo returns `UNDO_UNSAFE`, identifies the still-effective movement as a blocker, and leaves its prerequisite intact. Explicitly undoing the dependent movement first should permit subsequent removal of the sole disclosure.
- **Actual behavior / evidence:** Both disclosure undos return **200 / `accepted`**. The knowledge/memory record is removed, while Elowen's placement remains at the remote location and the movement command has `undoneBy: null`. This reproduces for both premise types in both stores: four `G02-H02` entries in [results.json](evidence/gate-02/results.json). The pre-disclosure refusal establishes that the removed fact was necessary to authorize the move.
- **Impact:** The engine accepts an undo that leaves a dependent action effective after withdrawing the fact that made it legal under current canon. Removing a disclosure can therefore leave access to a concealed destination in place. The append-only history is still readable and replay reproduces the resulting state; this is a dependency-validation defect, not a claim that stored events were erased or replay became nondeterministic.
- **Known-limitation disposition:** The handoff acknowledges omitted knowledge dependencies. That disclosure is not an owner-approved exception to ADR 0006. The independent reproduction also demonstrates the same omission for memory-derived knowledge.
- **Suggested remediation direction:** Preserve the authorizing knowledge/memory or perception premises through player-command validation and record appropriate dependency facts in the accepted event/command footprint. Audit other decisions that rely on the same flattened `known` set. A fix must protect the dependency boundary, rather than special-case these IDs or prevent every unrelated undo.
- **Regression test required:** **Yes.** `undo_sole_disclosure_is_blocked_after_enter_location`, parameterized over knowledge and memory and both stores. Verify no mutation on rejected undo, the correct movement blocker, safe reverse-order undo, and consistent results after reload.

## Validation and coverage evidence

Run from the repository root:

```bash
pnpm validate:ci-local
```

For the live read probe, start the handoff server in another terminal:

```bash
LOG_LEVEL=info pnpm --filter @ltw/server start
```

Exact executable reviewer recipes and recorded summaries:

- [LIVE_PROBES.md](evidence/gate-02/LIVE_PROBES.md): **698 live HTTP GET requests** over the unmodified seeded campaign.
- [STATE_PROBES.md](evidence/gate-02/STATE_PROBES.md): **194 requests** through the real HTTP app's supported `inject()` interface over isolated memory/PostgreSQL scenarios, with the rules adapter and scripted dice.
- [results.json](evidence/gate-02/results.json): environment, baseline validation, assertion groups and the finding reproductions.

The state recipe's `H01-reproduced` / `H02-reproduced` checks intentionally confirm the vulnerable behavior at the reviewed revision. Its `failures: []` means its observations matched the reproduction assertions; it does **not** turn either finding into a passing product test. Remediation must add the failing safety regressions specified above.

### Baseline validation

| Check                                            | Independently observed result                                  |
| ------------------------------------------------ | -------------------------------------------------------------- |
| Install with frozen lockfile; PostgreSQL startup | Successful                                                     |
| Formatting, lint, typecheck                      | Successful                                                     |
| Context budget                                   | 183 active files; none above 500 or 700 lines                  |
| Unit tests                                       | 50 files, **706 passed**                                       |
| Clean build                                      | Successful                                                     |
| Migration twice                                  | Successful; idempotent                                         |
| Seed twice                                       | 0 accepted, 83 already present; stream version 92, 21 entities |
| Integration tests                                | 5 files, **19 passed**                                         |
| Complete `pnpm validate:ci-local`                | Exit 0                                                         |

Environment: Node 25.8.1, pnpm 11.11.0, PostgreSQL 18-alpine. GitHub Actions was not run; this is the documented local equivalent.

### Required surface ledger

| Surface                                                       | Evidence and observed result                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate 01 knowledge regression                                  | Current knowledge/access/boundary suites passed; eight independent exact fixture record-set checks. Non-DM views omitted origin/claim metadata and forbidden fixture markers.                                                                                                                                                          |
| Scoped memory reads and direct IDs                            | Eight exact visible-set checks, 80 direct-ID probes. Public 1, party 4, Elowen 5, Mira 2, Orin 2, Thorne 3, DM 9 seeded memories.                                                                                                                                                                                                      |
| Text, entity, location, kind, session, limit and time filters | 64 text, 176 entity, 56 fixture-location, 40 kind and 96 as-of checks, plus window/session/limit controls. Fixture outputs remained scoped. **Authored hidden-ancestry variant fails: G02-H01.**                                                                                                                                       |
| Retrieval totals, scores and caches                           | Hidden high-salience text-match memory did not change a player's query result. Eighty concurrent interleaved perspective reads retained exact sets. Live responses carried `no-store` / `Vary: Authorization`.                                                                                                                         |
| Missing/forged/malformed scopes and membership                | 21 malformed and 9 forged-scope probes on new routes; anonymous/outsider and member-only sessions checks. No broader-view fallback. Existing suites additionally cover uniform errors/HEAD/request IDs.                                                                                                                                |
| Impossible memories                                           | Seven independent rejection cases per store: future occurrence, before holder existence, before arrival/presence, unwitnessed conversation, hidden knowledge citation, other-NPC cause, and a cause later than its consequence. Rejections left stream version unchanged.                                                              |
| Entity context and indirect reasons/actions                   | Crawled 21 fixture entities plus a nonexistent ID; unknown absent targets were 404, absent known targets omitted status, and context metadata excluded claims/DCs/canonical descriptions. Adding an undiscovered clue did not change its target context. Current context legality/relevance/leakage/alignment suites passed.           |
| Investigation and player outcomes                             | Executed travel to Thorne and the caravan site, questioning, failed/empty/successful checks and repeated attempts. Failed check and no matching clue produced identical visible outcomes. Discovered records were EVIDENCE with DISCOVERY memories. Events remained empty in player responses; claims, DCs and source IDs were absent. |
| Hypothesis/fact integrity and permissions                     | Player AddKnowledge FACT and SetClaim attempts returned 403. Both PARTY and CHARACTER player hypotheses retained HYPOTHESIS despite fact-asserting prose. Explicit DM FACT authoring created a separate record; the original hypothesis remained unchanged.                                                                            |
| Contradictions and NPC isolation                              | Asking Thorne produced one neutral PARTY contradiction without changing original records or NPC projections. An independently authored five-scope claim scenario yielded exactly the five expected joint-scope pairs. Claim canaries stayed DM-only; WORLD_TRUTH/DM claim attempts were rejected.                                      |
| Idempotency and contradiction undo                            | Repeated AskAbout returned the same scoped outcome with no second execution. Undo of a premise of a live contradiction was blocked. Current replay/undo/property suites passed. **Movement-premise undo fails: G02-H02.**                                                                                                              |
| Persistent state / reload                                     | Isolated memory and PostgreSQL scenarios returned equal selected knowledge/memory/context responses. Four response sets matched after a fresh engine. G02-H01 remained reproducible after reload. Existing integration suites cover persisted player resolutions/contradictions and command concurrency.                               |

No UI or runtime NPC dialogue exists at this checkpoint; neither was claimed as tested. Semantic memory search here is the approved deterministic lexical implementation, not embeddings or an LLM.

## Summary and future obligations

| Severity | Findings |
| -------- | -------: |
| Critical |        0 |
| High     |        2 |
| Medium   |        0 |
| Low      |        0 |

**Invariants exercised:** 1, 3–9, 11, 12, 19 and 20 within the implemented Stage 30/50–70 surfaces and current regression suites. NPC invariant 6 was exercised as data scoping only. No AI mutation/provider implementation exists to certify invariant 2 or future runtime isolation.

**Blocking violations:** G02-H01 violates the permitted-information/uniform-absence boundary; G02-H02 violates required dependency validation for undo. Neither has an approved disposition.

**NOT YET IN SCOPE:** Each introducing stage must add deterministic coverage, and the designated gate must review the integrated surface.

| Surface                                                           | Introduction                            | Next review                                                   |
| ----------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Spellcasting on evidence, Detect Magic and combat                 | Stage 80                                | Gate 03                                                       |
| Reaction windows, expiry and concurrency                          | Stage 90                                | Gate 03                                                       |
| AI contexts, proposals/claims, authoring and continuity           | Stages 100–120                          | Gate 04                                                       |
| Runtime NPC dialogue, prompt injection and trust-based disclosure | Stage 130                               | Gate 04                                                       |
| Asset metadata, lineage and historical visual state               | Stages 150–160                          | Gate 05                                                       |
| Chronicle and flashbacks, including contradiction events          | Stage 170                               | Gate 05                                                       |
| Production authentication                                         | Approved ADR required before deployment | Gate 05 at the latest                                         |
| Real UI consumers                                                 | Stages 200–230                          | Boundary/E2E coverage; reopen affected gates when invalidated |

The finite probe corpus does not prove absence of additional defects. Claims remain dependent on DM-authored structured values; identity/perception, current party membership, development tokens and unimplemented action descriptors retain their documented limits. Those limits do not authorize either blocking defect.

Under `EFFORT_MATRIX.md` and `AGENT_WORKFLOW.md`, remediate both High findings with regression tests first, record `remediation/OPUS_GATE_02_REMEDIATION.md`, update the handoff for RETEST, and obtain a new Astra retest report. Preserve this initial report. Stage 80 is not authorized by this review and was not started.

FAIL

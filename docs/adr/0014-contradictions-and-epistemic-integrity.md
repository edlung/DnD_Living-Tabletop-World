# 0014. Contradictions and epistemic integrity

- Status: Accepted
- Date: 2026-10-03
- Stage: 70; consumed by Stages 110–130, 170
- Decision type: product (requires owner approval)
- Owner approval: approved as written by the owner on 2026-10-03, before implementation. Owner choices: valid transitions only through new DM-authored records; claims visible to the DM only

## Context

Stage 70 must surface conflicting testimony, such as Mira's "before dawn" against Thorne's "after sunrise", **without deciding who is lying** (`RAVENFORD_SPEC.md`). ADR 0008 left one question open: whether a hypothesis may ever become a fact, and how. Stage 70 must answer it without silent updates (invariant 7).

Gate 02 will try four attacks:

1. Turn testimony or a hypothesis into fact without a valid transition.
2. Infer a liar without sufficient evidence.
3. Cross-contaminate NPC knowledge.
4. Extract secret truth through contradiction or explanation paths (`ASTRA_GATE_PROMPTS.md`, `docs/GATE_COVERAGE.md` row 70).

Statements are free text, so a deterministic engine cannot compare them. Something structured must say what a record asserts.

## Options considered

1. **Compare statements with heuristics or AI.** This is nondeterministic and would let AI decide what conflicts.
2. **The DM marks contradictions by hand.** This is deterministic, but the DM would have to foresee every pair in every scope. It also does not work when knowledge arrives through play (sharing, discovery).
3. **The DM attaches structured claims to records; the engine detects conflicts deterministically, per holder scope.** Chosen.

## Decision

### 1. Claims (DM data)

- A **claim** is `{ subjectId, aspect, value }`. For example: `guild-caravan / departure-time / before-dawn`. `aspect` and `value` are lowercase slugs.
- Only the DM or the system sets claims, with `SetClaim`. A claim can go on a knowledge record or on a clue:
  - **Record:** the record must be in a holder scope (PUBLIC, PARTY, CHARACTER, or NPC) and must assert something: FACT, EVIDENCE, TESTIMONY, RUMOR, INFERENCE, HYPOTHESIS, or SECRET. Never UNKNOWN or CONTRADICTION.
  - **Clue:** each evidence record the clue reveals later gets a copy of the claim.
  - **Sharing:** a record shared by an NPC (ADR 0013) gets a copy of its source's claim.
- **The subject must be one of the record's (or clue's) own subjects.** A claim can therefore never introduce an entity that a holder does not already know.
- **Claims are immutable.** One claim per record or clue; there is no edit, only undo. Claims never reach non-DM views, outcomes, or contexts; they are structure for the engine. The DM's knowledge views show them.

### 2. Detection (World Engine, deterministic)

- Two records **conflict** when their claims share `subjectId` and `aspect` but differ in `value`. Nothing else is compared, and nothing is inferred.
- Detection runs inside the decision of any command that sets claims: `SetClaim`, `AskAbout`, and `ExamineEntity`.
- A conflict is recorded only in the **one holder scope whose audience sees both records**:

  | Scopes of the two records                                                        | Recorded in                        |
  | -------------------------------------------------------------------------------- | ---------------------------------- |
  | PUBLIC + PUBLIC                                                                  | PUBLIC                             |
  | PUBLIC + X                                                                       | X                                  |
  | PARTY + PARTY                                                                    | PARTY                              |
  | PARTY + CHARACTER(c)                                                             | CHARACTER(c), if c is in the party |
  | Same CHARACTER or same NPC                                                       | that scope                         |
  | Anything else (different holders; WORLD_TRUTH and DM records never carry claims) | nothing                            |

- **What is recorded.** The result is a new `CONTRADICTION` record in that scope with `CONTRADICTS` relations to both records, plus a DM-only `ContradictionDetected` event. Each pair is recorded at most once per scope.
- **The record's statement** is neutral and symmetric: `Conflicting accounts of <subject>: <A> and <B> disagree.` Here `<A>` and `<B>` are speaker names for attributed records, otherwise "the evidence", "the hypothesis", and so on. It quotes no statement and names no aspect or value.
- **Isolation.**
  - Mira never learns that Thorne contradicts her unless she holds both accounts. NPC scopes are compared only with their own and PUBLIC records.
  - WORLD_TRUTH is never compared with anything, so no contradiction can hint at the truth.
- **Dependencies.** A contradiction depends on both records, their claims, and (for a CHARACTER scope reached through the party) the character's party membership. Undo of any of these is blocked until the contradiction is undone (ADR 0006).

### 3. No liar inference, no silent transitions

- **Nothing in-place.** Detection never changes any record's type, statement, or relations, and never creates FACT, SECRET, or credibility data. Both testimonies stay TESTIMONY; a hypothesis that the evidence contradicts stays HYPOTHESIS.
- **The only valid transition** is explicit authoring. A holder gains a FACT only when the DM authors a new FACT record in that scope (`AddKnowledge`; AI proposals at Stage 110 also need DM confirmation). That record may relate (`SUPPORTS`, `DERIVED_FROM`, `REFERS_TO`) to the hypothesis, testimony, or contradiction it settles.
  - The old records stay as history.
  - No count of evidence, no player, no NPC, and no contradiction can produce a FACT on its own.
- **Player commands** never create FACT or SECRET (ADR 0013), and players cannot set claims.

### 4. Player-visible results (amends ADR 0013 §6)

Results of commands issued by a player carry only `status`, `commandId`, `campaignId`, and `outcome`. Rejections carry their fixed code and message. The event list is omitted: event types and counts would reveal DM structure, such as which shared records carry claims. DM and system results are unchanged.

**Implementation note (added during implementation, disclosed to the owner).** Three details go beyond the approved text above; they tighten it and loosen nothing:

- The response keeps the `events` field, always empty, so its shape stays stable.
- Rejection `details` are dropped, except schema issues about the player's own input.
- A player may not send `expectedVersion`; the request is rejected with 400. Otherwise the version check would expose stream versions, which ADR 0008 keeps out of player views.

### 5. Context relevance (amends ADR 0012)

`CONTRADICTION` joins UNKNOWN, HYPOTHESIS, and RUMOR as an open question. Asking about the contradicted subject is then ranked high. This uses only the perspective's visible records.

### 6. Fixture (`fixtures/ravenford/contradiction-seed.json`)

Claims `guild-caravan / departure-time` go on three records:

- `before-dawn` on Mira's testimony (NPC)
- `after-sunrise` on Thorne's testimony (NPC)
- `before-dawn` on the party's copy of Mira's testimony

When the party asks Thorne about the caravan, the PARTY scope gains one contradiction. Mira's and Thorne's own scopes gain nothing.

## Consequences

- Contradictions are reproducible from history and auditable. Chronicle (Stage 170) can cite `ContradictionDetected`. AI (Stages 110–130) may _propose_ claims only through DM-confirmed authoring.
- Value equality is deliberately strict: the DM chooses values so that compatible accounts share one.
- Any future party-membership change (unassignment) must respect contradiction dependencies.

## Amendments

- 2026-10-04 (Stage 120, ADR 0019 §4; owner decision of 2026-10-04):
  - **Claims on world truth.** The DM or the system may put claims on WORLD_TRUTH records, for continuity checks only. Detection never joins WORLD_TRUTH (§2), so these claims never produce a contradiction, a player view, or an outcome. DM notes still never carry claims.
  - **AI-proposed claims.** As anticipated above, an authoring proposal may set claims on records an NPC holds, confirmed by the DM (ADR 0018, ADR 0019).
  - **Quoted names are premises.** The neutral statement quotes the subject's and the speakers' names. `ContradictionDetected` now lists them (`named`), and its footprint reads those names, so undoing a rename it quoted is refused while the contradiction stands. Without this, re-deciding the command after such an undo would give another statement; the Stage 120 randomized test found it. The field is additive: events written earlier lack it, and their footprint reads only the subject's name.
- 2026-10-04 (Stage 130, ADR 0020 §6): `ContradictionDetected` moves to version 3. Writers before Stage 120 did not record the quoted names, so a command with a version 2 contradiction rests on everything before it (ADR 0007 Stage 130 amendment).

## Invariants affected

Implements 7 (types never change; facts only through explicit authoring) and 4–6 for contradictions. Preserves 1, 2, 3, 11, 12, and 19 (DM views show claims; holders see every contradiction recorded in their scope). No invariant is weakened.

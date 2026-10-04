# Implementation Prerequisites

These are scheduled decision/check obligations, not approved ADRs. They do not block repository-only Stage 0. The authorized stage prepares its required decision before dependent implementation; request owner approval where product semantics or invariants are affected. Do not start future stages to resolve their decisions early.

## Temporal and undo contracts — Stage 10, extended at Stages 90/110

Before implementing the World Kernel's persistence/replay contract, record an ADR identifying:
- supported temporal domains and the state/history each must reconstruct;
- entity identity, event ordering, recorded nondeterministic inputs, duplicate-command handling, and transaction/atomicity boundaries;
- the distinction between world time and persistence time, including later authoring of pre-existing fictional entities;
- the undo strategy and its supported operations: safe rejection, explicit compensating events, or another coherent history-preserving approach consistent with `ADVERSARIAL_TESTS.md`;
- how dependent discoveries, knowledge, and external asset work affect safe undo as those domains are introduced.

Owner approval is required for the supported product semantics. Stage 10 implements only the kernel portion. Stage 30 extends temporal tests to memory; Stage 90 implements and tests the declared behavior for undo/rewind while a reaction window is open, including rejection when unsafe. Stage 110 implements the safe Tomas authoring undo path required by Ravenford and tests downstream knowledge dependencies. Stage 150 extends the existing contract to asset jobs. Rejecting unsafe undo is allowed; omitting every safe authoring undo path does not satisfy DM acceptance.

**Recorded:** `docs/adr/0006-temporal-model-and-undo.md`, approved by the project owner on 2026-10-03. Later stages extend it as listed above.

## Ruleset — Stage 40

Before implementing deterministic rule legality, obtain owner approval of a ruleset ADR specifying the rules source/edition or explicitly defined custom subset, permitted house rules, and the slice mechanics. Include ranges, resources, concentration, reactions, timing, and multiclass/spell-access assumptions for Elowen. Reconcile the Ravenford fixture with that choice rather than silently granting or removing abilities. Define reproducible random-input handling for tests and replay. Stages 80, 90, and 220 reuse this contract.

**Recorded:** `docs/adr/0011-ruleset-srd-5-2.md`, approved by the project owner on 2026-10-03.

## Minimum authoring validation — Stage 110

Before enabling the first canonical AI-assisted mutation, implement the complete invariant-16 pipeline for every command enabled in this stage: schema, permission, applicable rules, continuity/lore, risk/confirmation, then World Engine. Tomas must pass timeline, location, identity, and scoped-knowledge checks from `RAVENFORD_SPEC.md`.

Check the command against current state when committing; stale preview/confirmation must not bypass those validations. Validation failure must not produce partial canonical mutations. Any unsupported proposal remains uncommittable. Tests must cover invalid timeline/location/knowledge, unauthorized actor, stale proposal, missing confirmation, and atomic rejection.

Editing a proposal invalidates or recomputes the relevant preview and confirmation, as required by Stage 230. Any confirmation required by the approved risk policy must apply to the edited proposal.

Stage 120 expands continuity coverage, conflict explanations, and options across domains. It does not introduce the first continuity guard or make Stage 110's earlier mutations retroactively valid. Warnings never silently rewrite DM intent or waive protected invariants.

**Recorded:** `docs/adr/0018-ai-authoring.md`, with the owner's Stage 110 answers to Q1 (enabled operations, risk policy, acceptable warnings) and the undo choice, approved on 2026-10-04.

## Review coverage and release evidence

Follow `docs/GATE_COVERAGE.md` as each read/mutation surface is introduced. Record actual evidence at the stage where it becomes testable. Stage 240 requires a real uncoached usability session; a scripted automated walkthrough is not a substitute. Stage 250 requires traceable product, architecture, adversarial, and usability acceptance for the release candidate. Do not invent approvals or mark unperformed checks complete.

The integrated Stage 230 build used by Stage 240 must already support the existing Ravenford Player/DM acceptance flows, including return/time change, Chronicle/minimal flashback, and DM performance of Tomas. Stage 240 validates these flows; it is not their first implementation stage. Their assignment within the existing UX stages remains an explicit planning decision.

## Pending owner decisions for future stages

These are unanswered questions, not approved product semantics. They apply only to the named future stages and add no Stage 90 or Gate 03 acceptance criteria. Existing ADRs remain in force.

### Q1. Authoring scope, risk, and continuity — Stages 110/120

Which authoring operations are enabled in Stage 110, which require confirmation under the risk policy, and which non-invariant continuity conflicts may be accepted after a warning? What additional Ravenford constraints are included at Stage 120? Destructive proposals and overrides of protected invariants remain disallowed by the existing work orders.

Decision needed before enabling the affected operations in Stage 110, and before enabling their extensions in Stage 120. Both parts are decided: Stage 110 in ADR 0018 §2–§4, Stage 120 in ADR 0019 §2 and §4 (owner, 2026-10-04).

### Q2. Relationships and guarded disclosure — Stages 120/130

What minimal Ravenford relationship/trust state and `RelationshipChanged` semantics should Stage 120 validation and Stage 130 Orin disclosure use? Which authorized domain decision may make a `GUARDED` record shareable, and under what conditions? Existing scope and knowledge-type restrictions remain unchanged.

Decision needed before dependent relationship checks in Stage 120 and before the affected runtime disclosures in Stage 130. The relationship part is decided (ADR 0019 §3: an NPC's attitude toward the party, owner, 2026-10-04); which domain decision makes a GUARDED record shareable remains open for Stage 130.

### Q3. Bounded NPC action scope — Stage 130

What exact Ravenford behavior fulfills the Stage 130 obligations for Insight, Talk, Trade from ADR 0013 §5 and monster actions from ADR 0015 §7? Which minimal trade semantics require the owner decision identified in ADR 0012? A general economy or unrestricted autonomous NPC system is not assumed.

Decision needed before implementing the affected behavior in Stage 130.

### Q4. Release environment — Stages 200/250

Is the intended release a local development distribution or a deployment requiring production authentication? Which environment should the session/authentication UX support under ADR 0009? Development persona tokens do not become production authentication through release packaging.

Decision needed when defining the session/authentication UX in Stage 200 if production is intended, and before any such deployment. The exact authorized publication target is required for Stage 250.

## Pending allocation of existing Ravenford obligations

Which existing future work order owns the Missing Caravan quest projection and its required `QuestActivated`/`QuestUpdated` semantics for Stage 180 integration?

Which of Stages 200–230 owns the return/Day 2, Chronicle/minimal flashback, DM time advancement, and DM performance-of-Tomas UI required by Stage 240?

These assignments remain unresolved; this entry authorizes no additional feature or stage. It allocates no work to Stage 90 and changes no gate status. Backend ownership needs to be settled before the affected implementation and coverage in Stage 180; UX ownership needs to be settled when planning Stages 200–230, with the flows ready by the end of Stage 230.

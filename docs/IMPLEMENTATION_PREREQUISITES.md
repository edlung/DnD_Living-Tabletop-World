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

## Ruleset — Stage 40

Before implementing deterministic rule legality, obtain owner approval of a ruleset ADR specifying the rules source/edition or explicitly defined custom subset, permitted house rules, and the slice mechanics. Include ranges, resources, concentration, reactions, timing, and multiclass/spell-access assumptions for Elowen. Reconcile the Ravenford fixture with that choice rather than silently granting or removing abilities. Define reproducible random-input handling for tests and replay. Stages 80, 90, and 220 reuse this contract.

## Minimum authoring validation — Stage 110

Before enabling the first canonical AI-assisted mutation, implement the complete invariant-16 pipeline for every command enabled in this stage: schema, permission, applicable rules, continuity/lore, risk/confirmation, then World Engine. Tomas must pass timeline, location, identity, and scoped-knowledge checks from `RAVENFORD_SPEC.md`.

Check the command against current state when committing; stale preview/confirmation must not bypass those validations. Validation failure must not produce partial canonical mutations. Any unsupported proposal remains uncommittable. Tests must cover invalid timeline/location/knowledge, unauthorized actor, stale proposal, missing confirmation, and atomic rejection.

Stage 120 expands continuity coverage, conflict explanations, and options across domains. It does not introduce the first continuity guard or make Stage 110's earlier mutations retroactively valid. Warnings never silently rewrite DM intent or waive protected invariants.

## Review coverage and release evidence

Follow `docs/GATE_COVERAGE.md` as each read/mutation surface is introduced. Record actual evidence at the stage where it becomes testable. Stage 240 requires a real uncoached usability session; a scripted automated walkthrough is not a substitute. Stage 250 requires traceable product, architecture, adversarial, and usability acceptance for the release candidate. Do not invent approvals or mark unperformed checks complete.

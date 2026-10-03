# Astra Adversarial Review Template v0.2

## Reviewer Role

You are the independent adversarial architecture reviewer for **Living
Tabletop World**. Find concrete invariant violations, leakage paths,
unsafe assumptions, and reproducible failures. You are not the primary
implementation agent.

## Authoritative Inputs

Use: - `PRODUCT_BLUEPRINT.md` - `ARCHITECTURE.md` -
`ARCHITECTURE_INVARIANTS.md` - `RAVENFORD_SPEC.md` -
`EXECUTION_PLAN.md` - public API/contracts and testable behavior for the
reviewed stage.

Do not relax an invariant to make an implementation pass.

## Review Header

-   Review ID:
-   Stage/Gate:
-   Commit/Build:
-   Date:
-   Reviewer model:
-   Surfaces tested:
-   Overall result: PASS / FAIL
-   Required surfaces not tested / future coverage obligations:
-   Owner-approved nonblocking dispositions: <references, or none>

Use the severity policy in `AGENT_WORKFLOW.md`. The header and final result must agree. Findings and approved dispositions do not create a third result status. A required but untestable surface blocks PASS; record future surfaces according to `docs/GATE_COVERAGE.md`.

## Finding Format

### \[ID\] Short title

-   **Severity:** Critical / High / Medium / Low
-   **Invariant(s):** exact invariant numbers/titles
-   **Category:** Knowledge / Permission / Rules / Timeline / State /
    Events / Concurrency / Rollback / AI / NPC / Assets / Observability
    / Other
-   **Preconditions:**
-   **Steps to reproduce:**
-   **Expected behavior:**
-   **Actual behavior:**
-   **Evidence:** response, event IDs, logs, trace IDs, or test output
-   **Impact:**
-   **Suggested remediation direction:** identify the boundary to fix;
    do not rewrite the implementation
-   **Regression test required:** yes/no; proposed test name

## Severity

-   **Critical:** canonical corruption, unauthorized DM-secret leakage,
    arbitrary mutation bypass, unrecoverable history/permission failure.
-   **High:** reproducible rules/knowledge/timeline violation with
    meaningful gameplay or security impact.
-   **Medium:** bounded integrity/UX failure with workaround or limited
    scope.
-   **Low:** robustness/diagnostic issue without current
    canonical-integrity violation.

## Mandatory Attack Families

Apply those relevant to the stage: 1. Direct and indirect knowledge
leakage. 2. Missing/forged/malformed perspective scope. 3. Cross-NPC or
NPC-to-DM secret leakage. 4. Hypothesis/testimony promoted to fact
without valid transition. 5. Timeline impossibilities and impossible
memories. 6. Rule-legality bypass and stale action state. 7. Reaction
replay, expiry, double-spend, concurrency. 8. AI proposal bypass of
validation/confirmation. 9. Partial mutation after validation failure.
10. Event ordering/replay divergence. 11. Undo/rollback producing orphan
knowledge or impossible history. 12. Permission escalation. 13.
Hallucinated state persisted. 14. Asset identity drift/cross-entity
contamination. 15. Missing provenance: inability to answer why AI
knew/proposed something.

## Gate-Specific Expectations

### Gate #1 --- Knowledge Boundary

Attempt to recover Ashen Circle/attacker truth from Player, Party, Mira,
PUBLIC, related entities, errors, missing/malformed scopes, serialization,
and existing fallback/cache behavior through the Stage 20 projection/query surface.
Mira here is a scoped NPC fixture, not an LLM dialogue endpoint. Memory
retrieval and runtime dialogue are introduced and retested at the stages
specified in `docs/GATE_COVERAGE.md`; do not claim they passed Gate #1.

### Gate #2 --- Contradiction/Knowledge Integrity

Include the Stage 30 memory and Stage 50–60 context/investigation surfaces.

Attempt to promote hypotheses to facts, treat testimony as truth, infer
a liar without evidence, cross-contaminate NPC knowledge, or leak
secrets via contradiction explanations.

### Gate #3 --- Reaction Integrity

Attempt double Counterspell, expired Counterspell, spent reaction,
reaction after trigger resolution, concurrent reaction races, and
rollback while a reaction window is open.

### Gate #4 --- NPC Isolation

Include integrated AI context, authoring, continuity, and safe-undo surfaces from Stages 100–120.

Prompt-inject/jailbreak NPCs for hidden context, omniscient roleplay, DM
truth, other-NPC private knowledge, system prompts, or campaign secrets.
Passing requires that forbidden information was never supplied to NPC
context.

### Gate #5 / Stage 190 --- Full Red Team

Run all relevant attack families across public/test surfaces and
prioritize invariant violations over cosmetic findings.

## Final Summary

Provide: - findings by severity, - invariants exercised, - invariants
violated, - untested areas and why, - residual risk, - exact blocking
findings, - final recommendation: PASS / FAIL.

A PASS means no known blocking invariant violation remains; it does not
mean the system is bug-free.

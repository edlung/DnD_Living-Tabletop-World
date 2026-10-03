# Astra Gate 01 — Knowledge Boundary

- **Review ID:** ASTRA_GATE_01_INITIAL
- **Stage/Gate:** Stage 20 / Gate 01, INITIAL review
- **Code revision:** `641c6af1e9651147107f4c9c3113535e36026520`
- **Checkout revision:** `29e63d21b2d6543d1d3fd47d15897d534282ee11`. The difference contains only the handoff, handoff routing instructions, and Stage 20 completion report; no implementation changes.
- **Date:** 2026-10-03, Europe/Oslo
- **Reviewer model:** GPT-6 / Codex, independent Astra reviewer role. Requested configuration: GPT-6 Astra / MAX, as specified in the handoff and `EFFORT_MATRIX.md`; the runtime model alias and effort setting are not independently exposed to this reviewer.
- **Surfaces tested:** All five knowledge/entity GET routes, automatic HEAD handling, command POST, health, authentication, perspective resolution, projections, filters, relation traversal, serialization, errors, canonical caches, PostgreSQL reload, and knowledge/assignment undo.
- **Overall result:** PASS
- **Required surfaces not tested:** None identified for Stage 20. Future obligations are listed below and are not certified by this review.
- **Owner-approved nonblocking dispositions:** None; no findings require disposition.

## Assessment

No blocking knowledge-boundary violation was reproduced. Unauthorized PLAYER, PARTY, PUBLIC, CHARACTER, and NPC views did not expose WORLD_TRUTH, DM notes, other holders' private records, hidden relations, secret entity identity, or record provenance. Authorized content remained available; a response containing no records was not used as sufficient evidence of isolation.

This conclusion combines independent live HTTP probes, additional adversarial scenarios over the supported test interfaces, source inspection, and a fresh execution of the complete local validation pipeline. It does not rely on the builder's reported results.

## Authority and scope

Read `ASTRA_MASTER.md`, Gate 01 in `ASTRA_GATE_PROMPTS.md`, `handoffs/ASTRA_GATE_01_REQUEST.md`, `ASTRA_REVIEW.md`, `AGENT_WORKFLOW.md`, `EFFORT_MATRIX.md`, `CHECKPOINTS.md`, `docs/AI_CONTEXT_MAP.md`, and applicable directory instructions.

Reviewed the handoff's authoritative material: invariants 1, 4–7 and 11; Knowledge in `PRODUCT_BLUEPRINT.md`; Knowledge Architecture, NPC Context Isolation and API Boundary in `ARCHITECTURE.md`; the NPCs, Canonical Mystery Truth and Integrity Acceptance in `RAVENFORD_SPEC.md`; sections A, B and G of `ADVERSARIAL_TESTS.md`; Stage 20 in `EXECUTION_PLAN.md`; `docs/GATE_COVERAGE.md`; ADRs 0008 and 0009. ADR 0006 was also read for undo, temporal semantics and replay checks.

Implementation inspection followed the HTTP authentication/request context and route handlers into the perspective resolver, projection whitelist, queries, knowledge decisions, World Engine authorization/idempotency, and undo dependencies. Public contracts and the Ravenford seed/boundary fixtures were checked against the expected behavior.

Mira was exercised as `NPC:mira-vale`, using the authorized DM preview token. No dialogue endpoint or model-generated answer was treated as tested.

## Reproduction and recorded evidence

Environment: Node **25.8.1**, pnpm **11.11.0**, PostgreSQL **18-alpine**, localhost HTTP server. The pre-existing development database was reused without deleting its volume. Authorized adversarial writes ran only in fresh in-memory state and a throwaway PostgreSQL database, which was dropped afterward.

From the repository root:

```bash
pnpm validate:ci-local
```

Then start the live server in a separate terminal:

```bash
LOG_LEVEL=info pnpm --filter @ltw/server start
```

Run the exact executable recipes preserved with this report:

- [Live HTTP probes](evidence/gate-01/LIVE_PROBES.md): **1,841 requests**, eight fixture perspectives, no failed assertions or exploratory anomalies.
- [State and persistence probes](evidence/gate-01/STATE_PROBES.md): **180 requests** through Fastify's supported `inject()` interface, no failed assertions; includes in-memory/PostgreSQL comparison, a new engine instance, a second writer, and role reassignment.
- [Recorded results](evidence/gate-01/results.json): compact environment, validation, request counts and assertion-group results. Counts describe one recorded run of each recipe, not a count of independent vulnerabilities or formal test cases.

The live recipe submits only reads and unauthorized commands expected to be rejected. The state recipe creates its own temporary state. Both recipes exit nonzero on assertion/setup failures and write summaries under `/tmp/`.

The server started for this review was stopped cleanly after testing. No production source, existing tests, handoff, or canonical fixture was changed. Review artifacts are the only repository additions.

### Local validation

| Check                                              | Observed result                                                |
| -------------------------------------------------- | -------------------------------------------------------------- |
| Frozen dependency installation, PostgreSQL startup | Successful                                                     |
| Formatting, lint, typecheck                        | Successful                                                     |
| Context budget                                     | 100 active files; none above 500 or 700 lines                  |
| Unit suite                                         | 22 files, 400 tests passed                                     |
| Clean build                                        | Successful                                                     |
| Migrations, repeated                               | Successful; idempotent                                         |
| Ravenford seeding, repeated                        | 0 accepted, 55 duplicates; version 64, 21 entities on each run |
| Integration suite                                  | 4 files, 17 tests passed                                       |
| Complete `pnpm validate:ci-local`                  | Exit 0                                                         |

GitHub Actions was not run. The evidence is local execution of its documented equivalent.

## Due-surface coverage

| Surface / attack                            | Evidence and observed behavior                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized knowledge and scope isolation    | Exact record sets: PUBLIC 8; PARTY 11; PLAYER and Elowen CHARACTER 12 each; Mira, Orin and Thorne 11 each; DM 30 with provenance. Independent live checks plus `knowledge-boundary.test.ts` and domain `queries.test.ts`.                                                                                                                                                                       |
| Direct secret extraction                    | 248 direct-record probes across all eight perspectives, including each of the 30 fixture IDs and a nonexistent ID. Hidden records returned 404. DM positive control returned Ashen Circle truth.                                                                                                                                                                                                |
| Cross-NPC and character isolation           | Each NPC received PUBLIC plus only its own records. Orin's SECRET-typed record remained visible to Orin and DM. Separate canaries covered WORLD_TRUTH, DM, PUBLIC, PARTY, Elowen, another CHARACTER, Mira and Orin.                                                                                                                                                                             |
| Relations and hidden bridges                | 744 graph probes at depths 1–3. A PARTY hypothesis did not reveal hidden contradiction edges or the secret truth supporting them. Additional public-to-secret and private-bridge graphs produced no hidden node, edge or entity marker.                                                                                                                                                         |
| Entities and indirect traversal             | 176 entity-knowledge probes and 176 subject-filter checks. Secret entities were absent from restricted entity lists and lookups. Entity references exposed only `entityId`, `kind`, and `name`. Canonical descriptions were not serialized.                                                                                                                                                     |
| Type filters and epistemic integrity        | 72 type-filter checks; fixture hypothesis, testimony, rumor and unknown records retained their types. No inferred truth was promoted to FACT. Stage 70 transitions were not exercised.                                                                                                                                                                                                          |
| `asOf` and time boundaries                  | 112 live time queries, including boundary seconds around 21600, 34200 and 35100, negative times and future times. Allowed record sets and relation targets respected `knownSince`; future queries were rejected. Newly authored canaries at 36000 were absent at 35999.                                                                                                                         |
| Missing, malformed and duplicated scopes    | 20 independent malformed-input cases, plus the existing access suite across routes. Missing scope, duplicates in both orders, repeated identical values, array/object-shaped scopes, unknown parameters and malformed time values were rejected. Five additional encoded/control/prototype-key probes also returned 400.                                                                        |
| Forged scope, authentication and membership | Six forged-perspective checks returned 403; twenty anonymous/outsider checks returned 401/404 as appropriate. Existing versus missing campaign did not disclose membership information. DM could not use PLAYER as a fallback.                                                                                                                                                                  |
| Serialization and absence behavior          | 37,730 forbidden-marker assertions and 786 projection-whitelist checks. 134 hidden-record responses matched nonexistent-record responses after removing the server-generated request ID. Existing boundary tests additionally cover entity absence and response headers.                                                                                                                        |
| Errors and alternate request handling       | Invalid input, unauthorized access, missing resources and an injected internal-secret exception were exercised. The latter returned a fixed 500 message without the canary/stack. Existing tests cover HEAD, unknown routes/methods and ignored client request IDs. Domain command rejections are distinct `CommandResult` responses; no player-accessible canonical content was found in them. |
| HTTP caching and perspective switching      | Every live response carried `Cache-Control: no-store` and `Vary: Authorization`. Ninety-six concurrently interleaved DM/PLAYER/Mira/PUBLIC reads retained exact permitted sets.                                                                                                                                                                                                                 |
| Canonical cache and persistent reload       | Nine perspective responses remained equal after constructing a new PostgreSQL engine. A warmed second engine caught up with a write from the first while keeping the new DM record out of PLAYER. Existing integration tests independently compare memory, PostgreSQL and reload behavior.                                                                                                      |
| Commands, authority and atomic rejection    | Valid player attempts to add WORLD_TRUTH, undo known/unknown commands, assign characters, alter hidden/nonexistent entities or advance time returned 403 before state-specific/version details. Malformed actor/campaign injection, prototype poisoning, JSON and oversized payloads were rejected. Campaign version did not change.                                                            |
| Idempotency and command-ID isolation        | Identical DM command replay returned `duplicate`; changed content returned conflict. A player reusing the same client command ID received 403 and no DM outcome. Existing tests also probe seeded/internal command IDs.                                                                                                                                                                         |
| Undo and assignment changes                 | Undo of knowledge with a live relation dependency returned `UNDO_UNSAFE`; explicit removal of dependents allowed undo. Undone records disappeared. After unassignment, the warmed old player view returned 404; reassignment yielded the new character's private records plus PARTY and excluded Elowen's private knowledge. Explicit access to the former character returned 403.              |
| Logging / observability                     | Server stdout logged a generated request ID, authenticated actor and effective perspective for knowledge requests. No client-selected request ID was accepted by the regression suite.                                                                                                                                                                                                          |

The existing randomized boundary suite also passed all six deterministic seeds (3, 11, 29, 47, 101, 2027), checking scope visibility and entity canaries against its independent oracle.

## Findings

| Severity | Count |
| -------- | ----: |
| Critical |     0 |
| High     |     0 |
| Medium   |     0 |
| Low      |     0 |

**Blocking findings:** none. No remediation or finding-specific regression requirement is issued.

**Invariants exercised:** 1 and 3 (validated, DM-authorized mutation); 4 and 5 (knowledge scopes, direct and indirect disclosure); 6 (NPC data scoping only); 7 (preserved epistemic types); 11 (recorded accepted commands/provenance); 12 (limited to the tested persistence, reload and undo behavior). Authorized record-set checks also exercise the relevant Stage 20 aspect of invariant 19.

**Invariants violated:** none reproduced. These checks are not certification of the future systems covered by the same invariants.

## Future obligations — NOT YET IN SCOPE

Each introducing stage must add deterministic boundary tests; the named gate must review the integrated surface. None of these entries is a passed test or an accepted defect.

| Surface                                                                          | Introduction                                  | Next review                                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| Memory and temporal/semantic/entity retrieval; impossible memories               | Stage 30                                      | Gate 02                                                                    |
| Entity context, perception, investigation and disguised identity                 | Stages 50–60                                  | Gate 02                                                                    |
| Contradiction explanations and valid knowledge-type transitions                  | Stage 70                                      | Gate 02                                                                    |
| AI context, authoring proposals, continuity and associated undo                  | Stages 100–120                                | Gate 04                                                                    |
| Runtime NPC dialogue/actions, prompt injection and actual supplied model context | Stage 130                                     | Gate 04                                                                    |
| Asset metadata, lineage and historical visual state                              | Stages 150–160                                | Gate 05                                                                    |
| Chronicle and flashbacks                                                         | Stage 170                                     | Gate 05                                                                    |
| Production authentication                                                        | Owner-approved ADR required before deployment | Gate 05 at the latest                                                      |
| Real UI consumers, perspective switching and stale views                         | Stages 200–230                                | Boundary/E2E regressions; reopen the affected gate if its boundary changes |

## Residual risk and gate disposition

The result applies to the recorded Stage 20 revision and its development persona authentication. It does not approve production deployment. Historical party membership and disguises remain outside the accepted model; current character assignment governs access. DM-authored non-DM disclosures and their referenced entity identities are intentional under ADR 0008.

The probe corpus is finite. It covers the required existing surfaces but does not prove absence of every possible defect or certify unimplemented AI, memory, asset or UI paths. Later consumers must reuse the scoped boundary, and changes that invalidate this evidence require a new retest report.

Gate 01 has no known blocking invariant violation or missing required coverage. Stage 30 still requires explicit owner authorization. No later stage was started.

PASS

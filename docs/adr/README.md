# Architecture Decision Records

ADRs record material decisions and their tradeoffs. One decision per file: `NNNN-kebab-title.md`, numbered sequentially, created from [`0000-template.md`](0000-template.md).

## When to write one

- A material technical choice that later stages build on (tooling, persistence, boundaries, runtime). Builders choose the smallest reversible option consistent with `ARCHITECTURE_INVARIANTS.md` and record alternatives.
- Any product-semantics decision scheduled in `docs/IMPLEMENTATION_PREREQUISITES.md` (temporal/undo, ruleset, authoring validation).
- Any proposed change to an architecture invariant or material architecture contract.

## Authority and status

| Status               | Meaning                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Proposed`           | Written, not in force. Product decisions and invariant changes stay here until the project owner approves.                                                                                                                                       |
| `Accepted`           | In force. Technical decisions within a work order's scope may be accepted by the builder; the owner may revisit them. Product decisions and invariant changes are accepted **only** by the project owner, with the approval recorded in the ADR. |
| `Superseded by NNNN` | Replaced; kept for history.                                                                                                                                                                                                                      |
| `Rejected`           | Considered and declined; kept for history.                                                                                                                                                                                                       |

Never mark a product decision or invariant change `Accepted` on the owner's behalf. Accepted ADRs are not edited in substance; supersede them with a new ADR.

## Index

| ADR                                                    | Title                                                                           | Status                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| [0001](0001-record-architecture-decisions.md)          | Record architecture decisions                                                   | Accepted (technical)                               |
| [0002](0002-toolchain-and-workspace.md)                | Toolchain and workspace layout                                                  | Accepted (technical)                               |
| [0003](0003-persistence-and-migrations.md)             | PostgreSQL access and forward-only SQL migrations                               | Accepted (technical)                               |
| [0004](0004-module-boundaries.md)                      | Module boundaries and dependency direction                                      | Accepted (technical)                               |
| [0005](0005-server-runtime-foundations.md)             | Server runtime foundations: config, logging, HTTP                               | Accepted (technical); HTTP part superseded by 0009 |
| [0006](0006-temporal-model-and-undo.md)                | Temporal model, canonical history, and undo                                     | Accepted (owner-approved product decision)         |
| [0007](0007-world-kernel-model-and-event-store.md)     | World Kernel model, command pipeline, and event store                           | Accepted (technical)                               |
| [0008](0008-knowledge-boundary.md)                     | Knowledge records, scopes, and perspective boundary                             | Accepted (owner-approved product decision)         |
| [0009](0009-http-api-and-dev-authentication.md)        | HTTP API framework, development authentication, response hygiene                | Accepted (technical)                               |
| [0010](0010-memory-and-temporal-retrieval.md)          | Memory, sessions, impossible memories, and temporal retrieval                   | Accepted (owner-approved product decision)         |
| [0011](0011-ruleset-srd-5-2.md)                        | Ruleset: SRD 5.2.1 subset for the Ravenford slice                               | Accepted (owner-approved product decision)         |
| [0012](0012-context-engine.md)                         | Context Engine: perception, entity context, actions, legality, relevance        | Accepted (owner-approved product decision)         |
| [0013](0013-investigation.md)                          | Investigation: player actions, clues, disclosure, hypotheses                    | Accepted (owner-approved product decision)         |
| [0014](0014-contradictions-and-epistemic-integrity.md) | Contradictions, claims, and valid knowledge transitions                         | Accepted (owner-approved product decision)         |
| [0015](0015-combat-engine.md)                          | Combat Engine: encounters, turns, attacks, spells, 0 HP                         | Accepted (owner-approved product decision)         |
| [0016](0016-reaction-engine.md)                        | Reaction Engine: reaction windows and Counterspell                              | Accepted (owner-approved product decision)         |
| [0017](0017-ai-gateway.md)                             | AI Gateway: providers, capability routing, scoped context, proposals, traces    | Accepted (owner-approved product decision)         |
| [0018](0018-ai-authoring.md)                           | AI authoring: proposals, validation, confirmation, commit, and undo             | Accepted (owner-approved product decision)         |
| [0019](0019-continuity-engine.md)                      | Continuity Engine: conflicts, explanations, options, relationships, lore claims | Accepted (owner-approved product decision)         |
| [0020](0020-npc-intelligence.md)                       | NPC intelligence: scoped dialogue, guarded disclosure, Insight, monster turns   | Accepted (owner-approved product decision)         |
| [0021](0021-ai-relevance.md)                           | AI relevance: ranking already-computed context actions                          | Accepted (owner-approved product decision)         |
| [0022](0022-asset-identity.md)                         | Asset identity: references, variants, generation, lineage, and visibility       | Accepted (owner-approved product decision)         |
| [0023](0023-world-visual-state.md)                     | World visual state: weather, day phases, and how things looked at a time        | Accepted (owner-approved product decision)         |
| [0024](0024-chronicle.md)                              | Chronicle: chapters from memories, traced prose, suggestions, and flashbacks    | Accepted (owner-approved product decision)         |
| [0025](0025-ravenford-integration.md)                  | Ravenford integration: semantics ledger, quest projection, scenario suite       | Accepted (owner-approved product decision)         |
| [0026](0026-ux-foundation.md)                          | Player/DM UX foundation, scoped sessions/sheets, browser lifecycle              | Accepted (technical)                               |

Pending product decisions for later stages are tracked in `docs/IMPLEMENTATION_PREREQUISITES.md` and have no ADR yet. The temporal/undo decision is ADR 0006; minimum authoring validation (Stage 110) is ADR 0018; the Stage 120 continuity checks, relationships, and lore are ADR 0019; Stage 130's NPC dialogue, disclosure, Insight, and monster suggestions are ADR 0020; Stage 140's AI relevance is ADR 0021; Stage 150's asset identity is ADR 0022; Stage 160's world visual state is ADR 0023; Stage 170's Chronicle is ADR 0024; Stage 180's Ravenford integration and quest projection is ADR 0025.

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

| ADR                                           | Title                                             | Status               |
| --------------------------------------------- | ------------------------------------------------- | -------------------- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions                     | Accepted (technical) |
| [0002](0002-toolchain-and-workspace.md)       | Toolchain and workspace layout                    | Accepted (technical) |
| [0003](0003-persistence-and-migrations.md)    | PostgreSQL access and forward-only SQL migrations | Accepted (technical) |
| [0004](0004-module-boundaries.md)             | Module boundaries and dependency direction        | Accepted (technical) |
| [0005](0005-server-runtime-foundations.md)    | Server runtime foundations: config, logging, HTTP | Accepted (technical) |

Pending product decisions (ruleset for Stage 40, minimum authoring validation for Stage 110) are tracked in `docs/IMPLEMENTATION_PREREQUISITES.md` and have no ADR yet. The temporal/undo decision is ADR 0006.

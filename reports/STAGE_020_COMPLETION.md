# Stage 20 Completion Report — Knowledge Boundary

- Work order: `work-orders/OPUS_STAGE_020.md`
- Builder: Claude Opus 5.5 / MAX (per `EFFORT_MATRIX.md`)
- Implementation revision: `641c6af1e9651147107f4c9c3113535e36026520` (branch `main`)
- Formal gate: **Astra Gate 01** — handoff `handoffs/ASTRA_GATE_01_REQUEST.md`, required output `reviews/ASTRA_GATE_01_REPORT.md`
- Status: **AWAITING_ASTRA_REVIEW.** Stage 30 must not start before an Astra PASS and owner authorization.

## Decisions

| ADR                                                         | Decision                                                                                           | Approval                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [0008](../docs/adr/0008-knowledge-boundary.md)              | Knowledge records, scopes, perspectives, projection rules                                          | Approved as written by the project owner on 2026-10-03, before implementation |
| [0009](../docs/adr/0009-http-api-and-dev-authentication.md) | Fastify HTTP API, development persona authentication, response hygiene, per-actor HTTP command IDs | Technical; supersedes the HTTP part of ADR 0005                               |

## Delivered

- **Contracts** (`packages/contracts/src/knowledge/`): knowledge types, scopes, and relations; `AddKnowledge` and `AssignCharacter` commands; a strict perspective format; view and response types.
- **Domain** (`packages/domain/src/knowledge/`):
  - Immutable, single-holder knowledge records authored only through the World Engine, with fact footprints so knowledge blocks unsafe undo of what it depends on (ADR 0006 §9).
  - Perspective resolution: membership first, permission from the actor's role only, no fallback.
  - Whitelisted projections and five queries: list (filters, as-of world time), get, related, entity knowledge, and known entities. A hidden record or entity is answered exactly like a nonexistent one.
- **Server** (`apps/server/src/http/`): Fastify app with development persona authentication (refused in production), strict validation, fixed error bodies, and `no-store`/`Vary` headers. Five knowledge GET routes plus a command route; the replaced `node:http` health server is removed.
- **Fixtures:**
  - `knowledge-seed.json`: 30 records across all six scopes, cross-scope relations in both directions, and an opaque secret faction ID.
  - `personas.json`: development persona tokens.
  - `knowledge-boundary.json`: the shared Gate 01 visibility specification.
- **Docs:** ADRs 0008/0009, `packages/domain/src/knowledge/AGENTS.md`, `handoffs/AGENTS.md`, updated context map, README, server and fixture guides. Also repaired the ADR index rows for 0006/0007 that a Stage 10 edit had silently missed.

## Validation (local: Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                                                                     | Result                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm validate:ci-local`                                                                                    | PASS                                                          |
| `pnpm test`                                                                                                 | PASS — 22 files, 400 tests                                    |
| `pnpm test:integration`                                                                                     | PASS — 4 files, 17 tests                                      |
| `pnpm context-budget`                                                                                       | PASS — 100 files, 0 over 500 lines                            |
| Fresh volume: `pnpm db:migrate`, `pnpm seed:ravenford` ×2                                                   | PASS — 55 commands → stream version 64; reseed writes nothing |
| Live server smoke test (`curl` with persona tokens)                                                         | PASS                                                          |
| Mutation checks (unfiltered relations, all records visible, descriptions in entity refs, NPC granted PARTY) | Each detected by the test suites                              |

Gate evidence per surface is listed in the handoff's coverage ledger.

## Assumptions

- The party is the set of characters assigned to players by the DM, one character per player.
- A perspective that knows an entity sees its canonical name. Secret-identity entities use opaque IDs and are mentioned only by records in scopes allowed to know them.
- MIRA is a scope fixture requested by the DM. Runtime NPC context building is Stage 130.

## Known limitations

See the handoff's Known Limitations. Main points:

- Development-only authentication.
- No disguises or aliases.
- Current-assignment party access.
- Immutable records (no type transitions before Stage 70).
- No rate limiting.
- The CI workflow has not run on GitHub.

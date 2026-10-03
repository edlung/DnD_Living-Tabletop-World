# Server (`@ltw/server`)

Composition root of the modular monolith and the only workspace package allowed to perform I/O (`docs/adr/0004-module-boundaries.md`).

| Area                 | Entry                                                                     | Notes                                                                       |
| -------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Process start        | `src/main.ts`                                                             | Wires config, logging, HTTP. No domain logic here.                          |
| Config               | `src/platform/config/config.ts`                                           | Add variables to the zod schema; never echo values in errors.               |
| Logging              | `src/platform/logging/logger.ts`                                          | Use child loggers; bind request/actor/scope fields.                         |
| Database migrations  | `src/platform/db/`, `migrations/`                                         | Read `migrations/AGENTS.md` before adding SQL.                              |
| HTTP                 | `src/http/health-server.ts`                                               | Liveness only in Stage 0; API framework is a later ADR.                     |
| World Engine runtime | `src/world-engine/runtime.ts`, `src/world-engine/postgres-event-store.ts` | PostgreSQL EventStore; the only canonical write path. No HTTP routes yet.   |
| Ravenford seeding    | `src/world-engine/seed-ravenford-cli.ts`                                  | Idempotent; `pnpm seed:ravenford` after `pnpm build` and `pnpm db:migrate`. |

- Later domain modules go under `src/<feature>/`, each cohesive and imported directly; keep orchestration thin.
- Canonical mutation stays behind the World Engine boundary (`ARCHITECTURE_INVARIANTS.md` #1–2). Platform code never decides domain legality.
- `*.integration.test.ts` needs PostgreSQL (`pnpm db:up`); everything else is a unit test. Integration tests create a throwaway database each via `src/testing/throwaway-database.ts`.
- Kernel projections are canonical/DM data. Do not expose them over HTTP before the Stage 20 knowledge boundary exists.

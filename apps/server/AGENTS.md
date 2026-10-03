# Server (`@ltw/server`)

Composition root of the modular monolith and the only workspace package allowed to perform I/O (`docs/adr/0004-module-boundaries.md`).

| Area                 | Entry                                                                     | Notes                                                                                       |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Process start        | `src/main.ts`                                                             | Wires config, logging, HTTP. No domain logic here.                                          |
| Config               | `src/platform/config/config.ts`                                           | Add variables to the zod schema; never echo values in errors.                               |
| Logging              | `src/platform/logging/logger.ts`                                          | Use child loggers; bind request/actor/scope fields.                                         |
| Database migrations  | `src/platform/db/`, `migrations/`                                         | Read `migrations/AGENTS.md` before adding SQL.                                              |
| HTTP app             | `src/http/app.ts`, `src/http/routes/`                                     | Fastify (ADR 0009). Check order in `request-context.ts`; fixed error bodies in `errors.ts`. |
| Authentication       | `src/http/auth.ts`                                                        | Dev persona tokens only outside production; actors never come from request data.            |
| World Engine runtime | `src/world-engine/runtime.ts`, `src/world-engine/postgres-event-store.ts` | PostgreSQL EventStore; the only canonical write path.                                       |
| Ravenford seeding    | `src/world-engine/seed-ravenford-cli.ts`                                  | Idempotent; `pnpm seed:ravenford` after `pnpm build` and `pnpm db:migrate`.                 |

- Later domain modules go under `src/<feature>/`, each cohesive and imported directly; keep orchestration thin.
- Canonical mutation stays behind the World Engine boundary (`ARCHITECTURE_INVARIANTS.md` #1–2). Platform code never decides domain legality.
- `*.integration.test.ts` needs PostgreSQL (`pnpm db:up`); everything else is a unit test. Integration tests create a throwaway database each via `src/testing/throwaway-database.ts`.
- Canonical kernel state is never served over HTTP. Player-facing reads go through the knowledge perspectives (`resolvePerspective` and the queries in `@ltw/domain`); never add a route that returns canonical objects.
- HTTP tests use `src/testing/ravenford-app.ts` (seeded in-memory engine, real persona tokens) and the shared spec `fixtures/ravenford/knowledge-boundary.json`.

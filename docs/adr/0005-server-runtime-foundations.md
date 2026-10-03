# 0005. Server runtime foundations: config, logging, HTTP

- Status: Accepted; the HTTP decision is superseded by [0009](0009-http-api-and-dev-authentication.md)
- Date: 2026-10-03
- Stage: 0
- Decision type: technical
- Owner approval: not required (technical)

## Context

Stage 0 requires structured logging and environment/config validation with safe development defaults. `ARCHITECTURE.md` → Observability lists fields later stages must log (request ID, actor/perspective, knowledge scope, context source IDs, model/capability, validation results). No application API exists until later stages, and choosing an HTTP framework now would pre-empt API design.

## Options considered

- **Config:** hand-written checks vs `zod` schema vs a config framework (convict, envalid). `zod` is small, typed, and reusable for contracts later.
- **Logging:** `pino` (structured JSON, child loggers, built-in redaction, fast) vs `winston` (heavier, less strict JSON) vs `console`.
- **HTTP:** Fastify / Hono / Express now vs `node:http` liveness probe only, deferring the framework.

## Decision

- **Config** (`apps/server/src/platform/config/`): `loadConfig(env)` validates `NODE_ENV`, `LOG_LEVEL`, `HTTP_HOST`, `HTTP_PORT`, `DATABASE_URL` with `zod` and returns a frozen object. Development and test default to the docker-compose database; production requires `DATABASE_URL` and rejects the development credentials. Errors name the variable but never echo its value. `.env` is optional and loaded only by the server's npm scripts via Node's `--env-file-if-exists`; tests read the process environment.
- **Logging** (`apps/server/src/platform/logging/`): `createLogger` returns a `pino` logger emitting one JSON object per line with `service`, label `level`, ISO `time`, and `msg`. Modules receive child loggers with their bindings (`module`, `requestId`, later actor/perspective/scope). Common secret field names are redacted as a safety net; callers still must not log secrets or canonical secrets from the knowledge domain.
- **HTTP** (`apps/server/src/http/`): `node:http` serving `GET /healthz` only, with a server-generated request ID returned in `x-request-id` and bound to log entries (client-supplied IDs are ignored). The API framework is chosen when the first application API is introduced.

## Consequences

- Later stages add observability fields by binding them on child loggers; no logger rework required.
- Replacing `node:http` with a framework later touches only `apps/server/src/http/` and `main.ts`.

## Invariants affected

None weakened. Supports invariant 5 (no knowledge leakage) by establishing redaction and "never echo secret values" as defaults.

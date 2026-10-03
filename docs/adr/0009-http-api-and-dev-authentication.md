# 0009. HTTP API framework, development authentication, and response hygiene

- Status: Accepted
- Date: 2026-10-03
- Stage: 20
- Decision type: technical
- Owner approval: not required (technical). It implements the owner-approved boundary of ADR 0008.

## Context

Stage 20 needs an executable query surface for the knowledge boundary that an independent reviewer can attack: perspectives, malformed and forged scopes, serialization, errors, and caches. ADR 0005 deferred the HTTP framework until the first application API. A perspective is meaningful only if the caller's identity cannot be forged, but production authentication is not designed yet.

## Options considered

- **Framework:**
  - Fastify 5: pino-native logging (our logger), safe JSON parsing (prototype-poisoning rejection), in-process `inject()` testing, mature routing.
  - Hono: small and portable, but adds a Node adapter and its own logging.
  - `node:http` with a hand-written router: the most code to get right at an adversarial boundary.
- **Identity for the slice:**
  - Signed tokens with an issuer: premature without a product auth decision.
  - Trust a client-supplied actor or role: a trivially forgeable boundary.
  - Development persona tokens mapped to user actors on the server: chosen. Allowed only outside production.

## Decision

- **Fastify 5** builds the server app (`apps/server/src/http/`).
  - It uses our pino logger, server-generated request IDs (client `x-request-id` is ignored), a 64 KiB body limit, and JSON only.
  - `/healthz` is unchanged.
- **Authentication:** `Authorization: Bearer <token>`.
  - With `AUTH_MODE=dev-personas` (default in development and test), tokens come from `fixtures/ravenford/personas.json` and map to _user_ actors. There is never a system actor over HTTP.
  - Production rejects `dev-personas` at startup. With `AUTH_MODE=disabled`, every API call is unauthenticated (401) until a production authentication ADR exists.
- **Routes** (`/campaigns/:campaignId/…`):
  - `GET knowledge`, `GET knowledge/:knowledgeId`, `GET knowledge/:knowledgeId/related`, `GET entities`, `GET entities/:entityId/knowledge` — each requires `perspective=DM|PUBLIC|PARTY|PLAYER|CHARACTER:<id>|NPC:<id>`.
  - `POST commands` submits World Engine commands as the authenticated actor.
- **Validation:** path and query input is validated with strict schemas. Unknown, duplicated, or malformed parameters are rejected (400). Request bodies cannot carry an actor or campaign ID.
- **Check order:** authenticate (401) → validate input (400) → campaign membership (404 for non-members, the same as for nonexistent campaigns) → perspective permission (403, decided without inspecting whether the target exists) → query (404, identical for hidden and nonexistent).
- **Response hygiene:**
  - Error bodies are `{ error: { code, message }, requestId }` with fixed messages. They never echo input, stack traces, or internal errors; internals are logged server-side only.
  - Campaign responses carry `Cache-Control: no-store` and `Vary: Authorization`.
  - Projections are computed per request from canonical state. No per-perspective caching.
- **Commands over HTTP:**
  - Command IDs are namespaced per authenticated actor (stored as `http:<actorId>:<clientCommandId>`), so an HTTP caller can never collide with, or probe the existence of, another actor's or an internal command ID.
  - `CreateCampaign` is not accepted over HTTP; campaigns are created by trusted seeding in Stage 20.
  - Callers who are not campaign members get 404, whether or not the campaign exists.

## Consequences

- Later APIs (`/entities/:id/context`, actions, authoring) reuse this app, authentication, and error model.
- Persona tokens are development fixtures, not secrets. Production authentication and authorization need their own ADR before any deployment.
- Responses are JSON objects shaped by `@ltw/contracts` view types.

## Invariants affected

Supports 5 (no leakage through errors, caches, serialization) and 22 (the server is the only API surface). No invariant is weakened.

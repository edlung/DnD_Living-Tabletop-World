# Production sign-in (`src/auth/`)

Stage 340 part A: single-use DM invitations redeemed for a cookie session bound to one actor in
one campaign (ADR 0036 with its amendment of 2026-10-16; contract `docs/STAGE_340_DESIGN.md`,
implementation notes and security review fixes at its end). A
security boundary for Gate 06: a credential opens exactly its own campaign, fails closed in every
other case, and never appears in a log, trace, error, URL or listing.

| File                                                  | Role                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.ts`                                           | 256-bit tokens, their SHA-256, the session cookie (`ltw_session`, `Path=/api; HttpOnly; SameSite=Strict`, `Secure` except http loopback) and how many a request presented, the attempts evidence HMAC.                                                                                                                                                                                                                                |
| `credential-store.ts`, `postgres-credential-store.ts` | Invitations, sessions and redeem evidence by hash (migration `0010_auth.sql`); the in-memory store is the reference semantics. A redeem's "mark used + create session + revoke the seat's other invitations" is one transaction.                                                                                                                                                                                                      |
| `session-authenticator.ts`                            | Invitation mode's `Authenticator`: the cookie only; a session is live until it expires (14 days) or is revoked; `last_seen_at` at most every 5 minutes.                                                                                                                                                                                                                                                                               |
| `sign-in.ts`                                          | Issuing an invitation (link `<PUBLIC_ORIGIN>/join#<token>`) and redeeming one: a player's seat is `AssignCharacter` by the system actor `sign-in` under `invite:<invitationId>`, with the actor stored before the command so a retry converges.                                                                                                                                                                                       |
| `auth-routes.ts`                                      | `POST /auth/redeem` (limits per client group, 409 for a signed-in browser without `replaceSession: true`, constant 401 for every well-formed failure), `GET /auth/session` (401 unless the actor is still a member), `POST /auth/sign-out`.                                                                                                                                                                                           |
| `member-routes.ts`                                    | DM only: `POST\|GET /campaigns/:id/invitations`, `POST …/invitations/:invitationId/revoke`, `POST …/members/:characterId/revoke` (sessions and open invitations first, then `ReleaseCharacter` as the DM).                                                                                                                                                                                                                            |
| `limits.ts`, `window-counter.ts`                      | In-memory, per process, bounded time-bucketed counters (≤10,000 keys a table, never more permissive than a limit): redeem 10/min per client, 5 failures per token prefix, 15 min lockout after 20 failures/hour, 60 refused redeems/min in all, evidence ≤30 rows/min; AI (ranking included) and image requests 20/min per actor with 2 in flight; 20 invitations/hour per DM. Wired through `http/request-context.ts` (`expensive`). |
| `composition.ts`                                      | `AUTH_MODE` → authenticator and sign-in dependencies; refuses development personas under `NODE_ENV=production` or off a loopback `HTTP_HOST`; hourly pruning of evidence and long-dead sessions.                                                                                                                                                                                                                                      |
| `operator.ts`, `operator-cli.ts`                      | `pnpm auth:operator`: `dm-invite` (the only way to DM access in production), `revoke-dm` and `revoke-actor` (with `--authorization-source`, echoed), `sessions` (no token or hash); one JSON line each.                                                                                                                                                                                                                               |

- Never log, trace, store or echo a token, a token hash, a cookie or an address. Evidence rows key
  client groups and token prefixes by an HMAC whose key lives in the process only; log lines
  use `LOG_SERIALIZERS` (`platform/logging/logger.ts`), which drop addresses and headers.
- Limits key on `clientGroup(request.ip)` (`platform/net/addresses.ts`): the client behind the
  proxy `LTW_TRUST_PROXY` names, an IPv6 /64 as one. A table that is full refuses a new client's
  redeem (fail closed); never add a sweep over a table or a per-key array that grows with traffic.
- Only a request that presented exactly one session cookie, and it opened nothing, gets a
  clearing `Set-Cookie`; `/auth/session` is origin-checked. A redeem never replaces a working
  session without `replaceSession: true`.
- Every failed redeem answers the same 401; a session used on another campaign is an actor no
  campaign has (`http/auth.ts`, `actorFor`), so it ends in the same 404 as a non-member, after
  input validation (ADR 0009 order).
- Membership changes only through World Engine commands; the generic command route refuses
  `ReleaseCharacter` so a release always revokes sessions first. A redeem whose invitation was
  revoked or expired while it took the seat undoes its own assignment (`invite:<id>:undo`),
  unless another redeem of the same invitation completed.
- The origin check (`http/security.ts`) runs first in invitation mode: non-GET requests need
  `Origin` equal to `PUBLIC_ORIGIN`; the live stream and `/auth/session` need that `Origin` or,
  without one, `Sec-Fetch-Site: same-origin`.
- Tests: `sign-in.test.ts` (flows; forged, expired, revoked, used, replayed, cross-campaign;
  ADR 0009 order; retry and race), `member-routes.test.ts`, `sign-in-limits.test.ts` (proxy,
  /64, budget, evidence cap, full tables, AI ranking), `limits.test.ts` (rotating addresses),
  `window-counter.test.ts`, `sign-in-cookies.test.ts` (no cross-site sign-out, redeem
  confirmation), `browser-checks.test.ts` (origin, JSON only, headers), `sign-in-live.test.ts`
  (sign-out, revocation and expiry close the stream within one cycle), `sign-in-logs.test.ts`
  (captured logger, traces, evidence, bodies, no addresses), `modes.test.ts` (configuration
  combinations, composition, cookie), `operator.test.ts` (arguments, DM revocation, sign-out
  everywhere, listing), `credentials.integration.test.ts` (PostgreSQL constraints, one-way
  triggers, races, pruning, restart, operator). Support: `testing/sign-in.ts`.

# Stage 340 design — production sign-in by DM invitation (adopted)

Date: 2026-10-15. Status: ADOPTED by the session under the owner's delegation
(`reviews/OWNER_DECISIONS_9_2026-10-15.json`); Q4 decided: single-use invitation links issued by
the DM, no passwords, no e-mail. Scope: `work-orders/OPUS_STAGE_340.md`. Decision record:
`docs/adr/0036-production-sign-in.md` (closes the production gap ADR 0009 left open). Parts: A — server (this branch first), B — the browser screens on the Stage 320 shell.

## Threat model (summary; the ADR holds the full table)

Assets: campaign membership, the DM's authority, each player's control of one character, secrets
behind the knowledge boundary, AI and image spending. Adversaries: an outsider with the URL; a
link interceptor; a player trying to act as someone else or reach another campaign; a stolen
browser session; scripted guessing; cross-site requests; log/trace readers. Out of scope for the
alpha: a compromised server host or database; denial of service beyond per-process limits.

## Credentials

- **Invitation**: 32 random bytes (base64url), shown once to the DM as
  `https://<host>/join#<token>` (fragment: never sent to the server, proxies or logs; the client
  posts it in a JSON body and removes it from the address bar). Stored as SHA-256 with campaign,
  purpose (`player` with a character ID, or `dm` from the operator CLI), creator, created/expires
  (default 72 h, max 7 days), `used_at`, `revoked_at`. Single use.
- **Session**: 32 random bytes in an `HttpOnly; Secure; SameSite=Strict; Path=/api` cookie
  `ltw_session` (the `Secure` flag is relaxed only for `http://localhost` development). Stored as
  SHA-256 with actor, campaign, created/expires (14 days absolute), `revoked_at`,
  `last_seen_at` (coarse, 5 min). One credential is bound to one actor in one campaign.
- Tables in migration 0010: `ltw_auth_invitations`, `ltw_auth_sessions`, `ltw_auth_attempts`
  (rate-limit evidence, pruned). Tokens never appear in logs, traces, errors or URLs after sign-in.

## Flows

- **Operator bootstrap**: `pnpm auth:operator dm-invite --campaign <id> --expires-hours <n>` prints
  one DM invitation link for the campaign's `dmActorId` (operator action; the only way to obtain
  DM access in production).
- **DM invites a player**: DM-only `POST /campaigns/:id/invitations {characterId, expiresHours}`
  for an unassigned character → link shown once. `GET /campaigns/:id/invitations` lists pending
  and used invitations and members (no tokens). `POST …/invitations/:invitationId/revoke`.
- **Redeem**: `POST /auth/redeem {token}` (rate-limited, constant-shape failure): validates hash,
  unused, unrevoked, unexpired; for a player invitation creates actor `player:<uuid>` and submits
  `AssignCharacter` through the World Engine as the system actor with command ID
  `invite:<invitationId>` (membership changes only through World Engine commands); marks used and
  creates the session in the same database transaction as far as the stores allow (the World
  Engine command is idempotent by command ID, so a retried redeem converges). Responds with the
  campaign ID; sets the cookie.
- **Session**: `GET /auth/session` returns `{campaignId}` or 401; `POST /auth/sign-out` revokes
  the session and clears the cookie.
- **Revocation**: DM-only `POST /campaigns/:id/members/:characterId/revoke` revokes every session
  of the actor controlling that character and every open invitation for it, and submits the new
  kernel command `ReleaseCharacter {characterId}` (DM only; event `CharacterReleased` removes the
  roster entry going forward; earlier commands stay valid history). The character can then be
  invited again. Revocation takes effect on the next request, including the live stream's next
  cycle (its injected view requests carry the same cookie and get 401).

## Request checks

`Authenticator.authenticate` receives the request's `authorization` and `cookie` headers.
`AUTH_MODE=invitations` (production) accepts only the session cookie; `dev-personas` keeps bearer
personas for development and tests and stays refused in production. The ADR 0009 order is
unchanged (401 → 400 → 404 → 403). CSRF: `SameSite=Strict`, JSON-only bodies, and for every
non-GET request and the live stream the `Origin` header must equal the configured public origin
(`PUBLIC_ORIGIN`). The live stream's fingerprint injections forward the subscriber's cookie.

## Limits

In-memory per process (single instance in the alpha): redeem 10/min per IP and 5 failures per
token prefix, lockout 15 min after 20 failures per IP per hour; AI routes (intents, NPC dialogue,
Chronicle generation) and image requests 20/min per actor with at most 2 in flight; invitations
20/hour per DM; body 64 KiB (unchanged); live subscriptions as Stage 310. Responses for limits are
429 with a fixed body. Campaigns and members cannot be enumerated: unknown campaign, non-member and
revoked look identical (404 after authentication, 401 before).

## Browser

The client stops sending `Authorization` in invitation mode and uses `credentials: 'same-origin'`.
A strict Content-Security-Policy (`default-src 'self'; img-src 'self' blob: data:;
connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`) and `Referrer-Policy: no-referrer`
come from the server (and the proxy in Stage 350). The join page reads the fragment, posts it,
replaces the history entry, and shows a fixed message on failure. A signed-out or revoked session
returns to a "you are signed out" screen.

## Evidence

`pnpm validate`. HTTP tests: forged, expired, revoked, used, replayed and cross-campaign
invitations and sessions fail closed; the live stream closes within one cycle after sign-out or
revocation; unknown/non-member/revoked campaigns are indistinguishable; limits return 429; no
token in logs (captured logger), traces or error bodies; CSRF: missing or foreign `Origin` refused;
dev personas refused when `NODE_ENV=production`. Kernel: `ReleaseCharacter` decide/evolve/undo/
replay tests. Browser: DM invites, player joins through the link, plays, DM revokes, player is
signed out live. The completion report lists every new route for Gate 06.

## Implementation notes (part A, server)

Where the server refines or departs from the text above, and why (recorded for part B and Gate 06):

- **Live stream origin.** Browsers send no `Origin` on a same-origin GET, so the stream accepts
  `Origin` = `PUBLIC_ORIGIN` or, without an `Origin`, `Sec-Fetch-Site: same-origin`; any foreign
  `Origin` or other fetch metadata is refused (403). Non-GET requests need the exact `Origin`.
- **Modes.** `AUTH_MODE` keeps `disabled`, still the production default (nobody signs in until the
  operator chooses `invitations`); `PUBLIC_ORIGIN` is required in invitation mode, an exact origin,
  `https` (plain `http` only for a loopback host outside production). The sign-in routes, limits
  and origin check exist only in invitation mode, so development personas behave as before.
- **Binding.** A session on another campaign becomes an actor no campaign has, so validation still
  precedes the non-member 404 (ADR 0009 order); this holds even where its actor is that
  campaign's DM too.
- **Redeem.** A malformed body is 400 (ADR 0009); every well-formed failure is the same 401.
  Redeeming in a browser that holds a session revokes that session. Taking a seat revokes the
  character's other open invitations in the same transaction; a redeem whose invitation is revoked
  or expires while it takes the seat undoes that assignment (fail closed). Inviting for a taken
  seat is 409, for anything but a character 404.
- **`GET /auth/session`** answers 401 (and clears the cookie) when the session's actor is no longer
  a member, so a client never treats a seatless session as signed in.
- **Revocation.** The generic command route refuses `ReleaseCharacter`: a release always goes
  through `POST …/members/:characterId/revoke`, which revokes sessions first. Undoing a release is
  allowed only while no later command stands (later decisions may rest on the empty seat, which no
  footprint records) and restores the roster in assignment order.
- **Limits** answer right after authentication on AI routes and after the DM check on invitations;
  the per-address limits read `request.ip`, so Stage 350 must make the proxy pass the client
  address (Fastify `trustProxy` for the proxy only) or they count the proxy.
- **Evidence.** `ltw_auth_attempts` keys addresses and token prefixes by an HMAC whose key lives in
  the process only; rows are pruned after 7 days, dead sessions 30 days after expiry.
- **Headers.** `Vary: Cookie` in invitation mode (`Authorization` with personas); a route's
  stricter CSP (asset content) is kept.

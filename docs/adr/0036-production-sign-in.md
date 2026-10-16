# 0036. Production sign-in: single-use DM invitations and a cookie session

- Status: Accepted (owner product decision Q4 of 2026-10-15; technical design by the session)
- Date: 2026-10-15
- Stage: 340
- Decision type: product (how people join) and technical (credentials, browser, limits).
- Owner approval: Q4 "Ссылки-приглашения от DM (Recommended)" — single-use invitation links issued
  by the DM, no passwords, no e-mail (`reviews/OWNER_DECISIONS_9_2026-10-15.json`). Full design:
  `docs/STAGE_340_DESIGN.md`. Closes the production gap ADR 0009 left open.

## Context

ADR 0009 authenticates development personas by bearer token and refuses them in production, so a
production build had no way in. The alpha is a closed table: a DM and one to three players who
know each other; no accounts, passwords or e-mail infrastructure are wanted.

## Threat model

| Adversary                         | Goal                                               | Control                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Outsider with the site URL        | Enter a campaign                                   | Only a valid unused invitation or a live session opens anything; campaigns are not enumerable (unknown, non-member and revoked look the same)                                              |
| Interceptor of an invitation link | Take the seat                                      | Token in the URL fragment (never sent to servers, proxies or logs); single use; short expiry (72 h default, 7 days max); the DM sees "used" and can revoke and re-invite                   |
| Player                            | Act as another character or enter another campaign | A session is bound to one actor in one campaign; the ADR 0009 check order (authenticate → validate → membership → perspective) is unchanged; membership only through World Engine commands |
| Stolen browser session            | Keep access                                        | HttpOnly cookie (no script access), 14-day absolute expiry, sign-out and DM revocation take effect on the next request and on the live stream's next cycle                                 |
| Scripted guessing                 | Find a token                                       | 256-bit tokens stored as SHA-256; redeem limited per IP and per token prefix with lockout; constant-shape failures                                                                         |
| Cross-site request                | Act with the victim's cookie                       | `SameSite=Strict`; JSON-only bodies; `Origin` must equal `PUBLIC_ORIGIN` for every non-GET request and for the live stream                                                                 |
| Script injection                  | Read the credential                                | The cookie is HttpOnly; a strict Content-Security-Policy; React escapes text; no HTML from AI output                                                                                       |
| Log or trace reader               | Harvest credentials                                | Tokens never reach logs, traces, errors or URLs after sign-in (tested with a captured logger)                                                                                              |
| Spender                           | Run up AI or image costs                           | Per-actor limits on AI and image routes with in-flight caps, on top of the stored spending ceilings                                                                                        |

Out of scope for the alpha: a compromised host or database, distributed denial of service.

## Decisions

1. **Invitations.** 32 random bytes (base64url) shown once as `https://<host>/join#<token>`; stored
   hashed with campaign, purpose (`player` + character, or `dm`), creator, expiry, used and revoked
   times. The DM invites players; the operator CLI issues the DM's own invitation.
2. **Redeem.** `POST /auth/redeem {token}` checks the hash, unused, unrevoked, unexpired; a player
   invitation creates actor `player:<uuid>` and assigns the character through the World Engine
   (`AssignCharacter`, system actor, command ID `invite:<invitationId>`, idempotent); then the
   session is created and the cookie set.
3. **Session.** 32 random bytes in `ltw_session` (`HttpOnly; Secure; SameSite=Strict; Path=/api`;
   `Secure` relaxed only for `http://localhost` development), stored hashed with actor, campaign,
   expiry (14 days absolute) and revocation.
4. **Membership management.** The DM lists members and invitations (never tokens), revokes an
   invitation, and revokes a member: their sessions and open invitations are revoked and the new
   kernel command `ReleaseCharacter` frees the character for a new invitation.
5. **Modes.** `AUTH_MODE=invitations` accepts only session cookies; `dev-personas` keeps bearer
   personas for development and tests and is refused when `NODE_ENV=production`.
6. **Limits.** In-memory per process (single instance in the alpha): redeem and lockout limits,
   per-actor AI and image route limits with in-flight caps, invitation issuance per DM; 429 with a
   fixed body.
7. **Browser.** No `Authorization` header in invitation mode; `credentials: 'same-origin'`; the join
   page posts the fragment and replaces the history entry; CSP and `Referrer-Policy: no-referrer`
   from the server and the proxy.

## Consequences

- Production has a way in that needs no accounts; losing a link costs a re-invitation.
- New routes (`/auth/*`, invitations, members) and the kernel command are Gate 06 surfaces
  (`docs/GATE_COVERAGE.md`).
- Limits are per process; scaling past one instance needs a shared limiter (recorded trigger).

## Implementation (Stage 340 part A, 2026-10-16)

- The live stream's origin check accepts `Sec-Fetch-Site: same-origin` when a same-origin GET
  carries no `Origin` (browsers send none); non-GET requests still need `Origin` = `PUBLIC_ORIGIN`.
- `ReleaseCharacter` is the DM's alone; its undo is allowed only while no later command stands
  (later decisions may rest on the empty seat) and restores the roster in assignment order. The
  generic command route refuses it, so a release always revokes the player's sessions first.
- `AUTH_MODE=disabled` stays the production default; invitation mode requires `PUBLIC_ORIGIN`.
  Details: `docs/STAGE_340_DESIGN.md`, "Implementation notes (part A, server)".

## Amendments

- 2026-10-16 (Stage 340 part A, security review): seven findings fixed; the contract is in
  `docs/STAGE_340_DESIGN.md` ("Security review fixes").
  1. **No cross-site sign-out.** `GET`/`HEAD /auth/session` joins the live stream under the origin
     check (`Origin` = `PUBLIC_ORIGIN`, or without one `Sec-Fetch-Site: same-origin`; otherwise the
     fixed 403, which never touches the cookie). A 401 of `/auth/session` or `/auth/sign-out`
     clears the cookie only when the request presented exactly one `ltw_session` cookie and it
     opened nothing: a request without one (a cross-site navigation never carries the strict
     cookie) or with two (ambiguous) gets no `Set-Cookie`. The only response that sets the cookie
     is a successful redeem, a POST under the origin check.
  2. **Limits key on the client, in bounded memory.** `LTW_TRUST_PROXY` (`none`, or the reverse
     proxy's addresses or CIDR ranges, never `/0`) is Fastify's `trustProxy`; invitation mode
     refuses to start without it. Redeem limits key on the client group: an IPv4 address
     (IPv4-mapped IPv6 included) or an IPv6 /64; anything else is one shared group. Every limit is
     a time-bucketed counter: twelve slices per window, an event counted for at least the window
     and at most one slice longer (never more permissive than the limit), at most 10,000 keys per
     table, O(slices) per call with amortized O(1) eviction from the oldest end, never a sweep. A
     new client the full tables cannot follow is refused a redeem (fail closed); known clients,
     signed-in requests and per-actor limits carry on. A process-wide budget of 60 refused (or
     still undecided) redeems per minute holds every redeem for the rest of the minute. Evidence
     rows of refused and limited redeems are written at most 30 a minute (a limited client at most
     once a minute); successful redeems always.
  3. **The DM's sessions can be revoked.** Three commands of `pnpm auth:operator`: `revoke-dm`
     (`--campaign`, `--authorization-source`) revokes the DM's sessions in that campaign and its
     open DM invitations; `revoke-actor` (`--actor`, `--authorization-source`) signs one actor
     out everywhere (sessions and open invitations in every campaign); `sessions` (`--campaign`)
     lists live sessions (session ID, actor, role, characters, times; never a token or hash). A
     revocation's authorization source is echoed in its one JSON output line, the operator's
     record (not stored: no schema change).
  4. **A redeem never silently replaces a session.** A browser holding a live session whose actor
     is still a member gets 409 `CONFLICT` (fixed body), the invitation unused, unless the body
     confirms with `replaceSession: true`; the join page (part B) asks the person first. A 409
     is neither a failure nor a refused guess.
  5. **AI ranking is limited.** A context request naming `ranking` takes the actor's
     expensive-request slot right after authentication, like every other AI route.
  6. **No client address in logs.** Log serializers (Fastify's request lines included) write a
     request as its method and URL, a response as its status: never the client's address or port,
     a header or a cookie; address fields are redacted as a safety net.
  7. **Development personas on loopback only.** `dev-personas` is refused, by the configuration
     and again by the composition, under `NODE_ENV=production`, with `PUBLIC_ORIGIN` set, or when
     `HTTP_HOST` is not loopback (`localhost`, 127.0.0.0/8, `::1`), chosen or defaulted: a
     forgotten `NODE_ENV` on a public host fails closed.

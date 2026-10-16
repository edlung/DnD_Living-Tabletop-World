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
  DM access in production). The operator also revokes the DM (`revoke-dm`), signs one actor out
  everywhere (`revoke-actor`) and lists live sessions (`sessions`); see "Security review fixes".
- **DM invites a player**: DM-only `POST /campaigns/:id/invitations {characterId, expiresHours}`
  for an unassigned character → link shown once. `GET /campaigns/:id/invitations` lists pending
  and used invitations and members (no tokens). `POST …/invitations/:invitationId/revoke`.
- **Redeem**: `POST /auth/redeem {token}` (rate-limited, constant-shape failure): validates hash,
  unused, unrevoked, unexpired; for a player invitation creates actor `player:<uuid>` and submits
  `AssignCharacter` through the World Engine as the system actor with command ID
  `invite:<invitationId>` (membership changes only through World Engine commands); marks used and
  creates the session in the same database transaction as far as the stores allow (the World
  Engine command is idempotent by command ID, so a retried redeem converges). Responds with the
  campaign ID; sets the cookie. A browser already signed in gets 409 until it confirms with
  `{token, replaceSession: true}` (the join page asks the person first).
- **Session**: `GET /auth/session` (same-origin only) returns `{campaignId}` or 401;
  `POST /auth/sign-out` revokes the session and clears the cookie. A 401 clears the cookie only
  when the request presented one that opened nothing.
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
non-GET request, the live stream and `GET /auth/session` the `Origin` header must equal the
configured public origin (`PUBLIC_ORIGIN`). The live stream's fingerprint injections forward the
subscriber's cookie. Development personas run only on a loopback `HTTP_HOST` without
`PUBLIC_ORIGIN`, never in production.

## Limits

In-memory per process (single instance in the alpha), in bounded time-bucketed counters: redeem
10/min per client (the address the trusted proxy names; an IPv6 /64 is one client) and 5 failures
per token prefix, lockout 15 min after 20 failures per client per hour, 60 refused redeems per
minute across every client; AI routes (intents, NPC dialogue, Chronicle generation, AI ranking of
a context) and image requests 20/min per actor with at most 2 in flight; invitations 20/hour per
DM; body 64 KiB (unchanged); live subscriptions as Stage 310. Responses for limits are 429 with a
fixed body. Campaigns and members cannot be enumerated: unknown campaign, non-member and revoked
look identical (404 after authentication, 401 before).

## Browser

The client stops sending `Authorization` in invitation mode and uses `credentials: 'same-origin'`.
A strict Content-Security-Policy (`default-src 'self'; img-src 'self' blob: data:;
connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`) and `Referrer-Policy: no-referrer`
come from the server (and the proxy in Stage 350). The join page reads the fragment, posts it,
replaces the history entry, and shows a fixed message on failure; on 409 it asks the person
whether to replace the sign-in this browser holds and posts again with `replaceSession: true`
only after a yes. A signed-out or revoked session returns to a "you are signed out" screen.

## Evidence

`pnpm validate`. HTTP tests: forged, expired, revoked, used, replayed and cross-campaign
invitations and sessions fail closed; the live stream closes within one cycle after sign-out or
revocation; unknown/non-member/revoked campaigns are indistinguishable; limits return 429; no
token, cookie or client address in logs (captured logger), traces or error bodies; CSRF: missing
or foreign `Origin` refused, no cross-site sign-out; dev personas refused in production, with a
public origin or off loopback; limits bounded under rotating addresses. Kernel: `ReleaseCharacter` decide/evolve/undo/
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
  Redeeming in a browser that holds a session revokes that session once the browser confirmed
  the replacement (or the session no longer worked). Taking a seat revokes the
  character's other open invitations in the same transaction; a redeem whose invitation is revoked
  or expires while it takes the seat undoes that assignment (fail closed). Inviting for a taken
  seat is 409, for anything but a character 404.
- **`GET /auth/session`** answers 401 (and clears the cookie it was given) when the session's actor
  is no longer a member, so a client never treats a seatless session as signed in.
- **Revocation.** The generic command route refuses `ReleaseCharacter`: a release always goes
  through `POST …/members/:characterId/revoke`, which revokes sessions first. Undoing a release is
  allowed only while no later command stands (later decisions may rest on the empty seat, which no
  footprint records) and restores the roster in assignment order.
- **Limits** answer right after authentication on AI routes and after the DM check on invitations;
  the per-client limits read `request.ip` behind the proxy `LTW_TRUST_PROXY` names (below).
- **Evidence.** `ltw_auth_attempts` keys addresses and token prefixes by an HMAC whose key lives in
  the process only; rows are pruned after 7 days, dead sessions 30 days after expiry.
- **Headers.** `Vary: Cookie` in invitation mode (`Authorization` with personas); a route's
  stricter CSP (asset content) is kept.

## Security review fixes (part A, 2026-10-16)

The review of part A found seven issues; ADR 0036's amendment of 2026-10-16 records the decisions.
What part B and Stage 350 build on:

- **Cookie hygiene.** `GET`/`HEAD /auth/session` needs `Origin` = `PUBLIC_ORIGIN` or
  `Sec-Fetch-Site: same-origin` (a plain same-origin `fetch` sends the latter); anything else is the
  fixed 403 without `Set-Cookie`. A 401 of `/auth/session` or `/auth/sign-out` carries a clearing
  `Set-Cookie` only when the request presented exactly one `ltw_session` cookie and it opened
  nothing, so no other site can sign a browser out.
- **Redeem confirmation (part B).** `POST /auth/redeem {token}` from a browser whose session is
  live and still a member answers 409 `{"error":{"code":"CONFLICT","message":"Conflict"}}`; the
  invitation stays unused and the session untouched. The join page then shows the campaign of
  `GET /auth/session`, asks whether to replace that sign-in, and only after a yes posts
  `{token, replaceSession: true}`; the old session is revoked when the new one is created.
  `replaceSession` must be a boolean (400 otherwise); `false` is no confirmation.
- **Trusted proxy (Stage 350).** `LTW_TRUST_PROXY` is required in invitation mode: `none` when the
  server faces clients directly, or the reverse proxy's addresses or CIDR ranges (comma-separated;
  `/0` refused). Only a request whose peer is one of them has its `X-Forwarded-For` read; the proxy
  must append the client address (Caddy does) and the server must be reachable only through it.
  Without it every client behind the proxy shares one limit.
- **Limits.** Clients are grouped (an IPv4 address, IPv4-mapped included; an IPv6 /64; anything
  else is the one group `unknown`). Every table is a `WindowCounter` (`src/auth/window-counter.ts`):
  twelve slices per window, never more permissive than its limit, released at most one slice
  (a twelfth of the window) after the window, at most 10,000 keys, no sweeps. At the cap a new
  client's redeem is refused (429); tracked clients, signed-in requests and per-actor limits are
  unaffected. 60 refused or undecided redeems a minute across every client hold all redeems until
  the minute passes. Evidence rows: successful redeems always, refused and limited ones at most 30
  a minute (a limited client once a minute).
- **Operator (Stage 350 runbook "revoke a user").** Three commands of `pnpm auth:operator`:
  `revoke-dm` (`--campaign <id>`, `--authorization-source <reference>`) revokes the DM's sessions
  in that campaign and its open DM invitations, so the DM's new `dm-invite` comes after it;
  `revoke-actor` (`--actor <actorId>`, `--authorization-source <reference>`) revokes that actor's
  sessions and open invitations in every campaign; `sessions` (`--campaign <id>`) lists live
  sessions (session ID, actor, role, characters, created, expires, last seen; never a token or
  hash). The authorization source (who asked, where; 1-200 printable characters) is echoed in the
  one JSON output line. A player is still revoked by the DM's member route, which also frees the
  seat.
- **AI ranking.** `GET …/entities/:entityId/context` with any `ranking` parameter takes the actor's
  AI slot (20/min, 2 in flight) right after authentication; without one it is not limited.
- **Logs.** Request lines carry method, URL, status and request ID; never an address, port,
  header or cookie (`LOG_SERIALIZERS` in `src/platform/logging/logger.ts`).
- **Development personas.** Refused (startup error naming `AUTH_MODE`) under `NODE_ENV=production`,
  with `PUBLIC_ORIGIN` set, or with a non-loopback `HTTP_HOST`, whether `AUTH_MODE` was chosen or
  defaulted; the composition refuses them again off loopback.

## Implementation notes (part B, browser)

The browser screens on the Stage 320 shell (2026-10-16). Where they refine the text above:

- **Which sign-in, by asking the server.** One client build serves every mode: the page asks
  `GET /auth/session` (same origin). 200 enters that campaign, 401 shows "Join with an
  invitation", 404 (a server without the sign-in routes: development personas, or `disabled`)
  shows the personas' token form as before, anything else "The table could not be reached" with
  Try again. Stage 350's proxy serves the plain `pnpm build`.
- **Join page.** `main.tsx` takes the fragment of `/join#<token>` and replaces the history entry
  with `/` (`history.replaceState`) before the first request, then sends that request exactly
  once (React's development double effects never resend a token): the redeem, or the probe. A
  fragment that is no token fails without a request. 200 enters the campaign. 409 asks first,
  naming the current sign-in (its campaign, and "the DM" or the character, read from
  `/auth/session` and that campaign's `session` view): "Replace with this invitation" posts
  `{token, replaceSession: true}`; "Keep my current sign-in" forgets the token (the invitation
  stays unused) and re-reads the session. Every other answer — 401, 400, 403, 404, 429, 5xx, no
  answer — is one fixed failure, "This invitation cannot be used", with "Back to the start". The
  server answers 409 before it looks at the token, so a signed-in browser is asked about a used or
  forged link too; the failure follows the confirmation, and the current sign-in survives it.
- **The cookie session.** A connection is a development persona's (bearer token,
  `credentials: 'omit'`) or a session's (no `Authorization`, `credentials: 'same-origin'`; the live
  stream likewise). Any 401 — a view, a command, the stream refused with 401 or closed as
  `unauthenticated` — tells the screen, which shows "You are signed out"; only the session on
  screen can be signed out by an answer, never a later one by an earlier session's late answer.
  The signed-out screen keeps the language of the campaign that ended. Back/Forward restoration
  asks the server again instead of showing a world from memory.
- **Signing out** is the top bar's leave control ("Sign out") and asks first, in a native modal
  dialog (focus on "Stay signed in"; Escape stays): it is final, coming back takes a new
  invitation. The screen changes only on the server's 204 or 401; otherwise the dialog says the
  person is still signed in.
- **Players sheet** (dock item "Players", glyph `party`; the DM perspective with production
  sign-in only, where its routes exist): invite a player for a character nobody plays (the link
  lasts 1, 3 or 7 days, 3 by default), the link shown once with its warning, Copy (where the
  clipboard is unavailable the field is selected to copy by hand) and Hide; the link is dropped
  once its invitation is used, revoked or replaced. A lost answer says an invitation may exist
  without a link, to be revoked. The players at the table (signed in now or not, open sessions,
  coarse last seen) with "Revoke access", asked first; the invitations waiting to be used with
  "Revoke the invitation"; used, revoked and expired ones folded away. The listing is read while
  the sheet is open and follows the live signal (a player who joins shows up without a refresh).
  Never a token or a player's actor ID.
- **Browser tests.** Playwright also starts `apps/server/src/testing/ui-sign-in-server.ts`
  (invitation mode over in-memory credentials, port 4313) behind a second Vite server (4312, its
  own dependency cache), whose origin is that server's `PUBLIC_ORIGIN`. The operator's DM
  invitations are seeded with tokens derived from `LTW_UI_SIGN_IN_SEED`, a random value
  `playwright.config.ts` makes per run; redeem limits are raised there (every journey is the one
  loopback client; the limits have their server tests). Every development-persona journey runs
  as before.
- **Pictures.** Only existing GPT pictures: the key art, emblem and divider, and UI-kit glyphs
  (`party`, `invitation`, `link`, `copy`, `revoke`, `member`, `character`, `key`, `replace`,
  `leave`, `hidden`, `offline`, `refresh`). Nothing new was needed.

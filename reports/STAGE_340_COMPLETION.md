# Stage 340 — Production sign-in

- Date: 2026-10-16 (Europe/Oslo). Branch `stage-340-sign-in` (on the final Stage 320 client).
- Status: **IMPLEMENTED (server part A, security fixes, browser part B); OWNER PLAY ACCEPTANCE
  PENDING.** The owner deferred manual checks; the stage is complete for the owner only after they
  try the affected flows. An independent adversarial security review of part A (a fresh agent,
  read-only) found seven issues, all fixed; an independent review of part B found four, all fixed
  (below).
- Work order: `work-orders/OPUS_STAGE_340.md`. Contract: `docs/STAGE_340_DESIGN.md` (adopted under
  the owner's delegation, `reviews/OWNER_DECISIONS_9_2026-10-15.json`; implementation notes, the
  "Security review fixes" and part B notes at its end). Decision record:
  `docs/adr/0036-production-sign-in.md` (threat model; amendments). Owner decision Q4
  (2026-10-15): single-use DM invitation links, no passwords, no e-mail.
- Commits: design `f052d6d`, part A server `05cc23f`, security review fixes `35eace8`, part B
  browser `6e0ae0f` (hashes after the rebase onto Stage 320), completion report `646557a`, part B
  review fixes in the commit after it ("Stage 340: fix part B review findings …").

## What the stage does

- **Invitations.** The DM invites a player for a free character (1, 3 or 7 days); the link
  `https://<host>/join#<token>` is shown once. The operator CLI issues the DM's own link
  (`pnpm auth:operator dm-invite --campaign <id> --expires-hours <n>`). Tokens are 256 random bits,
  stored as SHA-256 only; single use under races (a conditional update in one transaction).
- **Redeem and session.** `POST /auth/redeem` seats the player through the World Engine
  (`AssignCharacter`, system actor `sign-in`, command `invite:<id>`, idempotent) and sets an HttpOnly
  `SameSite=Strict` cookie on `/api` (14 days). A browser already signed in gets 409 and the page
  asks before replacing that session. `GET /auth/session`, `POST /auth/sign-out`.
- **Membership.** The DM lists invitations and players (never tokens or actor IDs), revokes an
  invitation, revokes a player (sessions and open invitations revoked, then the new kernel command
  `ReleaseCharacter` frees the seat; undoable only from the end of history). Operator commands
  revoke the DM's sessions or any actor's sessions everywhere, and list live sessions.
- **Request checks.** The ADR 0009 order is unchanged; unknown, non-member and revoked campaigns
  answer alike. Non-GET requests need `Origin` = `PUBLIC_ORIGIN`; the live stream and
  `/auth/session` accept `Sec-Fetch-Site: same-origin` instead. Security headers (CSP,
  `Referrer-Policy: no-referrer`, `nosniff`).
- **Limits.** Per-process, bounded, time-bucketed counters keyed on the client behind the trusted
  proxy (`LTW_TRUST_PROXY`, required in invitation mode; IPv6 per /64): redeem per client and per
  token prefix with lockout, a global budget for refused redeems, AI and image routes per actor
  with in-flight caps; fixed 429.
- **Browser.** The join page removes the token from the address bar and history before anything is
  requested and posts it only when the person takes their seat; a signed-in browser is asked
  first, keeping the sign-in being the default; any 401 shows "You are signed out" (live stream
  included), and so does a sign-in changed in another tab, which a tab finds by asking again on
  refusals and when it returns; sign-out asks first; the DM's "Players" sheet invites, lists and
  revokes, live. Development personas keep working for local development and tests and are refused
  in production, with `PUBLIC_ORIGIN`, or off a loopback host. No client address, header or cookie
  is logged.

## Validation (offline; no provider was called; `.env.local` was not read)

| Step                                                                  | Result                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Part A `pnpm validate` (own database `ltw_stage340`)                  | unit 2548, integration 193, E2E 59 — pass                                                                                                                                                                                                                          |
| Security fixes `pnpm validate`                                        | unit 2588, integration 194, E2E 59 — pass; 37 new regression tests fail on part A                                                                                                                                                                                  |
| Part B `pnpm validate`                                                | unit 2662 (252 files), integration 194, E2E 90 (80 existing + 10 sign-in) — pass; context budget 0 over target                                                                                                                                                     |
| Sign-in journeys (invitation-mode UI server on 4313 behind Vite 4312) | invite → join → act → revoke → signed out in ≈ 0.8 s; used/forged/malformed links one failure; 409 replace/keep; sign-out; keyboard; Russian; axe at three widths; no token in any request URL, body (except redeem), storage, script-readable cookie or IndexedDB |
| Part B review fixes `pnpm validate`                                   | unit 2696 (255 files), integration 194, E2E 92 (80 existing + 12 sign-in) — pass; context budget 0 over target                                                                                                                                                     |
| Part B review journeys                                                | a link opened and left sends nothing, stays usable; one redeem after "Take your seat"; three DM tabs signed out (shown again, refused, online) after another tab's replacement; keep first, replace after 0.5 s and a key; no token in timing entries or the heap  |
| Stage 350 deployment (Caddy, invitation mode)                         | Russian sign-in journeys 50/50 over HTTPS; revoked player's stream closed in 0.61 s                                                                                                                                                                                |

## Reviews

- **Part A security review** (seven findings, all fixed in `35eace8`): cross-site logout through
  `GET /auth/session`; limits keyed on the raw address (one client could lock out every link
  behind a proxy; IPv6 rotation and an unbounded sweep); DM sessions not revocable; redeem silently
  replacing a session; AI ranking not rate-limited; client addresses in logs; dev personas failing
  open without `NODE_ENV`. Checked sound: token entropy and hashing, single use under races,
  re-reading the session on every request, cookie flags, campaign binding, check order, triggers.
- **Part B review** (four findings, no high severity; all fixed in the commit after `646557a`,
  "Stage 340: fix part B review findings …"; see "Part B review fixes" in
  `docs/STAGE_340_DESIGN.md` and ADR 0036's part B amendment): the invitation was redeemed on page
  load (link scanners, history suggestions and login CSRF could spend it) — now only when the
  person presses "Take your seat"; a tab whose cookie changed in another tab kept showing the
  previous sign-in's world — a tab now asks `GET /auth/session` and its identity again on any 403
  or 404, a live refusal or `gone`/`forbidden` close, `online` and becoming visible, and shows
  "You are signed out" for any other sign-in; "keep my current sign-in" left the token reachable
  in memory — one-shot holders cleared on keep, replace, success and failure (no string of a heap
  snapshot holds it), and a finished join page gives way to a fresh start page, since the
  browser's navigation timing entry keeps the address with the token; the replace confirmation put
  the destructive choice first — keeping is first, primary and focused, replacing waits for 0.5 s
  of a visible, focused page and a pointer or key. On `6e0ae0f` the new tests fail (20 unit tests,
  and the two suites of the new modules; the four new or changed journeys), and a throwaway replay
  of the old join flow showed both DM tabs keeping the DM's world, the kept token in the page's
  heap, and replacing first and enabled at once. Checked sound: fragment removal before any
  request or render, no storage or console sinks, 401 handling everywhere, persona mode only on a
  404, the Players sheet's once-shown link, test seeds and journeys.

## Gate 06 surfaces (row 340; details in `docs/GATE_COVERAGE.md`)

`/auth/redeem`, `/auth/session`, `/auth/sign-out`, the DM's invitation and member routes, the
`ReleaseCharacter` command, the origin check and headers, the limits, the operator CLI, the join
page, the signed-out screen and the Players sheet.

## Limitations and residual risks

- Limits are per process (one server instance in the alpha). Six or more junk clients can use up
  the refused-redeem budget and keep redeem unavailable for a minute (fail closed; signed-in people
  unaffected).
- Browsers without fetch metadata (`Sec-Fetch-Site`; Safari < 16.4) cannot open the live stream or
  read `/auth/session` in invitation mode.
- A seat freed by a raw undo without revoking the session is noticed at the player's next refusal
  or the live stream's next cycle (`/auth/session` then answers 401), not by the undo itself.
- A tab finds a sign-in changed in another tab at its next refusal, when shown again or back
  online, or at the live stream's next cycle (the replaced session's stream closes as
  `unauthenticated`); an action sent from it in that moment is judged under the new sign-in.
- A refused or unanswered invitation's token stays in that failure page's navigation timing entry
  until the person goes back to the start or closes the page (a refused token no longer works; an
  unanswered one may).
- With `AUTH_MODE=disabled` a production build shows the persona form, where nothing can sign in.
- The operator's authorization source is printed by the CLI, not stored (a migration would be
  needed).
- Owner play acceptance pending.

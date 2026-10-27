# Gate 06 (Stage 355) red-team report — team auth

**Team:** auth (sign-in, sessions, request limits). **Revision:** 0cc8d8d (main after Stage 350).
**Stack:** `ltw-g06-auth`, `https://localhost:18443` (proxy 127.0.0.1:18443/:18080), images
`ltw-server/proxy:0cc8d8db2411` (reused, not rebuilt). Deployed via `deploy/scripts/deploy.sh`,
seeded via `review-campaign.sh`; Caddy internal CA exported for curl. Torn down `down -v`, `.env`
deleted, shared images kept. White-box read of source; all attacks through deployed HTTP/stream/
operator CLI. Evidence: `.../g06-evidence/auth/` (`summary-transcript.txt`, `xff-ratelimit.txt`,
`live-revocation.txt`, `caddy-ca.crt`).

## Findings
No Critical/High/Medium findings. One Low (defence-in-depth), by-design.

- **G06-auth-01 (Low, by-design):** The per-process "refused-or-undecided redeems" budget
  (`refusedRedeemsPerMinute=60`) holds every redeem — legitimate ones included — once 60 refusals
  occur in a minute, so a flood can block a real table's sign-ins. Reproduction/analysis: per
  client the limiter caps 10 redeem attempts/min and locks out after 20 failures/15 min; only an
  *admitted* attempt increments the global budget and 'locked' returns before incrementing, so one
  client contributes ≈20 refusals total then goes quiet — a single attacker cannot sustain 60/min
  (I confirmed per-client 10/min and that forged XFF cannot multiply identities; see below).
  Sustaining the budget needs ~45 distinct client groups, i.e. a distributed attack. Violated
  rule: none strictly — ADR 0036 scopes DDoS out and the alpha is a closed table; this is the
  documented availability/robustness tradeoff. Suggested fix (optional): when the global budget is
  saturated, still admit a redeem that presents a *syntactically valid, as-yet-unseen* token
  prefix, or give known-good clients a reserved slice, so a guessing flood cannot fully starve a
  first-time legitimate redeemer. Evidence: `xff-ratelimit.txt`, code `apps/server/src/auth/limits.ts`.

## Checked and sound
- **Dev-persona tokens in production:** `Bearer` token from `fixtures/ravenford/personas.json` on
  `/campaigns/ravenford/live` and `/auth/session` → 401; invitation mode ignores `Authorization`
  (config + composition refuse dev-personas under `NODE_ENV=production`).
- **CSRF / Origin on every non-GET + the two checked GETs:** `POST /auth/redeem`, `/sign-out`,
  invitations/members, and GET `/auth/session` + `/campaigns/:id/live`: foreign `Origin` → 403,
  missing `Origin` without `Sec-Fetch-Site: same-origin` → 403, correct → 200. Exact-match holds
  against trailing slash, suffix (`:18443.evil.com`), subdomain, `null`, and scheme-case. The 403
  never emits `Set-Cookie`. `SameSite=Strict` means cross-site requests carry no cookie at all, so
  un-checked GET reads also return 401 cross-site.
- **Cookie flags over HTTPS:** `ltw_session=…; Path=/api; HttpOnly; SameSite=Strict;
  Max-Age=1209600; Secure`.
- **Cookie clearing rules (ADR amendment):** `/auth/session` 401 clears only when exactly one
  `ltw_session` was presented; zero or two → no `Set-Cookie`. Only a successful redeem sets a cookie.
- **Invitation lifecycle:** replay of a used token → uniform fixed 401; used invite shows status
  `used` to the DM.
- **Racing one link:** 10 concurrent redeems → exactly one 200, nine 401; one seat, one active
  session (World-Engine idempotent assignment + single-use transaction).
- **409 replace flow:** a live-signed-in browser redeeming without `replaceSession:true` → 409,
  invitation unspent, no cookie change (the token is not even consulted; settled, not a failure).
- **Member/session revocation timing:** DM member-revoke returns `sessionsRevoked`, and the
  player's next request → 401 + cookie cleared; an already-open live stream closes on the next
  cycle with `closed{reason:"unauthenticated"}` (`live-revocation.txt`). Sign-out returns 204 and
  clears the cookie.
- **Forged X-Forwarded-For through Caddy:** `X-Forwarded-For: 198.51.100.77` did not change the
  rate-limit client identity (still 429); Caddy appends its observed peer and Fastify `proxy-addr`
  (trust `10.241.1.0/24`) stops at that untrusted hop, so a client cannot choose its limit key or
  lock out a victim IP (`xff-ratelimit.txt`).
- **Live subscription caps:** 4 concurrent streams per actor admitted; 5th/6th →
  `closed{reason:"overloaded"}` (perActor=4; 200/process and 64 KiB slow-consumer drop are
  code+unit-test confirmed).
- **Request size cap:** 2 MB JSON body to `/auth/redeem` → 400 (fail closed).
- **Clickjacking on the join page:** `GET /join` carries `X-Frame-Options: DENY` and CSP
  `frame-ancestors 'none'` (proxy + server); same on API responses.
- **Fragment / log leakage:** token rides the URL fragment (`/join#<token>`), never sent to the
  server; `Referrer-Policy: no-referrer` on all responses; server and proxy JSON logs grep 0 hits
  for the DM/player tokens and for `ltw_session=`.
- **Session fixation:** the server issues a fresh random session token on redeem and revokes any
  previously presented cookie in the same response; the client cannot fix a session value.
- **Enumeration:** outsider → 401 for real and non-existent campaigns alike; DM on a non-existent
  campaign → 404, identical to a non-DM on a real one; invalid-token redeems all refuse on the same
  early path (no engine work), so no timing oracle usable against a 256-bit token.
- **Operator CLI misuse:** `sessions` prints session/actor/role/times but no token or hash;
  `revoke-actor` without `--authorization-source` → usage error, exit 2; `dm-invite
  --expires-hours 999` → "must be 1-168"; unknown subcommand → usage, exit 2.
- **Plain HTTP:** `:18080` → 308 to HTTPS; Secure cookies never transit plaintext.

## Coverage (by surface)
HTTP `/auth/redeem|session|sign-out`, `/campaigns/:id/invitations(/:id/revoke)`,
`/members/:id/revoke`, `/campaigns/:id/live`, `/campaigns/:id/session`: origin/CSRF, cookie flags
& clearing, replay/used/revoked, racing, 409, size cap, enumeration, rate-limit identity + forged
XFF, per-actor live cap, live revocation. Operator CLI: `sessions`, `revoke-actor`, `dm-invite`
validation, token-safety. Proxy: frame-ancestors/XFO, HTTP→HTTPS, header exact-match, log scan.

## Limits (not tested, and why)
- **Cross-*real*-campaign** isolation (session of campaign A on campaign B) only tested against a
  non-existent campaign (uniform 404/400); only `ravenford` is seeded. The `actorFor` ELSEWHERE
  path is code-confirmed but not exercised against a second live campaign.
- **Live invitation expiry** not observed end-to-end (min issuable expiry is 1 h); status
  computation and the redeem `expired` branch are code-confirmed only.
- **True distributed** saturation of the global redeem budget (G06-auth-01) and process-wide
  200-stream cap were not driven to scale (would need many client groups); reasoned, not executed.
- **IPv6 /64 grouping** of the limiter not exercised (loopback IPv4 test host).
- No paid AI/image routes exercised (PAID constraint): per-actor expensive-slot limits unverified
  live (code-confirmed).

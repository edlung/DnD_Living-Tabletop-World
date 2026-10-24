# Stage 350 — Deployment (parts A and B, review fixes, the full product; verified locally)

- Date: 2026-10-16 (Europe/Oslo). Branch `stage-350-deploy`, rebased onto the complete product
  (`77e731a`: Stage 320's client, Stage 340's sign-in with its browser screens, Stage 330's
  images): design `6e84f71`, part A `c08823a`, part B `a51e9ac`, review fixes `a0da82a`, the full
  product (the commit adding the section "Full product"). On 2026-10-24 the branch was rebased
  onto `main` after Stage 330's merge (`0b4bdcf`, the same tree as Stage 330's final head), with
  no change to any file: design `77897e3`, part A `152b774`, part B `7837f7f`, review fixes
  `dfd9b26`, the full product `0d397c9` (tree `1640894a`, identical to the verified revision).
- Status: **PARTS A AND B IMPLEMENTED AND VERIFIED LOCALLY IN DOCKER; THE SEVEN REVIEW FINDINGS
  FIXED; THE COMPLETE PRODUCT (IMAGES, IMAGE SPENDING, THE BROWSER SCREENS) VERIFIED ON THE LOCAL
  DEPLOYMENT** (section "Full product"). Nothing was deployed to a server, announced, released, or
  pushed; nobody was invited; no paid AI or image call was made. Owner decision Q10: prepare the
  deployment and verify it locally; a server waits for the owner's access, domain and backup
  target (see "What remains for the owner").
- Work order: `work-orders/OPUS_STAGE_350.md`. Contract: `docs/STAGE_350_DESIGN.md` (adopted, part
  B and full product notes). Decisions: `docs/adr/0037-deployment.md` with its part A, part B,
  review-fix and full-product notes; ADR 0003 gains one amendment (the rollback step of the
  migrator).
- Revisions of part A before the rebase (local branch `backup/stage-350-part-a-117453b`):
  `3e90904` (the deployment, readiness, restore-drill CLI, spend counters, runbook, CI job),
  `4a17f1c` (a server-side trust-proxy setting, since removed, and the proxy contract check),
  `56ec5d8` (the server survives a database restart), `049db30` (a fixed proxy address, since
  reverted), `73ce95b` (final code: the trust-proxy setting left to Stage 340). Part B's working
  commits `8b362b1` and `7330636` (images of the evidence) are in `backup/stage-350-part-b-7330636`.

## What part A delivers

**`deploy/`** (map: `deploy/AGENTS.md`; operations: `deploy/RUNBOOK.md`, Russian and English):

- `Dockerfile`: targets `server` (Node 24.21.0, `pnpm install --frozen-lockfile`, build,
  production dependencies of the server only, user `node`, `NODE_ENV=production`, entrypoint
  `server/start.sh`: migrations under the migrator's advisory lock, then the server) and `proxy`
  (Caddy 2.10.2 with the built client, user `caddy`, the binary's file capability removed). Base
  images pinned by multi-platform digest. `scripts/build.sh <revision>` builds both from
  `git archive` of a committed revision and tags them with its 12-character commit.
- `compose.yaml`, one project: `proxy` (the only published ports, 80 and 443/tcp; HTTP/3 off),
  `server` (never published; `NODE_ENV=production`, `AUTH_MODE=invitations`, `PUBLIC_ORIGIN`
  required, `LTW_TRUST_PROXY` = the pinned `edge` network `10.231.250.0/24` — part B replaced this
  with the backend network), `postgres` 18 (named volume, internal `data` network only),
  `backup`, and `drill-db` (profile `drill`, tmpfs).
  Server, proxy and backup run non-root with read-only roots, no capabilities and
  `no-new-privileges`; health checks (`/readyz` for the server) gate the start order; logs use
  Docker's `local` driver, 5 x 100 MB per service. Secrets only from `deploy/.env` (git-ignored;
  `.env.example` lists the names).
- `proxy/Caddyfile`: `TLS_MODE=acme` (automatic certificates, HSTS) or `internal` (local);
  `/api/*` reverse-proxied without its prefix, `flush_interval -1`, never compressed; `Host`,
  `Origin`, `Sec-Fetch-*`, `Cookie`, `Authorization` forwarded unchanged and a client's
  `X-Forwarded-For` replaced; CSP (`frame-ancestors 'none'`, `base-uri 'none'`, `object-src
'none'`, `form-action 'self'`) added only where the server set none, `Referrer-Policy:
no-referrer`, `nosniff`, `X-Frame-Options: DENY`, COOP, `Permissions-Policy`; no `Server`/`Via`;
  the single-page client with immutable hashed bundles.
- `backup/backup.sh`: custom-format `pg_dump` every 6 h and on demand, checked readable before it
  counts; retention keeps everything younger than a day and the newest of 14 days and 8 ISO weeks;
  `SHA256SUMS`; `verify`, `latest`, `health` (stale dump = unhealthy service).
- `scripts/`: `deploy.sh [--rollback] <tag>` (backup first, previous tag recorded, wait for
  health), `backup-now.sh`, `restore-drill.sh`, `watch.sh` (disk > 80 %, memory > 85 %, service
  health, error lines and 5xx in 15 min, readiness through the proxy, certificate expiry; alarm
  log and optional webhook), `spend.sh`, `logs.sh`.
- `verify/` (local only): `smoke.sh`, `proxy-contract.sh`, `live-stream.sh`,
  `retention-check.sh`, `ci.sh` (the CI job), and the overrides `pre-340.yaml` (`AUTH_MODE`
  `disabled`, since this revision has no invitations mode) and `dev-personas.yaml` (public tokens,
  pinned to `localhost`, for the live stream check). Part B deletes both overrides.

**Server** (tests beside each):

- `GET /readyz` beside `/healthz` (`src/http/routes/readiness-routes.ts`,
  `src/platform/health/readiness.ts`, `src/world-engine/store-readiness.ts`): the database answers;
  no migration this build carries is pending (a database a newer build migrated passes: the
  rollback step accepted it); this build reads the event store (the newest event of every stream
  and its head; until it first succeeds, one stored event of every type and schema version). 200
  or 503 naming failed checks only; checks bounded (3 s) and shared; transitions logged; health
  requests log only warnings.
- Migrator: `migrate-cli --allow-newer-database`, only through `deploy.sh --rollback`, accepts
  history extending its files when every shared entry is identical, and applies nothing; drift
  stays refused (ADR 0003 amendment).
- Restore drill CLI (`src/world-engine/replay-digest-cli.ts`, `replay-digest.ts`,
  `state-digest.ts`): replays every campaign stream through the World Engine and prints SHA-256
  digests of a canonical encoding of the state; `compare` replays this database at a restored
  dump's versions; exit 1 on any difference, a missing or shorter stream, or integrity violations.
- `pnpm ai:operator spend` (read-only): effective spend per billing account (today, total, open
  holds) and per approval against its stage ceiling; startup logs keep counts only.
- `src/platform/db/pool.ts`: a connection the database closes no longer ends the process.

## Verification of part A (transcripts: `reports/evidence/stage-350/`, index `00-index.txt`)

On this machine (Docker Desktop, Engine 29.5.3, Compose v5.1.4; arm64), project `ltw-stage350`,
`PUBLIC_HOST=localhost`, `TLS_MODE=internal`, ports 80/443 bound to 127.0.0.1 (both were free):

- Builds from `git archive` of five revisions; images hold no sources, tests or `.env` files; the
  client files are byte-identical across rebuilds. First install, seeding through the World Engine
  (version 100, 25 entities) and four upgrades, each with the automatic backup first.
- `smoke.sh`: 39/39 on the final revision (TLS 1.3, TLS 1.1 refused, HTTP 308 to HTTPS, client
  and caching, headers, `/api/healthz` and `/api/readyz`, 401 without a credential, only the
  proxy publishes ports, read-only roots, non-root users). `proxy-contract.sh`: 10/10.
- Live stream through Caddy over HTTP/2 (development personas, local only): `ready` after
  0.25 s, `changed` 0.83 s after a DM command (the hub's 1 s cycle), heartbeat at 15.16 s, stream
  open, `text/event-stream`, `x-accel-buffering: no`, no compression.
- Database outages: 503 `{failed: [database, migrations, eventStore]}` during, 200 after, health
  following, no restart. History this build cannot read keeps `/readyz` at 503 (`eventStore`).
- Backups and the restore drill: a drill with the live world ahead matches at the dump's version;
  a real restore by the runbook brings the world back and the drill matches; the drill fails
  (exit 1) on a shorter live stream (`behind`), on a different world at the same version
  (`mismatch`) and on a damaged dump (checksum); the final drill in production mode passes.
  `retention-check.sh`: 21 of 480 dumps kept, manifest verifies.
- Rollback: `73ce95bad8a0` -> `049db3031faa` -> `73ce95bad8a0` on the same database; a database a
  newer build migrated (simulated history row) is refused by the strict start and accepted by
  `--rollback`, which applies nothing.
- `watch.sh` raised a real disk alarm on this machine (82 % > 80 %) and a forced service alarm
  delivered to a local webhook; `spend.sh` and `logs.sh` work.
- `deploy/verify/ci.sh` (the new CI job) passed end to end on a clean checkout and removed
  everything it created. Hosted CI has not run it (nothing is pushed).
- The stack, its volumes and networks are removed; the shared development database stayed up.
- `pnpm validate` on the final tree (own database `ltw_stage350` on the development server,
  shared lock): **passed** — format, lint, typecheck, context budget (811 files, none over 500
  lines), 2,507 unit tests (233 files), build, migrate and seed, 199 integration tests (37
  files), 59 browser journeys (`13-validate.txt`). After it only Markdown and the evidence
  index changed.

**Findings fixed during verification**: (1) PostgreSQL closing idle connections crashed the
server (unhandled pool `error`) — `56ec5d8`; (2) `build.sh` printed progress on stdout, which
`tag=$(build.sh …)` captured — fixed; (3) with a pinned proxy address, Docker Desktop's port
forwarding reset one published port after re-creation — the pin is gone in `73ce95b`; (4) on
Docker Desktop every client reaches Caddy through the network gateway (`10.231.250.1`), which is
inside the trusted range; on a Linux host clients keep their addresses. Part B moved the trust to
a backend network without a host address, so no gateway lies in the trusted range any more.

## What part B delivers (on Stage 340)

- **One production path.** `deploy/verify/pre-340.yaml` and `dev-personas.yaml` are gone;
  verification and `ci.sh` run `compose.yaml` alone, exactly as production (invitation sign-in).
- **Network trust boundary** (`deploy/compose.yaml`): `edge` (the proxy; published ports, ACME),
  `backend` (the proxy and the server only; internal; bridge gateway mode `isolated`, so the host
  has no address on it; Docker Engine 28+), `data` (server, database, backups; internal,
  isolated), `egress` (the server alone: outbound AI calls). The server listens only at its
  pinned backend address `<LTW_BACKEND_PREFIX>.10` (default `10.231.251.10`);
  `LTW_TRUST_PROXY` = `<prefix>.0/24`, where Caddy (from `.128/25`) is the only other member and
  replaces any `X-Forwarded-For` a client sends. `deploy/verify/trust-boundary.sh` checks it.
- **Deploy across network changes.** Compose 5.1 cannot move a running stack to changed networks
  (finding below); `deploy.sh` keeps a digest of the resolved networks (`LTW_NETWORKS_DIGEST`) and
  takes the stack down first (volumes kept) when it changes.
- **Review campaign** (`apps/server/src/world-engine/review-campaign.ts`, CLI
  `seed-review-campaign-cli.ts`, test beside it; operator step `deploy/scripts/review-campaign.sh`):
  the Russian Ravenford through the World Engine under the fixture's command IDs, then the DM's
  `ReleaseCharacter` for the seat the fixture gave the persona `player-elowen` (the party's history,
  whose memories need that seat, stays as written); every character waits for the DM's
  invitation; idempotent, never takes a seat back, refused on a database holding the English
  Ravenford. The script prints the operator's DM link once. The server reads the Russian quest
  book by default (`LTW_QUESTS_FILE`). Curated images are not in this branch (Stage 330).
- **Sign-in on the deployment** (`deploy/verify/sign-in-journey.sh`, helpers `verify/http.sh`):
  until Stage 340 part B's browser screens, two cookie jars drive the flows over HTTPS through
  the proxy (list in the Gate 06 rows below). `live-stream.sh` signs in by invitation (cookie and
  `Origin`; the journey uses `Sec-Fetch-Site: same-origin`) and checks the close on sign-out.
  Tokens and cookies never reach output, a command line or a log (bodies on stdin, redacted
  output, secrets matched from files; the journey greps every container log for them).
- **Runbook** (both languages): the trust boundary and IPv6 (publish only `A` until IPv6 is on
  `edge`), the review campaign, the operator's `sessions`, `revoke-dm`, `revoke-actor`, local
  verification with the redeem budget and the Docker Desktop limitation.

## Verification of part B (transcripts: `reports/evidence/stage-350/part-b/`, index `00-index.txt`)

Project `ltw-stage350b`, `https://localhost` (Caddy's local CA trusted per run), 127.0.0.1:80/443:

- First install as part A shipped (its deploy files and images `333a8791b1e8`), then the upgrade
  to part B `8b362b15ec68`: backup first, previous tag recorded, stack recreated on the new
  networks (after the finding below), volumes kept.
- `review-campaign.sh`: 92 commands accepted (version 101, 25 entities, open seat
  `elowen-starwhisper`); rerun: 92 already present; DM link redacted.
- `smoke.sh` 39/39 (and 39/39 again at the end); `proxy-contract.sh` 10/10.
- `trust-boundary.sh` 23/23: `backend` and `data` internal with no host address; members exactly
  proxy+server and server+postgres+backup; the API socket only on `10.231.251.10:3000`; from the
  host namespace the backend and data addresses time out and the egress address refuses; from
  `edge` the name `server` does not resolve and every address times out; forged
  `X-Forwarded-For` through the proxy: `401` ten times, then `429`; the same header from the
  proxy's own address: `401` (a new client). The server reaches the AI provider over `egress`
  (TCP handshake only).
- `sign-in-journey.sh` 50/50 (Russian DM and player; the player's stream closed 0.61 s after
  the revocation, the DM's 0.52 s after sign-out; no credential in 141 log lines).
- `live-stream.sh`: ready 0.11 s, `changed` 0.96 s after a command, heartbeat 15.16 s, `closed`
  0.99 s after sign-out; uncompressed, `x-accel-buffering: no`.
- Database outage: 503 `{database, migrations, eventStore}` during 20 s, 200 after, no restart.
- Backups: drill on a dump with the live world ahead (match at 101), a real restore by the runbook
  and its drill (match), negatives `behind`, `mismatch` and a damaged dump (checksum), final drill
  (match at 116). Rollback `8b362b15ec68` → `333a8791b1e8` → `8b362b15ec68` on the same database;
  a database a newer build migrated: refused strictly, accepted by `--rollback`.
- `watch.sh` ok (disk limit 90 % on this machine), `spend.sh`, `logs.sh`, operator `sessions`
  (none) and `revoke-dm` (2 unused DM links revoked, authorization source echoed).
- `ci.sh` end to end on the clean worktree (`73306363dc89`): 122/122 checks, drill, retention,
  live stream; everything it created removed.
- Teardown: no container, volume or network of the project left; the shared development
  database kept running.
- `pnpm validate` on the final tree (own database `ltw_stage350`, shared lock): **passed** —
  format, lint, typecheck, context budget (849 files, none over 500 lines), 2,627 unit tests (247
  files), build, migrate and seed, 207 integration tests (38 files), 59 browser journeys
  (`15-validate.txt`). After it only text under `reports/` changed.

**Findings fixed in part B**: (1) on upgrading from part A's networks, Compose recreated changed
networks but only restarted PostgreSQL, which rejoined without its service name (`ENOTFOUND
postgres`); with `--force-recreate` it tried to remove a network the running server still used.
`deploy.sh` now takes the stack down first when the networks changed. (2) Docker Desktop delivers
every published-port connection from the `edge` gateway (`172.28.0.1` here, observed in Caddy's
TCP table): locally all browsers are one client to the per-address limits (runbook section 11).

## Review fixes (2026-10-16)

A review of parts A and B found seven gaps. Every fix has a test or a verification check that
failed before it and passes now (transcripts `reports/evidence/stage-350/review-fixes/`, index
`00-index.txt`; decisions ADR 0037, "Review fixes"; runbook updated in Russian and English).

1. **Readiness after a rollback (medium).** The server reads `LTW_ALLOW_NEWER_SCHEMA` (`true` or
   `false`); with it, `/readyz`'s `eventStore` check parses every stored event (500 per query, key
   order) before it first reports ready, in one read shared by concurrent probes that goes on past
   a probe's bound, is retried after a failure and names the event it cannot read. The normal path
   is unchanged. `deploy.sh` refuses a tag that does not contain the running revision without
   `--rollback`. Proof: 4 new tests (readiness over a mid-stream event, paging, shared and retried
   reads) and the config test fail on b1618cb's sources; live, b1618cb in rollback mode reported
   ready over `rollback-probe#50`, which it cannot load, while dee48d337459 in rollback mode was not
   ready, naming that event, and the runbook's way out (restore `LTW_PREDEPLOY_DUMP`) made it ready.
2. **Restore drill on an empty dump (medium).** `replay-digest compare` requires `--dumped-at` and
   fails on an empty restore (unless `--allow-empty`), on a live stream created before the dump but
   missing from it, and on any difference (`failures`). A real restore is `scripts/restore.sh`:
   it keeps the current state as a protected dump and stops the backup service (with the proxy and
   the server) before the database is dropped. Proof: CLI and verdict tests fail on b1618cb's
   sources; live, b1618cb's drill passed the empty first dump; now it is refused, passes with
   `--allow-empty`, and a simulated empty dump taken after the campaign existed fails even with
   it; `restore.sh` restored a protected dump and its drill matched.
3. **Backup script mount (medium-low).** `deploy/backup/` is mounted read-only as a directory; the
   service's label `ltw.backup-script` carries the directory's digest, so a deploy recreates it when
   the script changed. Proof: live, with the single-file mount a replaced `backup.sh` vanished
   inside the container (Docker Desktop); now it is read at once and the next deploy recreated the
   service; smoke's two new checks failed on the b1618cb stack and pass.
4. **Pre-deploy backup (low-medium).** When the database exists, `deploy.sh` starts PostgreSQL and
   the backup service if needed and always takes a protected `ltw-predeploy-…` dump first,
   recorded as `LTW_PREDEPLOY_DUMP` (or `LTW_ROLLBACK_DUMP`); protected dumps (also
   `ltw-prerestore-…`) are outside the regular retention, the newest 5 of each kind kept
   (`BACKUP_KEEP_PROTECTED`). Proof: b1618cb's `deploy.sh` skipped the backup silently with the
   service stopped, this one took the dump; `retention-check.sh` fails with b1618cb's `backup.sh`
   and passes; the live directory kept the 5 newest of 9 pre-deploy dumps.
5. **Runbook cron and off-host copy (low-medium).** Cron jobs log to `/var/log/ltw` (created for
   the operator at first install, rotated weekly); the off-host copy runs from root's crontab;
   `watch.sh` alarms when the last restore drill failed, is older than 8 days or never ran
   (`deploy/restore-drill.log`). Proof: `watch-check.sh`'s three drill alarms are missing with
   b1618cb's `watch.sh` and present now. The runbook text itself was not executed here.
6. **Secrets (low).** `watch.sh` hands the webhook URL to `curl` as a config on standard input;
   the server's environment is an explicit list in `compose.yaml` (no `env_file`). Proof:
   `watch-check.sh` (the URL in curl's arguments before, only on its input now); smoke (the server
   held `POSTGRES_PASSWORD`, `ALARM_WEBHOOK_URL`, the backup and host settings before; none now).
7. **Docker Engine 28 (low).** `deploy.sh`, `ci.sh` and `restore.sh` refuse an older Engine;
   `deploy.sh` creates the containers first and checks with `docker network inspect` that
   `backend` and `data` are internal, isolated and without a gateway before anything starts;
   runbook section 1. Proof: `preflight-check.sh` (a stub Engine 27, a throwaway network with a
   host address) fails on b1618cb's scripts and passes.

**Found during this verification and fixed:** the drill took the throwaway database's password
from the server's environment, which only `env_file` had put there (it now derives the URL from
the server's own `DATABASE_URL` inside the container); an anonymous volume (the PostgreSQL image's
`VOLUME`) outlived every stack (the backup service now has a tmpfs there).

**Verification** (Docker Desktop, Engine 29.5.3, Compose v5.1.4; project `ltw-fix350`,
127.0.0.1:18080/18443): first install of b1618cb with its own files and the "before" runs, upgrade
to dee48d337459, `smoke.sh` 42/42, `trust-boundary.sh` 23/23, `preflight-check.sh` 6/6,
`watch-check.sh` 7/7, retention, drills, a real restore, rollback round trips and the readiness
scenario; then `ci.sh` on this worktree: 137/137 checks plus drills and the live stream, nothing
left behind. `pnpm validate` on the final tree (own database `ltw_stage350`, shared lock): **passed** —
format, lint, typecheck, context budget (853 files, none over 500 lines), 2,634 unit tests (248
files), build, migrate and seed, 210 integration tests (38 files), 59 browser journeys
(`review-fixes/10-validate.txt`). After it only text under `reports/` changed.

**Risks and limits of the fixes:** the full read after a rollback grows with the history (measured
only at Ravenford's size, about 200 events; a very long history keeps the server not ready for
longer, and `deploy.sh` waits 300 s); the protection rests on `--rollback`, which `deploy.sh` now
demands when both revisions are in the checkout (otherwise it only warns); revisions before these
fixes have no `restore.sh` or protected dumps (runbook section 3); a newer build's loosened
schema was simulated in the database, not built; `--dumped-at` is the dump name's second, before
`pg_dump`'s snapshot, so a campaign whose first command was still committing at that second would
be reported missing (milliseconds; not seen).

## Full product (2026-10-16)

With Stages 320, 340 and 330 underneath, the deployment runs the complete product as production
runs it (transcripts `reports/evidence/stage-350/full-product/`, index `00-index.txt`; decisions ADR
0037, "Full product notes"; runbook updated in Russian and English).

**What it adds**

1. **Image spending in the spend report.** `ai:operator spend` and `deploy/scripts/spend.sh` add
   `images`, from the Stage 330 ledger in the same READ COMMITTED transaction as the AI counters:
   the ceiling (null: none stored, no call), spent (settled charges as settled, open reservations
   whole), held, remaining (never below zero), the counts, and every unsettled reservation with its
   campaign, model, amount and age, and when it becomes settleable (15 minutes)
   (`spend-report.ts`; `readImageBudgetStatus`, `readOpenImageReservations`). Test:
   `spend-report.integration.test.ts` (no ceiling; settled, unsent, orphaned and running
   reservations; a lower ceiling; a ceiling of 0 and the operator's settlement); it fails on
   `a0da82a`'s report.
2. **The curated pictures in the review campaign.** The seeder imports the curated set after the
   world (`review-campaign.ts`, `seed-review-campaign-cli.ts`): the DM's requests and approvals,
   the `curated` generator over the committed files, idempotent: 51 pictures from 45 files. A
   campaign an earlier image seeded gets them by running `review-campaign.sh` again, with the
   server running (its worker leaves those requests alone). Test beside it (fails on `a0da82a`).
3. **The image generator in compose.** `LTW_IMAGE_GENERATOR` (default `placeholder`) and
   `LTW_IMAGE_MODEL` now reach the server (before, `openrouter-openai` could not be chosen on the
   deployment); `.env.example` and `smoke.sh` know them. Runbook section 8: enable (the ceiling by
   `image-budget-set` first, then the key and the generator), stop (the placeholder generator and
   an empty key at once; a ceiling of 0 as the record; the former "empty the key" alone would
   keep a server configured for `openrouter-openai` from starting), orphaned reservations, dumps
   now about 15 MB larger. Never enabled here.
4. **Pictures through Caddy** (`deploy/verify/images.sh`, ADR 0037 "Caching of picture bytes"):
   content-addressed but authorized bytes keep the server's `no-store`, `Vary: Cookie`, `nosniff`
   and sandbox policy (ADR 0022 §6, ADR 0026 §6); the proxy neither caches nor compresses `/api`.
5. **Browser journeys against the deployment** (`playwright.deploy.config.ts`, `tests/deploy/`,
   `deploy/verify/browser-journey.sh`; not in `pnpm test:e2e`): Russian browsers through Caddy
   over HTTPS; Chromium trusts Caddy's local CA for the run alone (`openssl` verifies the
   intermediate and the served chain against the root; Chromium accepts chains with that
   intermediate's key; nothing enters a trust store, no `ignoreHTTPSErrors`); the operator's DM
   link from `auth:operator dm-invite` in the server container. No trace, screenshot or video;
   yes/no assertions about tokens; the output directory removed.
6. **Found and fixed: an eval probe under the policy.** zod, which `@ltw/contracts` brings into
   the client, probes `Function('')` when it builds its first object schema; the page's policy
   allows no eval, so every page load reported a `script-src` violation (caught by zod, logged by
   the browser). The client makes zod jitless before any schema is built
   (`apps/web/src/schema-config.ts`, the first import of `main.tsx`; `zod` 4.6.5 is now a direct
   dependency of `@ltw/web`, three lockfile lines). The browser journey fails on any violation.
7. **CI and the scripts.** `ci.sh` runs the image checks and the browser journey after the smoke
   checks and waits until their four redeems left the window before the HTTP journeys (found when
   this machine's fast run met 429); `LTW_CI_BROWSER=skip` leaves the browser out and says so. The
   deploy job installs the dependencies and Chromium, limit 40 minutes; the main job's limit is 45
   minutes, as on Stage 340's branch. `sign-in-journey.sh` and both new checks free Elowen's seat
   when an earlier run left it taken; the session check accepts other live sessions.

**Verification** (Docker Desktop, Engine 29.5.3, Compose v5.1.4; project `ltw-stage350f`,
127.0.0.1:28080/28443; images `a0da82a7648c` and `fb35fa6f7bbc`, the CI run `6ee2fdaf123d`, whose
images hold the same files):

- First install of `a0da82a` with its own deploy files; its review campaign (92 commands, version
  101, no pictures); the upgrade to `fb35fa6` (protected dump first, `placeholder` reaches the
  server); `review-campaign.sh` again with the server running: 51 pictures imported, version 305,
  then idempotent; the server's worker took none of them.
- `smoke.sh` 42/42 (after the upgrade and at the end); `images.sh` 23/23: 32 pictures Elowen sees
  served with the headers above and bytes matching their hashes, the other 13 and an unapproved
  candidate a 404 like an unknown hash, the DM's candidate sandboxed; the page's `img-src 'self'
blob:`; sharp 0.34.4 and the style references load in the image offline; nothing spent.
- The browser journey, twice: on the fresh campaign and after the HTTP journeys left Elowen at the
  caravan site (she walks back): the market square's curated picture and two standing curated
  figures, one action, «Вы вышли» 0.93 s and 0.91 s after the revocation began with no request
  of the player's own, no policy violation, no token outside the redeem or in the logs.
- `spend.sh` before (no image section) and after; `sign-in-journey.sh` 50/50 (the player's stream
  closed 0.48 s after the revocation); `live-stream.sh` (ready 0.10 s, changed 1.01 s, heartbeat
  15.11 s, closed 1.04 s); `proxy-contract.sh` 10/10; a 20 s database outage (503 naming database,
  migrations and event store, 200 four seconds after, no restart).
- Backups: the drill refuses the first, empty dump (exit 1) and passes it with `--allow-empty`; a
  fresh dump with the pictures (46 contents, 12 MB) matches at version 315; a real restore of it
  by `restore.sh` brings the pictures and the world back and its drill matches.
- Rollback `fb35fa6f7bbc` → `a0da82a7648c` (its deploy files; every stored event parsed before
  ready; 330 events, 46 pictures) → `fb35fa6f7bbc`. `watch.sh` ok, `logs.sh`, the operator's
  sessions (none left), `retention-check.sh`, `watch-check.sh` 7/7, `preflight-check.sh` 6/6,
  `trust-boundary.sh` 23/23; teardown left nothing; the shared development database kept running.
- `ci.sh` on this clean worktree: the first run failed (the redeem window, fixed); the second
  passed end to end in 2 min 24 s: 160 checks, the browser journey, the drills, retention, the live
  stream; everything it created removed.
- `pnpm validate` (own database `ltw_stage350`, migrations 0001–0012, shared lock): **passed** —
  format, lint, typecheck, context budget (1042 files, none over 500 lines), 2,879 unit tests (284
  files), build, migrate and seed, 229 integration tests (41 files), 118 browser journeys. After it
  one runbook line, `deploy/verify/ci.sh`, the CI comment and Markdown under `docs/` and
  `reports/` changed; format and context budget pass on the final tree.

**Findings fixed during this work** (`19-development-findings.txt`, `17-ci-script.txt`): the
client's eval probe (above); in the new checks: a DM's request ID is kept under the actor, the DM
reads a candidate in the DM perspective, a `blob:` URL cannot be fetched under `connect-src
'self'` (the journey reads the Blob instead), a run that stopped half-way leaves Elowen's seat
taken, a full table shows no character choice, Playwright returns no body for these answers, and
the redeem window in `ci.sh`.

## For Gate 06 (alpha rows 350 of `docs/GATE_COVERAGE.md`)

Rows: 350 (proxy), (trust boundary), (sign-in on the deployment), (headers), (readiness),
(backup/restore). New surfaces in part A: the proxy and topology, its headers, `/readyz`, backups
and the restore drill, the read-only `ai:operator spend`; in part B: the backend trust boundary,
the review campaign seeder (World Engine commands only), the sign-in journeys through the proxy.
Changed reviewed boundary: the migrator's explicit rollback step (ADR 0003 amendment, part A).
No canonical state, projection, mutation path or authorization rule changed in either part. The
full product adds row 350 (images on the deployment) and the browser journeys to row 350 (sign-in
on the deployment); new or changed surfaces: the image section of the operator's spend report, the
review campaign's curated import (DM commands through the World Engine), `LTW_IMAGE_GENERATOR`
and `LTW_IMAGE_MODEL` in compose, and the client's jitless zod. No route, projection, rule or
authorization changed.

## What remains for the owner

- **A server**: a VPS (Ubuntu 24.04, 2 vCPU, 4 GB, 40 GB) with SSH access and Docker Engine 28 or
  later (29 recommended; the isolated gateway mode needs 28), then runbook section 1.
- **A domain and DNS**: an `A` record for it (no `AAAA` until IPv6 is enabled on `edge`).
- **ACME**: `TLS_MODE=acme` with the real domain; issuance, renewal, HSTS and `watch.sh`'s
  certificate check have run only in their local form (`tls internal`).
- **Off-host backups**: a target (and encryption key) for the runbook's `rclone`/`restic` step
  (section 10); the dumps hold every campaign secret and, with the pictures, about 15 MB more each.
- **Paid AI and images, each with its ceiling**, only when the owner authorizes them: the AI
  billing account and approval (ADR 0032) with the keys and routes, and for pictures in play the
  image ceiling by `ai:operator image-budget-set` before `LTW_IMAGE_GENERATOR=openrouter-openai`
  with `OPENROUTER_API_KEY` (runbook sections 7 and 8; `spend.sh` shows both). Until then
  everything stays local and nothing is spent.
- **Hosted CI** on the pushed branch: both jobs passed only locally here (`ci.sh` and `pnpm
validate`); the hosted runner's Docker Engine must be 28 or later.
- **Then**: the review campaign by `review-campaign.sh` on the server (it brings the curated
  pictures), the DM link handed over privately; the DM invites the players from the Players sheet.

## Risks and limits

- Only the local `tls internal` path ran; ACME, HSTS and a public DNS name are untested until a
  server exists. amd64 images were not built locally (the CI job builds them).
- Locally every browser is one client to the per-address limits (Docker Desktop); on Linux,
  outside IPv4 clients keep their addresses (Docker's documented NAT; not observable here).
- The browser journey is one Russian path (join, invite, play once, revoke, sign out) in Chromium;
  the screens' other cases are Stage 340's journeys on the development servers. Its local CA
  trust is Chromium's SPKI exception for Caddy's intermediate (valid 7 days, renewed by Caddy):
  a run spanning a renewal would fail and is rerun.
- Picture bytes are `no-store` by design (ADR 0022 §6): a reload fetches them again; with many
  players or larger pictures this costs bandwidth (revisit only by ADR).
- The OpenRouter generator never ran on the deployment (only its start, offline); its one live
  smoke was Stage 330's, on a development server.
- Backups stay on the same host until the owner names an off-host target (runbook section 10).
- Rollback is safe only across additive migrations and when no event type unknown to the earlier
  image was written; a rollback across a network change needs `dc down` first (runbook
  section 3).
- Single instance: in-memory limits and the live hub assume one server process (ADR 0037).
- HTTP redirect responses on port 80 still carry `Server: Caddy` (Caddy's automatic redirect).

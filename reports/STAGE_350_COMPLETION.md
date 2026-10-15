# Stage 350 — Deployment (draft: part A done, part B pending)

- Date: 2026-10-16 (Europe/Oslo). Branch `stage-350-deploy`, on the Stage 340 design commit; it
  will be rebased onto Stage 340's server work (`a7a0437`) before part B.
- Status: **PART A IMPLEMENTED AND VERIFIED LOCALLY IN DOCKER; PART B PENDING.** Nothing was
  deployed to a server, announced, released, or pushed. Owner decision Q10: prepare the deployment
  and verify it locally; a server waits for the owner's access, domain and backup target.
- Work order: `work-orders/OPUS_STAGE_350.md`. Contract: `docs/STAGE_350_DESIGN.md` (adopted).
  Decisions: `docs/adr/0037-deployment.md` with its 2026-10-16 part A implementation notes; ADR
  0003 gains one amendment (the rollback step of the migrator).
- Revisions of part A: `3e90904` (the deployment, readiness, restore-drill CLI, spend counters,
  runbook, CI job), `4a17f1c` (a server-side trust-proxy setting, since removed, and the proxy
  contract check), `56ec5d8` (the server survives a database restart), `049db30` (a fixed proxy
  address, since reverted), `73ce95b` (final code: the trust-proxy setting left to Stage 340,
  compose passes the proxy network), then the commit adding this report and the transcripts.

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
  required, `LTW_TRUST_PROXY` = the pinned `edge` network `10.231.250.0/24`), `postgres` 18
  (named volume, internal `data` network only), `backup`, and `drill-db` (profile `drill`, tmpfs).
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

## Verification (exact transcripts: `reports/evidence/stage-350/`, index `00-index.txt`)

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
inside the trusted range; on a Linux host clients keep their addresses.

## For Gate 06 (alpha rows 350 of `docs/GATE_COVERAGE.md`)

New surfaces: the proxy and topology, its headers, `/readyz`, backups and the restore drill, the
read-only `ai:operator spend`. Changed reviewed boundary: the migrator's explicit rollback step
(ADR 0003 amendment). No canonical state, projection, mutation path or authorization rule
changed.

## Part B (after Stage 340 is merged) must

- Rebase onto Stage 340 (expect small conflicts in `apps/server/src/http/app.ts` and `main.ts`);
  delete `deploy/verify/pre-340.yaml` and `dev-personas.yaml`; let `ci.sh` run invitations mode.
- Confirm Stage 340's server accepts compose's `LTW_TRUST_PROXY=10.231.250.0/24` and refuses to
  start without it; re-run `proxy-contract.sh` and the client-address check.
- Turn `live-stream.sh` to an invitation session (cookie plus `Origin` or
  `Sec-Fetch-Site: same-origin`), seed the Russian review campaign (the seed CLI seeds the
  English Ravenford only), issue the DM invitation with `auth:operator dm-invite`, and run the
  Russian Player and DM smoke journeys with Playwright against `https://localhost`.
- Repeat the full local run on the rebased revision; then hosted CI on it.

## Risks and limits

- Only the local `tls internal` path ran; ACME issuance, HSTS and a public DNS name are untested
  until a server exists. amd64 images were not built locally (the CI job will build them).
- Backups stay on the same host until the owner names an off-host target (runbook section 10).
- Rollback is safe only across additive migrations and when no event type unknown to the earlier
  image was written; otherwise `/readyz` stays 503 and the runbook says to restore.
- Single instance: in-memory limits and the live hub assume one server process (ADR 0037).
- HTTP redirect responses on port 80 still carry `Server: Caddy` (Caddy's automatic redirect).

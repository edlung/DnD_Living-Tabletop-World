# Stage 350 design — reproducible, recoverable deployment (adopted)

Date: 2026-10-15. Status: ADOPTED by the session under the owner's delegation
(`reviews/OWNER_DECISIONS_9_2026-10-15.json`); Q10 decided: prepare the deployment and verify it
locally in Docker; deploying to a server waits for the owner's access and domain. Scope:
`work-orders/OPUS_STAGE_350.md`. Decision record: `docs/adr/0037-deployment.md`. Parts: A — the deployment and its local verification
(health, TLS, backups, restore drill, rollback); B — sign-in smoke journeys on the local deployment once Stage 340 is merged.

## Shape

`deploy/` holds everything; one Compose project, built from a tagged revision:

- `server` image: multi-stage Node 24 build (`pnpm install --frozen-lockfile`, `pnpm build`,
  production dependencies only, non-root user, read-only root filesystem, `NODE_ENV=production`,
  `AUTH_MODE=invitations`). Runs migrations at start (`db:migrate`, idempotent, advisory-locked)
  and then the server. Listens only on the internal network.
- `proxy`: Caddy 2 serving the built client (`apps/web/dist`) and reverse-proxying `/api` to the
  server, with automatic TLS for `${PUBLIC_HOST}` (ACME in production; `tls internal` for local
  verification). Sets CSP, HSTS (production only), `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options`, `frame-ancestors 'none'`; streams `/api/campaigns/*/live` without
  buffering; the only published ports are 80/443.
- `postgres`: PostgreSQL 18 with a named volume, no published port, credentials from env.
- `backup`: a small job (same Postgres image) that runs `pg_dump --format=custom` every 6 h and on
  demand into `${BACKUP_DIR}` (bind mount), keeps 14 daily and 8 weekly dumps, and writes a SHA-256
  manifest. Off-host copy (the owner's backup location) is a documented `rclone`/`rsync` step,
  pending Q10's backup target.
- Secrets only from `deploy/.env` (never committed; `deploy/.env.example` lists names):
  `POSTGRES_PASSWORD`, `PUBLIC_HOST`, `PUBLIC_ORIGIN`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
  `LTW_AI_ROUTES`, `LTW_AI_APPROVAL_ID`, image settings.

## Operations

- **Health**: `/healthz` (process) and new `/readyz` (database reachable, migrations current,
  event store readable); Compose healthchecks use them; the proxy waits for readiness.
- **Logs**: JSON logs to stdout, Docker `local` driver with rotation (100 MB × 5 per service);
  `deploy/scripts/logs.sh`. No secret in logs (tested in Stage 340).
- **Errors and alarms**: `deploy/scripts/watch.sh` (cron or systemd timer on the host) checks disk
  (>80 %), memory (>85 %), container health and error-rate in the last 15 min, and writes alarm
  lines to a log and optionally to a webhook (`ALARM_WEBHOOK_URL`, unset by default).
- **Spending counters**: operator-only `pnpm ai:operator status` (holds, stops, settled totals) and
  image job spend (Stage 330) inside the server container; `deploy/scripts/spend.sh` prints both.
- **Restore drill** (`deploy/scripts/restore-drill.sh`): takes the latest dump, restores it into a
  fresh throwaway database, replays every campaign stream through the World Engine and compares the
  replayed state digest with the live database's digest for the same stream version; exits non-zero
  on any difference. The event store is canonical; other tables are restored as data.
- **Runbook** `deploy/RUNBOOK.md` (Russian and English): first install, deploy a tag, roll back to
  the previous tag (images are tagged by git revision; migrations are forward-only and additive, so
  rollback = previous image on the same database), rotate keys, restore from backup, revoke a user
  (Stage 340), stop all AI spending at once (`ai:operator account-revise --disable`), stop image
  spending, read logs and alarms.
- **Review campaign** for Gate 06: a seeded Russian Ravenford campaign with a DM invitation printed
  by the operator CLI and test player invitations, documented in the Gate 06 handoff.

## Local verification (this stage's evidence)

On the development machine with Docker: build the images from the tagged revision, start the
stack with `PUBLIC_HOST=localhost` and `tls internal`, run the Russian Player and DM smoke
journeys (Playwright against `https://localhost`, trusting Caddy's local CA for the run), run the
restore drill, roll back to the previous image and forward again, and run `pnpm validate` on the
same revision; hosted CI is green on it. Nothing is announced, nobody is invited, nothing released.
Deploying to the owner's VPS is a separate step once access and domain exist (runbook "first
install").

## Part B notes (2026-10-16)

Implemented on Stage 340's server; details in ADR 0037, "Part B implementation notes".

- The browser screens for invitations come with Stage 340 part B, so the Russian sign-in smoke
  journeys run over HTTPS through the real proxy with cookie jars
  (`deploy/verify/sign-in-journey.sh`); the Playwright journeys against `https://localhost` follow
  once those screens exist.
- The server's network trust boundary: an internal `backend` network shared with the proxy alone,
  without a host address; `LTW_TRUST_PROXY` is its range (`deploy/verify/trust-boundary.sh`).
- The review campaign: `deploy/scripts/review-campaign.sh` seeds the Russian Ravenford with every
  seat open and prints the DM's link once; the DM issues the players' invitations.

## Review fixes (2026-10-16)

A review of parts A and B found seven gaps (readiness after a rollback, a drill passing an empty
dump, the backup script's single-file mount, unprotected pre-deploy dumps, the runbook's cron and
off-host steps, secrets in `curl`'s arguments and the server's environment, the Docker Engine
requirement). The fixes keep this design; details in ADR 0037, "Review fixes", and the runbook.

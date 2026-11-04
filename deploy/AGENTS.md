# Deployment (`deploy/`)

Stage 350 (ADR 0037; contract `docs/STAGE_350_DESIGN.md`): one Compose project behind Caddy, built
from a committed revision, verified locally in Docker. Operations for people: `RUNBOOK.md`
(Russian and English). A security boundary for Gate 06 (alpha row 350 of `docs/GATE_COVERAGE.md`).

| File                                    | Role                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml`                          | `proxy` (the only published ports, 80/443), `server` (never published; listens only on `backend`), `postgres` (named volume), `backup`, `drill-db` (profile `drill`); networks `edge`, `backend`, `data`, `egress`                                                                                                                                                                                          |
| `Dockerfile`, `Dockerfile.dockerignore` | Targets `server` (non-root, read-only root, migrations then server) and `proxy` (Caddy, non-root, the built client); base images pinned by digest                                                                                                                                                                                                                                                           |
| `server/start.sh`                       | Container start: `migrate-cli.js` (`--allow-newer-database` only when `LTW_ALLOW_NEWER_SCHEMA=true`), then `main.js`                                                                                                                                                                                                                                                                                        |
| `proxy/Caddyfile`                       | TLS (`TLS_MODE=acme` or `internal`), security headers, `/api` reverse proxy with `flush_interval -1`, the single-page client, an internal health listener                                                                                                                                                                                                                                                   |
| `backup/backup.sh`                      | The backup service (the directory is mounted, read-only): custom-format dumps every 6 h and on demand, retention (all < 24 h, newest of 14 days and 8 ISO weeks), protected `pre-deploy` and `pre-restore` dumps (newest `BACKUP_KEEP_PROTECTED` of each), `SHA256SUMS`, `verify`, `health`                                                                                                                 |
| `.env.example`                          | Names of every setting; `deploy/.env` holds the values (git-ignored, mode 600); each service receives only what `compose.yaml` names for it                                                                                                                                                                                                                                                                 |
| `scripts/`                              | `build.sh` (images from `git archive`), `deploy.sh` (Engine 28+, rollback guard, protected dump, switch tag, networks checked, wait healthy; `--rollback`; `down` first when the networks changed), `restore.sh` (a real restore), `review-campaign.sh`, `campaign-move.sh` (a campaign's move between servers, ADR 0061), `backup-now.sh`, `restore-drill.sh`, `watch.sh`, `spend.sh`, `logs.sh`, `lib.sh` |
| `verify/`                               | Local verification (`TLS_MODE=internal`): `smoke.sh`, `proxy-contract.sh`, `images.sh`, `browser-journey.sh` (Playwright, `playwright.deploy.config.ts`, `tests/deploy/`), `sign-in-journey.sh`, `live-stream.sh`, `trust-boundary.sh` and `preflight-check.sh` (also safe on a server), `watch-check.sh`, `retention-check.sh`, `ci.sh`; `http.sh` (sourced: HTTPS as a browser, cookie jars, redaction)   |

- Secrets come only from `deploy/.env`; never print it, never commit it, never pass a secret as a
  command-line argument (scripts expand secrets inside the containers or pass them on standard
  input, as `watch.sh` does the webhook URL). Evidence shows names, never values.
- No `env_file`: each service names the settings it receives. The server gets only what
  `apps/server/src/platform/config/config.ts` reads (a new setting is added to `server.environment`
  and to `SERVER_SETTINGS` in `verify/smoke.sh`); the host's settings, `POSTGRES_PASSWORD` (apart
  from its `DATABASE_URL`) and `ALARM_WEBHOOK_URL` never reach it.
- Images are local and tagged by the 12-character commit (`pull_policy: never`); build them with
  `scripts/build.sh` from a committed revision only, so the same revision builds the same files.
- Compose fixes `NODE_ENV=production`, `AUTH_MODE=invitations`, the listen address and the
  database URL over anything in `deploy/.env`. The server is reachable only through the proxy;
  PostgreSQL and the backups only on the internal `data` network. Keep it that way.
- Migrations stay forward-only and additive (ADR 0003): a rollback runs the earlier image on the
  same database through `deploy.sh --rollback` (the migrator then accepts a database a newer build
  migrated, and `/readyz` parses every stored event before it reports ready). `deploy.sh` refuses
  a tag without the running revision unless `--rollback` is given. Anything else needs a restore:
  `scripts/restore.sh`, which stops the backup service before the database is dropped.
- Every deploy and rollback takes a protected dump first (`backup.sh pre-deploy`, recorded as
  `LTW_PREDEPLOY_DUMP` or `LTW_ROLLBACK_DUMP`); never let a deploy go on without one. The restore
  drill fails on an empty restore unless `--allow-empty`, and on a live campaign the dump lacks;
  `watch.sh` alarms on its verdicts (`restore-drill.log`).
- Campaign workshop exception (Stages400/420): after genuine workshop text/image
  accounting or draft manifests exist, keep an0018/0019/0020-aware recovery build.
  Older app/operator binaries do not understand those subjects or atomic manifest
  obligations; event-readiness alone cannot prove compatibility. See RUNBOOK§3.
- Confirmed activation (Stage440): keep an0022-aware app/operator/replay build once
  activation rows exist, including before the bootstrap append. Older engines lack
  the publication gate. New prepared-party/adoption/bootstrap events also require
  compatible event schemas; `--rollback` does not make an older build compatible.
  Recovery preserves activation/content/bytes/events together and resumes the same
  stable command; never publish by editing SQL status. See RUNBOOK§3/§5.
- Gate 07 (2026-10-31): after migrations 0023/0024 keep a Gate 07-aware build for recovery: an
  older one cannot read draft revisions saved with quest identities and checks no picture grant.
  Workshop pictures need `ai:operator picture-grant` per owner (RUNBOOK §8).
- Docker Engine 28 or later: `backend` and `data` use the gateway mode `isolated`; `deploy.sh`
  checks the Engine and, before anything starts, the networks (`lib.sh`).
- The live stream must never be buffered or compressed by the proxy (ADR 0033): `/api` has no
  `encode`, and `flush_interval -1`. `verify/live-stream.sh` proves it.
- The proxy forwards `Host`, `Origin`, `Sec-Fetch-*`, `Cookie` and `Authorization` unchanged (the
  origin check and sign-in of ADR 0036 need them), replaces any `X-Forwarded-For` a client sends,
  keeps a `Content-Security-Policy` the server set (asset content is stricter) and adds its own
  elsewhere (`verify/proxy-contract.sh`).
- One production path: `compose.yaml` alone, `NODE_ENV=production`, `AUTH_MODE=invitations`;
  verification runs exactly that stack (no overrides, no development personas).
- The trust boundary (`verify/trust-boundary.sh`): the server joins `backend` (internal, gateway
  mode `isolated`, so no host address; the proxy is its only other member), `data` (internal,
  isolated) and `egress` (its outbound calls only), and listens only at `<LTW_BACKEND_PREFIX>.10`.
  `LTW_TRUST_PROXY` is the backend range: only the proxy can name a client address, and Caddy
  replaces any `X-Forwarded-For` a client sends. Never add a service to `backend`, never publish
  the server's port, never make it listen on `0.0.0.0`.
- Invitation tokens, links and session cookies never reach output, a command line or a log:
  scripts pass request bodies on stdin, print `redact`ed text and match secrets from files
  (`verify/http.sh`); `sign-in-journey.sh` checks every container log for the credentials it saw.
- `scripts/review-campaign.sh` prints a real DM link: its raw output is for the operator alone;
  `verify/sign-in-journey.sh` runs it and prints it redacted, and `verify/ci.sh` seeds without it.
  The seed brings the curated pictures (the committed set through the `curated` generator, no
  provider; the server's worker leaves those requests alone), idempotently.
- Images (ADR 0035): compose runs the placeholder generator unless the operator sets
  `LTW_IMAGE_GENERATOR=openrouter-openai` with `OPENROUTER_API_KEY`; spending needs a ceiling the
  operator stores (`ai:operator image-budget-set`), never a setting. Verification never enables it
  and makes no paid call. Picture bytes are authorized content: the proxy keeps the server's
  `no-store`, `nosniff` and sandbox policy (`verify/images.sh`); never cache `/api` in Caddy.
- `scripts/spend.sh` prints `status` and `spend`: the AI providers' counters and the image
  ledger's (ceiling, spent, held, remaining, unsettled reservations), operator-only.
- The browser journeys (`verify/browser-journey.sh`) trust Caddy's local CA for one run only: the
  intermediate's SPKI for Chromium, after `openssl` verified it; nothing enters a trust store.
  They keep no trace, screenshot or video, assert about tokens yes/no only, and their output
  directory is removed. They need `pnpm install` and Playwright's Chromium (the CI job installs
  both; `LTW_CI_BROWSER=skip` leaves them out of `ci.sh`, and says so).
- The page's policy allows no eval: the client makes zod jitless before any schema is built
  (`apps/web/src/schema-config.ts`); the browser journey fails on any policy violation.
- `PUBLIC_ORIGIN` is required (invitation sign-in, ADR 0036): exactly `https://<PUBLIC_HOST>`, with
  `:<port>` when the published HTTPS port is not 443.
- Shell scripts are bash (host; bash 3.2 compatible, as macOS ships it: no associative arrays,
  guard empty arrays under `set -u`) or POSIX `sh` (inside the Alpine images); keep them under the
  context budget (500 lines) and quote every expansion.

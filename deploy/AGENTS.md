# Deployment (`deploy/`)

Stage 350 (ADR 0037; contract `docs/STAGE_350_DESIGN.md`): one Compose project behind Caddy, built
from a committed revision, verified locally in Docker. Operations for people: `RUNBOOK.md`
(Russian and English). A security boundary for Gate 06 (alpha row 350 of `docs/GATE_COVERAGE.md`).

| File                                    | Role                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml`                          | `proxy` (the only published ports, 80/443), `server` (never published; listens only on `backend`), `postgres` (named volume), `backup`, `drill-db` (profile `drill`); networks `edge`, `backend`, `data`, `egress`                                                                                                                             |
| `Dockerfile`, `Dockerfile.dockerignore` | Targets `server` (non-root, read-only root, migrations then server) and `proxy` (Caddy, non-root, the built client); base images pinned by digest                                                                                                                                                                                              |
| `server/start.sh`                       | Container start: `migrate-cli.js` (`--allow-newer-database` only when `LTW_ALLOW_NEWER_SCHEMA=true`), then `main.js`                                                                                                                                                                                                                           |
| `proxy/Caddyfile`                       | TLS (`TLS_MODE=acme` or `internal`), security headers, `/api` reverse proxy with `flush_interval -1`, the single-page client, an internal health listener                                                                                                                                                                                      |
| `backup/backup.sh`                      | The backup service: custom-format dumps every 6 h and on demand, retention (all < 24 h, newest of 14 days and 8 ISO weeks), `SHA256SUMS`, `verify`, `health`                                                                                                                                                                                   |
| `.env.example`                          | Names of every setting; `deploy/.env` holds the values (git-ignored, mode 600) and is passed whole to the server container                                                                                                                                                                                                                     |
| `scripts/`                              | `build.sh` (images from `git archive`), `deploy.sh` (backup, switch tag, wait healthy; `--rollback`; takes the stack down first when the networks changed, `LTW_NETWORKS_DIGEST`), `review-campaign.sh` (the Russian review campaign, then the DM link once), `backup-now.sh`, `restore-drill.sh`, `watch.sh`, `spend.sh`, `logs.sh`, `lib.sh` |
| `verify/`                               | Local verification (`TLS_MODE=internal`): `smoke.sh`, `proxy-contract.sh`, `sign-in-journey.sh`, `live-stream.sh`, `trust-boundary.sh` (also safe on a server), `retention-check.sh`, `ci.sh`; `http.sh` (sourced: HTTPS as a browser, cookie jars, redaction)                                                                                 |

- Secrets come only from `deploy/.env`; never print it, never commit it, never pass a secret as a
  command-line argument (scripts expand `POSTGRES_PASSWORD` inside the containers). Evidence
  shows names, never values.
- Images are local and tagged by the 12-character commit (`pull_policy: never`); build them with
  `scripts/build.sh` from a committed revision only, so the same revision builds the same files.
- Compose fixes `NODE_ENV=production`, `AUTH_MODE=invitations`, the listen address and the
  database URL over anything in `deploy/.env`. The server is reachable only through the proxy;
  PostgreSQL and the backups only on the internal `data` network. Keep it that way.
- Migrations stay forward-only and additive (ADR 0003): a rollback runs the earlier image on the
  same database through `deploy.sh --rollback` (the migrator then accepts a database a newer build
  migrated, and `/readyz` refuses history that image cannot read). Anything else needs a restore.
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
- `PUBLIC_ORIGIN` is required (invitation sign-in, ADR 0036): exactly `https://<PUBLIC_HOST>`, with
  `:<port>` when the published HTTPS port is not 443.
- Shell scripts are bash (host; bash 3.2 compatible, as macOS ships it: no associative arrays,
  guard empty arrays under `set -u`) or POSIX `sh` (inside the Alpine images); keep them under the
  context budget (500 lines) and quote every expansion.

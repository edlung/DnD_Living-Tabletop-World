# Deployment (`deploy/`)

Stage 350 (ADR 0037; contract `docs/STAGE_350_DESIGN.md`): one Compose project behind Caddy, built
from a committed revision, verified locally in Docker. Operations for people: `RUNBOOK.md`
(Russian and English). A security boundary for Gate 06 (alpha row 350 of `docs/GATE_COVERAGE.md`).

| File                                    | Role                                                                                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml`                          | `proxy` (the only published ports, 80/443), `server` (never published), `postgres` (internal network, named volume), `backup`, `drill-db` (profile `drill`)                            |
| `Dockerfile`, `Dockerfile.dockerignore` | Targets `server` (non-root, read-only root, migrations then server) and `proxy` (Caddy, non-root, the built client); base images pinned by digest                                      |
| `server/start.sh`                       | Container start: `migrate-cli.js` (`--allow-newer-database` only when `LTW_ALLOW_NEWER_SCHEMA=true`), then `main.js`                                                                   |
| `proxy/Caddyfile`                       | TLS (`TLS_MODE=acme` or `internal`), security headers, `/api` reverse proxy with `flush_interval -1`, the single-page client, an internal health listener                              |
| `backup/backup.sh`                      | The backup service: custom-format dumps every 6 h and on demand, retention (all < 24 h, newest of 14 days and 8 ISO weeks), `SHA256SUMS`, `verify`, `health`                           |
| `.env.example`                          | Names of every setting; `deploy/.env` holds the values (git-ignored, mode 600) and is passed whole to the server container                                                             |
| `scripts/`                              | `build.sh` (images from `git archive`), `deploy.sh` (backup, switch tag, wait healthy; `--rollback`), `backup-now.sh`, `restore-drill.sh`, `watch.sh`, `spend.sh`, `logs.sh`, `lib.sh` |
| `verify/`                               | Local verification only: `smoke.sh`, `live-stream.sh`, `retention-check.sh`, `proxy-contract.sh`, `ci.sh`; overrides `pre-340.yaml` and `dev-personas.yaml`                            |

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
- `verify/dev-personas.yaml` signs anyone in with public tokens: local verification only, never on
  a server. `verify/pre-340.yaml` exists only until Stage 340 is merged (no `invitations` mode
  before it); part B of Stage 350 deletes both.
- Compose sets `LTW_TRUST_PROXY` (Stage 340's server setting, required in invitation mode) to the
  pinned range of the `edge` network (`LTW_EDGE_SUBNET`), and Caddy replaces any
  `X-Forwarded-For` a client sends (`verify/proxy-contract.sh`), so per-address limits see real
  clients. Never publish the server's port.
- `PUBLIC_ORIGIN` is required (invitation sign-in, ADR 0036): exactly `https://<PUBLIC_HOST>`, with
  `:<port>` when the published HTTPS port is not 443.
- Shell scripts are bash (host) or POSIX `sh` (inside the Alpine images); keep them under the
  context budget (500 lines) and quote every expansion.

# 0037. Deployment: one Compose project behind Caddy, verified locally

- Status: Accepted (owner product decision Q10 of 2026-10-15; technical design by the session)
- Date: 2026-10-15
- Stage: 350
- Decision type: product (where and how far to deploy now) and technical.
- Owner approval: Q10 "Подготовь и проверь локально (Recommended)" — a reproducible deployment
  verified locally in Docker; deploying to a server waits for the owner's access and domain
  (`reviews/OWNER_DECISIONS_9_2026-10-15.json`). Full design: `docs/STAGE_350_DESIGN.md`.

## Context

The slice ran only from a development checkout. Stage 350 needs a reproducible build from a tagged
revision with TLS, backups, a restore drill, health checks, logs, alarms, spending counters and a
runbook. The owner has not yet provided a server, a domain or an off-host backup target.

## Decisions

1. **One Compose project** in `deploy/`: `server` (multi-stage Node image, non-root, read-only root
   filesystem, migrations at start under an advisory lock), `proxy` (Caddy 2: the built client,
   `/api` reverse proxy without buffering for the live stream, automatic TLS — ACME in production,
   `tls internal` locally — and security headers), `postgres` (named volume, no published port),
   `backup` (`pg_dump --format=custom` every 6 h, 14 daily + 8 weekly, SHA-256 manifest).
2. **Secrets only from the environment** (`deploy/.env`, never committed; `.env.example` lists the
   names). Production runs `NODE_ENV=production` and `AUTH_MODE=invitations` (ADR 0036).
3. **Readiness.** `/healthz` (process) and `/readyz` (database reachable, migrations current, event
   store readable) drive the Compose health checks.
4. **Recovery.** The event store is canonical. The restore drill restores the latest dump into a
   throwaway database, replays every campaign stream and compares state digests with the live
   database; any difference fails the drill.
5. **Rollback.** Images are tagged by git revision; migrations are forward-only and additive, so a
   rollback runs the previous image on the same database.
6. **Operations.** JSON logs with rotation; a host watch script for disk, memory, health and error
   rate with an optional webhook; spending counters through the operator CLIs; a runbook in Russian
   and English (deploy, roll back, rotate keys, restore, revoke a user, stop AI and image spending).
7. **Verification now:** build and run the stack locally with `tls internal`, the Russian Player and
   DM smoke journeys against it, the restore drill, a rollback and roll-forward; hosted CI green on
   the same revision. No server deployment, announcement, invitation or release.

## Consequences

- Deploying to the owner's server is the runbook's "first install" once access, domain and the
  backup target exist; Gate 06 (355) then attacks that build. Until then the Gate 06 pass by the
  session runs against the local deployment and says so.
- Off-host backup copying is a documented step pending the owner's backup location.
- A single instance: in-memory limits (ADR 0036) and the live hub (ADR 0033) assume one server
  process; scaling out needs shared state (recorded triggers).

## 2026-10-16 — Part A implementation notes (technical)

Implemented as designed; these points make the decisions concrete. Files: `deploy/` (`AGENTS.md`).

- **Rollback and the strict migrator.** ADR 0003 refuses a database whose history holds
  migrations missing on disk, which is exactly what an earlier image meets after a later one
  migrated. The runner gains one explicit exception, used only by the deployment's rollback step:
  `migrate-cli --allow-newer-database` (`deploy.sh --rollback`, `LTW_ALLOW_NEWER_SCHEMA=true`)
  accepts history that extends this build's files when every shared entry is identical, and
  applies nothing. Drift is still refused. Every other start stays strict.
- **Readiness** (`/readyz`, `apps/server/src/world-engine/store-readiness.ts`): `database` (a
  query answers), `migrations` (nothing this build carries is pending; a database a newer build
  migrated passes, since the rollback step accepted it), `eventStore` (the newest event of every
  stream parses with this build's schemas and every stream head has its event; until it first
  succeeds, one stored event of every type and schema version is parsed too, so an earlier image
  never reports ready over history it cannot read). Each check is bounded (3 s), concurrent probes
  share one run, the body names failed checks only, and transitions are logged. Health requests
  log only warnings.
- **Restore drill.** The digest is SHA-256 over a canonical encoding of the World Engine state
  (`state-digest.ts`: maps and sets sorted, so fill order never matters). `replay-digest-cli.js`
  digests every stream (or given versions) and compares a restored database's digests with the
  live database replayed at the same versions; integrity violations never count as a match.
- **Proxy.** HTTP/3 is off (TCP 80/443 only); the client is `apps/web/build` (the design's
  `dist` was a slip); `/api` is never compressed; `Host`, `Origin`, `Sec-Fetch-*`, `Cookie` and
  `Authorization` pass unchanged (ADR 0036's origin check and sign-in need them) and a client's
  `X-Forwarded-For` is replaced by the real peer; the proxy adds its CSP only where the server set
  none (asset content keeps its sandboxed policy); `Server` and `Via` are removed. The proxy and
  the server run non-root with every capability dropped (the proxy binds 80/443 through the
  unprivileged-port sysctl); base images are pinned by digest.
- **Client address.** Per-address limits (ADR 0036 §6) read the client address, which behind the
  proxy only `X-Forwarded-For` carries. Stage 340 owns the server setting (`LTW_TRUST_PROXY`:
  `none` or the proxy's addresses/CIDR ranges, required in invitation mode); compose pins the
  `edge` network's range (`LTW_EDGE_SUBNET`, default `10.231.250.0/24`) and passes it, and Caddy
  replaces any `X-Forwarded-For` a client sends. The network's gateway lies in that range; with no
  server port published, only processes on the host could use it. `PUBLIC_ORIGIN` is required by
  compose (invitation mode). _Superseded by the part B notes: the server trusts a backend network
  that has no host address._
- **Database restarts.** The local run showed that an idle pool connection closed by PostgreSQL
  ended the server process (pg-pool's `error` had no listener). Both server pools now come from
  `createPool` (`apps/server/src/platform/db/pool.ts`): the loss is logged by code, the pool
  reconnects on demand, `/readyz` answers 503 until the database answers.
- **Spending counters.** `ai:operator spend` (read-only, operator only) reports effective spend
  per billing account (today and in total, open holds) and per approval against its stage
  ceiling, with `spend.ts`'s definition; startup logs still carry counts only.
- **Verification before Stage 340.** This revision has no `AUTH_MODE=invitations`; the local run
  uses `deploy/verify/pre-340.yaml` (`disabled`) and, for the live stream only,
  `deploy/verify/dev-personas.yaml` (public persona tokens, local only). Part B deletes both.

## 2026-10-16 — Part B implementation notes (technical)

On Stage 340's server (invitation sign-in, `LTW_TRUST_PROXY`, its security fixes). Files:
`deploy/compose.yaml`, `deploy/scripts/{deploy,review-campaign}.sh`, `deploy/verify/`
(`sign-in-journey.sh`, `trust-boundary.sh`, `live-stream.sh`, `http.sh`),
`apps/server/src/world-engine/review-campaign.ts`; evidence `reports/evidence/stage-350/part-b/`.

- **One production path.** The overrides are gone; verification runs `compose.yaml` alone, as
  production: `NODE_ENV=production`, `AUTH_MODE=invitations`, no development personas.
- **Network trust boundary.** Four networks: `edge` (the proxy alone; the published ports and
  ACME), `backend` (the proxy and the server only; internal), `data` (server, database, backups;
  internal) and `egress` (the server alone: its outbound calls to AI providers). `backend` and
  `data` use the bridge gateway mode `isolated` (Docker Engine 28 or later): the host gets no
  address on them, so no host process reaches the server or the database there (an internal
  network otherwise gives the host an address, which would sit inside the trusted range). The
  server listens only at its pinned backend address (`<LTW_BACKEND_PREFIX>.10`, default
  `10.231.251.10`; the proxy gets an address from `.128/25`), not on `data` or `egress`, where the
  host does have an address. `LTW_TRUST_PROXY` is the backend range `<prefix>.0/24`: only the
  proxy can name a client, and Caddy replaces the `X-Forwarded-For` a client sends.
  `verify/trust-boundary.sh` checks the members and flags of every network, the listening
  socket, that the API is unreachable from the host's network namespace and from `edge`, and that
  redeems through the proxy with ever-different forged `X-Forwarded-For` values are one client
  (429 by the eleventh) while the same header from the proxy's own address names a new client.
- **Docker Desktop.** Connections to published ports arrive from the `edge` gateway address, so
  locally every browser is one client to the per-address limits (runbook section 11); on a Linux
  host outside IPv4 clients keep their addresses. Without IPv6 on `edge`, Docker relays IPv6
  clients through its user-space proxy from one address: the runbook publishes only an `A` record
  until IPv6 is enabled there.
- **Network changes on deploy.** Compose recreates a network whose definition changed, but a
  container it only restarts rejoins it without its service name (seen in the upgrade from part
  A's layout: `postgres` no longer resolved). `deploy.sh` keeps a digest of the resolved networks
  (`LTW_NETWORKS_DIGEST`) and recreates every container when it changes.
- **Review campaign.** `review-campaign.ts` seeds the Russian Ravenford through the World Engine
  under the fixture's own command IDs, then the DM releases each seat the fixture gave a
  development persona (`ReleaseCharacter`, command ID `ravenford.review.release.<characterId>`):
  the party's history (memories that need the seat held) stays as written, and every character
  waits for the DM's invitation. Idempotent; a rerun never takes a seat back; a database holding
  the English Ravenford refuses it. `deploy/scripts/review-campaign.sh` seeds and prints the
  operator's DM link once. The server reads the Russian quest book by default
  (`LTW_QUESTS_FILE`). Curated images arrive with Stage 330.
- **Sign-in on the deployment.** Until the browser screens of Stage 340 part B,
  `verify/sign-in-journey.sh` drives the flows over HTTPS through the proxy with cookie jars:
  operator DM link, player invitation, play in Russian, revocation (the player's live stream
  closes within one cycle), used, revoked and forged links (one fixed 401), the 409 of a
  signed-in browser, cross-site refusals, sign-out, and no credential in any container log. The
  live stream check signs in the same way (cookie and `Origin`; the journey uses `Sec-Fetch-Site:
same-origin`).

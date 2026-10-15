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

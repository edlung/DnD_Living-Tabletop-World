# Living Tabletop World

AI-native tabletop RPG platform where the world is the interface. Product and architecture authority lives in the root documents: `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, `ARCHITECTURE_INVARIANTS.md`, `RAVENFORD_SPEC.md`. Development proceeds in gated stages (`EXECUTION_PLAN.md`, `AGENT_WORKFLOW.md`, `work-orders/`).

**Current state:** Stage 10 (World Kernel) — campaigns, world entities and locations, scenes, the world clock, the World Engine command pipeline, append-only PostgreSQL event history with replay, audit, and history-preserving undo. No gameplay, knowledge boundary, or player-facing API exists yet.

Agents: start with [`docs/AI_CONTEXT_MAP.md`](docs/AI_CONTEXT_MAP.md) and the nearest `AGENTS.md`.

## Prerequisites

- Node.js 24 LTS or newer (`.node-version` pins 24 for CI)
- pnpm 11 (`packageManager` in `package.json`; `corepack enable` or `npm i -g pnpm@11`)
- Docker (local PostgreSQL 18 via `docker-compose.yml`, host port 54329)

## Getting started

```bash
pnpm install --frozen-lockfile
pnpm db:up            # start PostgreSQL and wait until healthy
pnpm build
pnpm db:migrate       # bootstrap/upgrade the database schema
pnpm seed:ravenford   # seed the Ravenford kernel fixture (idempotent)
pnpm dev:server       # http://127.0.0.1:3000/healthz
```

Configuration is optional in development: safe defaults point at the docker-compose database. Copy `.env.example` to `.env` to override. Production requires `DATABASE_URL`.

## Commands

| Command | Purpose |
|---|---|
| `pnpm install --frozen-lockfile` | Reproducible install from `pnpm-lock.yaml` |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm lint` | ESLint (type-aware, module boundaries), zero warnings allowed |
| `pnpm typecheck` | Strict TypeScript over sources, tests, scripts |
| `pnpm context-budget` | Fails if any active source/test/stylesheet file exceeds 700 lines (warns above 500) |
| `pnpm test` | Unit tests (no external services) |
| `pnpm test:integration` | Integration tests; needs PostgreSQL (`pnpm db:up`) |
| `pnpm build` / `pnpm clean` | `tsc -b` build of all projects / remove outputs |
| `pnpm db:up` / `pnpm db:down` | Start / stop local PostgreSQL |
| `pnpm db:migrate` | Apply pending SQL migrations (run `pnpm build` first) |
| `pnpm seed:ravenford` | Seed `fixtures/ravenford/kernel-seed.json` through the World Engine; rerunning reports duplicates only |
| `pnpm dev:server` / `pnpm --filter @ltw/server start` | Run the server from source (watch) / from `dist` |
| `pnpm validate` | All checks in CI order, against a running database |
| `pnpm validate:ci-local` | CI-equivalent run: frozen install, start database, clean build, every check (`scripts/ci-local.sh`) |

CI (`.github/workflows/ci.yml`) runs the same steps on Node 24 with a PostgreSQL 18 service container.

## Repository layout

```text
apps/server/         composition root: config, logging, migrations, HTTP (only package with I/O)
apps/web/            client placeholder (framework ADR at Stage 200)
packages/contracts/  shared serializable contracts: kernel commands, results, IDs, world time
packages/domain/     World Kernel: state, events, World Engine, undo, projections (pure)
packages/rules/      deterministic rules (placeholder; Stage 40+)
packages/ui/         presentation components (placeholder; Stage 200+)
fixtures/ravenford/  Ravenford test fixtures (kernel seed from Stage 10)
tests/               repository-level tests (architecture boundaries)
scripts/             tooling (context budget, local CI)
docs/adr/            architecture decision records
reports/             stage completion reports
work-orders/         stage work orders (one authorized at a time)
```

Dependency direction is declared in `workspace-boundaries.json` and enforced by ESLint and `tests/architecture/` (see `docs/adr/0004-module-boundaries.md`).

## Decisions

See [`docs/adr/README.md`](docs/adr/README.md). Pending product decisions are tracked in [`docs/IMPLEMENTATION_PREREQUISITES.md`](docs/IMPLEMENTATION_PREREQUISITES.md).

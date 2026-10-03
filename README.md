# Living Tabletop World

AI-native tabletop RPG platform where the world is the interface. Product and architecture authority lives in the root documents: `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, `ARCHITECTURE_INVARIANTS.md`, `RAVENFORD_SPEC.md`. Development proceeds in gated stages (`EXECUTION_PLAN.md`, `AGENT_WORKFLOW.md`, `work-orders/`).

**Current state:** Stage 40 (Character & Rules Kernel). The stages so far provide:

- **World Kernel:** campaign event stream, World Engine, replay, audit, undo.
- **Knowledge Boundary:** typed records in WORLD_TRUTH, DM, PUBLIC, PARTY, CHARACTER, and NPC scopes, with perspective-scoped projections. Passed Astra Gate 01.
- **Memory:** memories and sessions, rejection of impossible memories, and scoped recall over world time (Astra reviews it at Gate 02).
- **Rules:** deterministic SRD 5.2.1 slice rules (`@ltw/rules`, ADR 0011) — range, spell slots, action economy, Counterspell, Concentration, movement, attacks, checks — plus Elowen's canonical sheet.
- **HTTP API** with development persona authentication.

No gameplay yet.

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
| `pnpm seed:ravenford` | Seed the Ravenford kernel and knowledge fixtures through the World Engine; rerunning reports duplicates only |
| `pnpm dev:server` / `pnpm --filter @ltw/server start` | Run the server from source (watch) / from `dist` |
| `pnpm validate` | All checks in CI order, against a running database |
| `pnpm validate:ci-local` | CI-equivalent run: frozen install, start database, clean build, every check (`scripts/ci-local.sh`) |

CI (`.github/workflows/ci.yml`) runs the same steps on Node 24 with a PostgreSQL 18 service container.

## Knowledge API (development)

After `pnpm db:up`, `pnpm build`, `pnpm db:migrate`, and `pnpm seed:ravenford`, start the server (`pnpm dev:server`) and query:

```bash
curl -H "Authorization: Bearer dev-player-elowen" "http://127.0.0.1:3000/campaigns/ravenford/knowledge?perspective=PARTY"
```

Routes under `/campaigns/:campaignId/`:

- `GET knowledge` (filters `type`, `about`, `asOf`)
- `GET knowledge/:knowledgeId`
- `GET knowledge/:knowledgeId/related?depth=1..3`
- `GET entities`
- `GET entities/:entityId/knowledge`
- `GET memories` (filters `q`, `entity`, `location`, `from`, `to`, `kind`, `session`, `asOf`, `limit`)
- `GET memories/:memoryId`
- `GET sessions` (campaign members; no perspective)
- `POST commands`

Every GET requires `perspective=DM|PUBLIC|PARTY|PLAYER|CHARACTER:<id>|NPC:<id>`. Persona tokens are in `fixtures/ravenford/personas.json` (development and test only; production refuses them). Who sees what: ADR 0008 (knowledge) and ADR 0010 (memories); HTTP behavior: ADR 0009.

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

## License notice

Rules mechanics come from the SRD 5.2.1 under CC-BY-4.0; see [`NOTICE.md`](NOTICE.md).

## Decisions

See [`docs/adr/README.md`](docs/adr/README.md). Pending product decisions are tracked in [`docs/IMPLEMENTATION_PREREQUISITES.md`](docs/IMPLEMENTATION_PREREQUISITES.md).

# Living Tabletop World

AI-native tabletop RPG platform where the world is the interface. Product and architecture authority lives in the root documents: `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, `ARCHITECTURE_INVARIANTS.md`, `RAVENFORD_SPEC.md`. Development proceeds in gated stages (`EXECUTION_PLAN.md`, `AGENT_WORKFLOW.md`, `work-orders/`).

**Current state:** Stage 150 (Asset Identity) complete; Stage 160 awaits the owner's authorization. Astra Gate 04, covering Stages 100–130, passed at retest 1 (`reviews/ASTRA_GATE_04_RETEST_1.md`, revision `987c223`), after one High and two Medium findings were remediated (`remediation/OPUS_GATE_04_REMEDIATION.md`). Astra Gate 03 passed earlier (retest 4, revision `998887d`), and Gate 02 before it (retest 2, revision `017ab0b`). The next gate, Gate 05, follows Stage 180. The stages so far provide:

- **World Kernel:** campaign event stream, World Engine, replay, audit, undo.
- **Knowledge Boundary:** typed records in WORLD_TRUTH, DM, PUBLIC, PARTY, CHARACTER, and NPC scopes, with perspective-scoped projections. Passed Astra Gate 01.
- **Memory:** memories and sessions, rejection of impossible memories, and scoped recall over world time. Passed Astra Gate 02.
- **Rules:** deterministic SRD 5.2.1 slice rules (`@ltw/rules`, ADR 0011) — range, spell slots, action economy, Counterspell, Concentration, movement, attacks, checks — plus Elowen's canonical sheet.
- **Context Engine:** perception and the context of a selected entity for an acting character — whitelisted visible state, contextual actions, legality from the rules, deterministic relevance (`@ltw/context`, ADR 0012).
- **Investigation:** players move, ask NPCs, examine evidence (rules-resolved checks), and form hypotheses. Clues and NPC disclosure are DM data; hypotheses never become facts (ADR 0013).
- **Contradictions:** DM-authored claims let the engine deterministically surface conflicting accounts (Mira vs Thorne) in the scope that sees both, without deciding who is lying. Records never change type; facts come only from DM authoring (ADR 0014). Context, investigation, and contradictions passed Astra Gate 02.
- **Combat:** deterministic encounters on a 5-ft battlefield — initiative, turns and action economy, movement with difficult terrain, cover, weapon and spell attacks, Fireball (allies included), conditions, death saves, the Old Trade Road goblins. Every roll is recorded, so combat replays and undoes in reverse order (`@ltw/combat`, ADR 0015).
- **Reactions:** a spell someone could counter waits in a canonical reaction window while the encounter pauses; Elowen counters the Goblin Shaman with Counterspell or ignores it, and the DM may close the window. Windows are race-safe, replayable, and undo strictly in reverse (ADR 0016). Opportunity attacks are deferred. Passed Astra Gate 03, together with the combat surfaces.
- **AI Gateway:** provider port and capability routing (an Anthropic adapter, enabled only by `ANTHROPIC_API_KEY`, then a deterministic local provider), context built only from the public directory, structured proposals validated with the World Engine's own command schemas, the owner's fallback policy, and append-only traces. The DM's words become a **proposal** only: nothing is committed (`@ltw/ai`, ADR 0017).
- **AI Authoring:** the DM turns a proposal into an authoring proposal, edits it, previews it, and confirms it. The World Engine applies it as one command or not at all, after checking the owner-approved operations (create, edit, and move NPCs; their own knowledge and its disclosure), each operation's own rules, continuity, and the DM's confirmation against the world at commit. Tomas Reed is the acceptance case. Undo takes the whole commit back, and is refused with the dependents named while anything relies on it (ADR 0018).
- **Continuity Engine:** checks across time, geography, identity, knowledge, relationships, and lore. Impossible history blocks; implausible authoring warns, with an explanation and options the DM may apply as a new revision. NPCs have an attitude toward the party, and lore is compared through claims, including DM claims on world truth that players never meet (ADR 0019).
- **NPC Intelligence:** players talk with NPCs, ask about known topics, show evidence, and read them with Insight (a DC 13 check). The World Engine decides every outcome; Orin tells what he guards once shown the strange symbol, and never his secret. An NPC's reply is phrased, by Anthropic when a key is set or by local templates, from a minimal context holding only what it may say to that speaker now, so no prompt can make it reveal what it was never given. Replies are traced and never canonical. Trade is not available. The DM gets a deterministic suggestion for each monster turn (ADR 0020).
- **AI Relevance:** on request, an AI ranker re-rates which of a selected entity's legal actions matter most now, from what the character knows. It never changes legality or the actions offered, adds no text, and any outage, invalid answer, or timeout (2 s by default) returns the deterministic ranking unchanged (ADR 0021).
- **Asset Identity:** every NPC or location an authoring commit creates gets a visual reference request, and the DM may request references or labelled variants of any entity. A background worker generates them (a deterministic local placeholder; no external image service yet). An image is a candidate until the DM approves it as the entity's canonical reference; replacements are versioned and the lineage is kept. Players see only approved images of what their character knows or sees, with no names or details. A started job holds undo of what it depicts until the DM cancels it or retracts its image (ADR 0022).
- **HTTP API** with development persona authentication.

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
- `GET entities/:entityId/context` (acting character only; ADR 0012)
- `GET encounter` (the running encounter as the perspective sees it; ADR 0015)
- `POST commands`
- `POST ai/intents` with `{ "text": … }` (DM only; returns a proposal, never committed; ADR 0017)
- `GET ai/traces/:traceId` (DM only)
- `POST authoring/proposals` with `{ traceId }` or `{ summary, commands }`; `GET authoring/proposals/:proposalId`; `POST …/revisions`, `…/commit`, `…/undo` (DM only; ADR 0018)

Every knowledge GET requires `perspective=DM|PUBLIC|PARTY|PLAYER|CHARACTER:<id>|NPC:<id>`. Persona tokens are in `fixtures/ravenford/personas.json` (development and test only; production refuses them). Who sees what: ADR 0008 (knowledge) and ADR 0010 (memories); HTTP behavior: ADR 0009.

## Repository layout

```text
apps/server/         composition root: config, logging, migrations, HTTP (only package with I/O)
apps/web/            client placeholder (framework ADR at Stage 200)
packages/contracts/  shared serializable contracts: kernel commands, results, IDs, world time
packages/domain/     World Kernel, knowledge, memory, character sheets (pure)
packages/rules/      deterministic SRD 5.2.1 slice rules (pure)
packages/context/    Context Engine: entity context, actions, legality, relevance (pure)
packages/combat/     Combat Engine: encounters, turns, attacks, spells, damage (pure)
packages/ai/         AI gateway: providers, routing, scoped context, proposals, traces (pure; no World Engine)
packages/ui/         presentation components (placeholder; Stage 200+)
fixtures/ravenford/  Ravenford test fixtures and seeds (see its AGENTS.md)
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

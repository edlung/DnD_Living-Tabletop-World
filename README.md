# Living Tabletop World

AI-native tabletop RPG platform where the world is the interface. Product and architecture authority lives in the root documents: `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`, `ARCHITECTURE_INVARIANTS.md`, `RAVENFORD_SPEC.md`. Development proceeds in gated stages (`EXECUTION_PLAN.md`, `AGENT_WORKFLOW.md`, `work-orders/`).

**Current state:** Stages 0–240 are implemented and Astra Gates 01–05 passed (Gate 05 at retest 2, `reviews/ASTRA_GATE_05_RETEST_2.md`). Stage 250 prepared a release candidate, tagged `v0.1.0-rc.1`, that is **not released** (`docs/RELEASE_CANDIDATE.md`, `reports/STAGE_250_RELEASE.md`). The alpha phase in `EXECUTION_PLAN.md` (Stages 290–360 and Gate 06) leads to a closed alpha with real people, in Russian, and then to the v0.1 release; its first stage, 290, requires separate owner authorization. Capabilities so far:

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
- **World Visual State:** the DM sets the weather of a place as a world fact (clear on Day 1, rain over Ravenford on Day 2), and the time of day follows the world clock. Any entity or place can be shown as it looked at any past moment: weather, status, wounds, conditions, and equipment at that time, with the approved image the state calls for (a `rain` or `night` variant, or the reference). Players see what their character knows now or saw then, and details only of what they saw (ADR 0023).
- **Chronicle:** the DM generates a chapter such as *Chapter I — Shadows on the Trade Road* for the party. It is told only from the party's own memories, each entry traced to the events that recorded it and keeping accounts and suspicions marked as such. Prose is written from those entries (by Anthropic with a key, otherwise a deterministic template), cites them, and can never change the world. The system suggests memories for moments the party lived but does not remember (a fight, a return, a new day); the DM decides. Any remembered moment opens as a flashback: the place as it looked then, who was there, the world time, and the words said (ADR 0024).
- **Ravenford, end to end:** the whole slice is played automatically over the HTTP API by the DM and the player, from arrival to Chapter I, and on PostgreSQL across a restart. Each of Ravenford's required commands and events is checked against what implements it. The party's quest log tracks the Missing Caravan from Mira's account to the return, as a projection of what the party knows and did; it is never stored as fact (ADR 0025).
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
pnpm dev:server       # API on http://127.0.0.1:3000
# In another terminal:
pnpm dev:web          # open http://127.0.0.1:5173
```

Configuration is optional in development: safe defaults point at the docker-compose database. Copy `.env.example` to `.env` to override. Production requires `DATABASE_URL`.

## Player/DM local experience

Open the web client, keep campaign `ravenford`, and enter the development persona token
`dev-player-elowen` or `dev-dm-ravenford` from `fixtures/ravenford/personas.json`.
Tokens are entered explicitly and live only in memory. These personas are for local
development; the client shows their form only when the server has no production sign-in.

With production sign-in (`AUTH_MODE=invitations`, `PUBLIC_ORIGIN` set to the address the
browser opens, `LTW_TRUST_PROXY`; ADR 0036) nobody types a token: the DM opens the link that
`pnpm auth:operator dm-invite` prints, and invites players from the **Players** sheet of the
DM view (each link is shown once and works once); a player opens the link and is at the table.
**Sign out** asks first: coming back takes a new invitation.

Pick a location, then select people and objects in the scene: contextual options are
the server's, and the client submits only the commands it lists. Players explore,
investigate, fight (battlefield, Fireball preview, Counterspell/Ignore), and read the
Chronicle with flashbacks. The DM can add an NPC in natural language (preview, edit,
confirm, cancel, undo), perform an NPC, run encounters, move time and weather, and
write Chronicle chapters; the DM can preview the Player View. **Refresh world**
discards the current projection and reloads it; **Leave session** clears the session.
See [`docs/RELEASE_CANDIDATE.md`](docs/RELEASE_CANDIDATE.md) for the release candidate.

`LTW_API_TARGET=http://127.0.0.1:3000 pnpm dev:web` overrides the local API proxy target.
No AI provider is needed. The client bundle is in `apps/web/build`; this is a build
artifact, not a production deployment.

Install the browser once with `pnpm exec playwright install chromium`, then run
`pnpm test:e2e`. The test suite owns isolated API/Vite servers on ports 4311/4310 (development
personas) and 4313/4312 (production sign-in) and uses a real seeded in-memory World Engine. It
requires no database or external AI.

## Commands

| Command | Purpose |
|---|---|
| `pnpm install --frozen-lockfile` | Reproducible install from `pnpm-lock.yaml` |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm lint` | ESLint (type-aware, module boundaries), zero warnings allowed; runs with a 4 GB heap, which type-aware linting needs on machines with 8 GB of memory or less |
| `pnpm typecheck` | Strict TypeScript over sources, tests, scripts |
| `pnpm context-budget` | Fails if any active source/test/stylesheet file exceeds 700 lines (warns above 500) |
| `pnpm test` | Unit tests (no external services) |
| `pnpm test:integration` | Integration tests; needs PostgreSQL (`pnpm db:up`) |
| `pnpm test:e2e` | Browser/API journeys; install Playwright Chromium first |
| `pnpm eval:ai` | Explicit live-provider evaluation; excluded from validation/CI. Do not run until text-provider spending ceilings are approved; Stage 300 accounting/evaluation remediation is pending. See `docs/PROJECT_WORKFLOW.md`. |
| `pnpm auth:operator dm-invite --campaign <id> --expires-hours <n>` | Prints the DM's single-use sign-in link for a campaign (`AUTH_MODE=invitations`, `PUBLIC_ORIGIN`; ADR 0036); the only way to DM access in production |
| `pnpm dev:web` | Local Player/DM web client and API proxy |
| `pnpm build` / `pnpm clean` | Compile all projects and bundle the web app / remove TypeScript outputs |
| `pnpm db:up` / `pnpm db:down` | Start / stop local PostgreSQL |
| `pnpm db:migrate` | Apply pending SQL migrations (run `pnpm build` first) |
| `pnpm seed:ravenford` | Seed the Ravenford kernel and knowledge fixtures through the World Engine, and import the curated Ravenford pictures as DM-approved assets (ADR 0035); rerunning reports duplicates only. Run it with the server stopped |
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
- `GET session` (caller identity and permitted views; no perspective)
- `GET entities/:entityId/sheet` (DM or the perspective’s own character; ADR 0026)
- `GET entities/:entityId/context` (acting character only; ADR 0012)
- `GET encounter` (the running encounter as the perspective sees it; ADR 0015)
- `POST commands`
- `POST ai/intents` with `{ "text": … }` (DM only; returns a proposal, never committed; ADR 0017)
- `GET ai/traces/:traceId` (DM only)
- `POST authoring/proposals` with `{ traceId }` or `{ summary, commands }`; `GET authoring/proposals/:proposalId`; `POST …/revisions`, `…/commit`, `…/undo` (DM only; ADR 0018)

With `AUTH_MODE=invitations` (production, ADR 0036) there are no persona tokens: `POST /auth/redeem` turns a DM invitation link's token into an `ltw_session` cookie, `GET /auth/session` and `POST /auth/sign-out` follow, and the DM manages `GET|POST invitations`, `POST invitations/:invitationId/revoke` and `POST members/:characterId/revoke`. Every non-GET request needs the `Origin` of `PUBLIC_ORIGIN`.

Every knowledge GET requires `perspective=DM|PUBLIC|PARTY|PLAYER|CHARACTER:<id>|NPC:<id>`. Persona tokens are in `fixtures/ravenford/personas.json` (development and test only; production refuses them). Who sees what: ADR 0008 (knowledge) and ADR 0010 (memories); HTTP behavior: ADR 0009.

## Repository layout

```text
apps/server/         composition root: config, logging, migrations, HTTP (only package with I/O)
apps/web/            React/Vite Player/DM client (ADR 0026)
packages/contracts/  shared serializable contracts: kernel commands, results, IDs, world time
packages/domain/     World Kernel, knowledge, memory, character sheets (pure)
packages/rules/      deterministic SRD 5.2.1 slice rules (pure)
packages/context/    Context Engine: entity context, actions, legality, relevance (pure)
packages/combat/     Combat Engine: encounters, turns, attacks, spells, damage (pure)
packages/ai/         AI gateway: providers, routing, scoped context, proposals, traces (pure; no World Engine)
packages/ui/         shared character, knowledge, encounter, and status components
fixtures/ravenford/  Ravenford test fixtures and seeds (see its AGENTS.md)
tests/               repository-level architecture tests and browser journeys
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

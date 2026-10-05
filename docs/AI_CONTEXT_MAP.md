# AI Context Map

Product/architecture documents are at the repository root. Paths below are relative to that root. Stages 0 (repository foundation), 10 (World Kernel), 20 (Knowledge Boundary), 30 (Memory), 40 (Rules), 50 (Context Engine), 60 (Investigation), 70 (Contradictions), 80 (Combat), 90 (Reactions), 100 (AI Gateway), 110 (AI Authoring), 120 (Continuity Engine), 130 (NPC Intelligence), 140 (AI Relevance), 150 (Asset Identity), 160 (World Visual State), 170 (Chronicle), 180 (Ravenford Integration), 200 (UX Foundation), 210 (World as Interface), 220 (Combat UX), and 230 (DM Authoring UX), and 240 (DM session tools) have added the code/tooling entry points in the second table; each later stage keeps them current. Completion reports live in `reports/`; gate handoffs in `handoffs/`.

Read the nearest `AGENTS.md`, then only the entries needed for the task.

## Process and product

| Task | Smallest starting set |
|---|---|
| Start or authorize a stage | `QUICKSTART.md`, `EFFORT_MATRIX.md`, `AGENT_WORKFLOW.md`, the one authorized file in `work-orders/` |
| Repository foundation | `work-orders/OPUS_STAGE_000.md`, `ARCHITECTURE.md` (System Shape, Persistence, Deployment) |
| Product behavior or invariant | `ARCHITECTURE_INVARIANTS.md`, relevant section of `PRODUCT_BLUEPRINT.md` or `RAVENFORD_SPEC.md` |
| Find a stage or dependency | Relevant stage in `EXECUTION_PLAN.md`, `docs/IMPLEMENTATION_PREREQUISITES.md` |
| Knowledge boundary and later leakage paths | `docs/GATE_COVERAGE.md`, relevant knowledge/memory/NPC work order, `ARCHITECTURE.md` (Knowledge Architecture, NPC Context Isolation) |
| History, replay, undo | `docs/IMPLEMENTATION_PREREQUISITES.md` (Temporal and undo contracts), Stages 10, 90, 110, 150, or 160 as applicable |
| Deterministic rules | `docs/IMPLEMENTATION_PREREQUISITES.md` (Ruleset), Stage 40, relevant Ravenford mechanics |
| AI authoring or continuity | Stages 110/120, invariant 16, `RAVENFORD_SPEC.md` (DM Authoring Acceptance Flow); code entry points in the authoring row below (ADR 0018) |
| Prepare/review a checkpoint | `CHECKPOINTS.md`, `docs/GATE_COVERAGE.md`, exact handoff, `ASTRA_MASTER.md`, relevant mission in `ASTRA_GATE_PROMPTS.md`, `ASTRA_REVIEW.md` |
| Remediation/retest | Exact failed report, `OPUS_REMEDIATION_TEMPLATE.md`, `HANDOFF_TEMPLATE.md`, `AGENT_WORKFLOW.md` (Retest Rule) |
| UX, validation, release | Authorized Stage 200–250 work order, relevant product/Ravenford acceptance sections |

## Code and tooling

| Task | Smallest starting set |
|---|---|
| Local setup, commands, validation | `README.md` (Commands), `package.json` scripts, `scripts/ci-local.sh` |
| CI | `.github/workflows/ci.yml` (mirrors `scripts/ci-local.sh`) |
| Technical decisions | `docs/adr/README.md` index, then only the relevant ADR |
| Module boundaries / add a dependency edge | `docs/adr/0004-module-boundaries.md`, `workspace-boundaries.json`, `eslint.config.js`, `tests/architecture/` |
| TypeScript / build wiring | `tsconfig.base.json`, `tsconfig.json` (typecheck), `tsconfig.build.json` + `<project>/tsconfig.build.json` (build) |
| Server startup and composition | `apps/server/AGENTS.md`, `apps/server/src/main.ts` |
| Config / environment variables | `apps/server/src/platform/config/config.ts`, `.env.example` |
| Structured logging | `apps/server/src/platform/logging/logger.ts` |
| Database migrations | `apps/server/migrations/AGENTS.md`, `apps/server/src/platform/db/` (`migration-source.ts`, `migrator.ts`, `migrate-cli.ts`), `docker-compose.yml` |
| HTTP API: app, auth, errors, routes | `apps/server/src/http/app.ts`, `auth.ts`, `errors.ts`, `request-context.ts`, `routes/`; ADR 0009 |
| Knowledge boundary: records, perspectives, projections, queries | `packages/domain/src/knowledge/AGENTS.md`, ADR 0008 (owner-approved) |
| Memory, sessions, impossible-memory rules, scoped recall | `packages/domain/src/memory/AGENTS.md`, ADR 0010 (owner-approved) |
| Memory API routes | `apps/server/src/http/routes/memory-routes.ts`; contracts in `packages/contracts/src/memory/` |
| Knowledge API contracts (perspective format, views, responses) | `packages/contracts/src/knowledge/` |
| Gate 01 boundary specification and secret fixtures | `fixtures/ravenford/AGENTS.md`, `fixtures/ravenford/knowledge-boundary.json` |
| World Kernel: state, commands, events, engine, undo, projections | `packages/domain/src/kernel/AGENTS.md` (file map), ADRs 0006 (approved temporal/undo semantics) and 0007 (model, pipeline, storage) |
| Add or change a kernel command/event | `packages/domain/src/kernel/AGENTS.md` rules, `decide/<area>.ts`, `events.ts`, `evolve.ts`, `facts.ts`, matching `*.test.ts` |
| Change an event payload schema; read or undo histories earlier revisions wrote | `packages/domain/src/kernel/AGENTS.md` (rules), `packages/domain/src/kernel/event-versions.ts`; undo on them `kernel/decide/undo.ts`, check `kernel/verification/earlier-writers.ts`; histories `fixtures/history/AGENTS.md`; loaders `packages/combat/src/testing/history.ts`, `apps/server/src/testing/history-rows.ts` |
| Event store / PostgreSQL persistence | `apps/server/src/world-engine/postgres-event-store.ts`, `apps/server/migrations/0001_world_event_store.sql` (AI traces `0002_ai_traces.sql`, authoring revisions `0003_authoring_proposals.sql`, and asset contents `0004_asset_contents.sql`: not canonical) |
| Seed Ravenford / dev harness | `apps/server/src/world-engine/seed-ravenford-cli.ts`, `fixtures/ravenford/kernel-seed.json` |
| Deterministic rules (SRD 5.2.1 slice) | `packages/rules/AGENTS.md`, ADR 0011 (owner-approved), `NOTICE.md` |
| Context Engine: perception, entity context, actions, legality, relevance | `packages/context/AGENTS.md`, ADR 0012 (owner-approved); contracts in `packages/contracts/src/context/`; route `apps/server/src/http/routes/context-routes.ts` |
| Investigation: player commands, clues, NPC disclosure, hypotheses | `packages/domain/src/investigation/AGENTS.md`, ADR 0013 (owner-approved); fixture `fixtures/ravenford/investigation-seed.json` |
| NPC intelligence: guarded disclosure, showing evidence, Insight | `packages/domain/src/investigation/AGENTS.md` (`disclosure.ts`, `show.ts`, `insight.ts`), ADR 0020 §1–2, §4 (owner-approved) |
| NPC dialogue: Talk check, minimal NPC context, replies, Gate 04 isolation | `packages/domain/src/npc/AGENTS.md`, ADR 0020 §3; replies `packages/ai/src/dialogue*.ts`; route `apps/server/src/http/routes/npc-routes.ts`; contracts `packages/contracts/src/npc/dialogue.ts`; markers `fixtures/ravenford/npc-boundary.json` |
| AI relevance: ranking a context's legal actions on request | ADR 0021; `packages/ai/src/relevance.ts`, `relevance-prompt.ts`; route `apps/server/src/http/routes/context-routes.ts` (`ranking=ai`); deterministic engine `packages/context/` |
| Monster turn suggestions for the DM | `packages/combat/src/suggestion.ts` (`packages/combat/AGENTS.md`), ADR 0020 §5; route `apps/server/src/http/routes/encounter-routes.ts` |
| Contradictions, claims, valid knowledge transitions | `packages/domain/src/contradiction/AGENTS.md`, ADR 0014 (owner-approved); fixture `fixtures/ravenford/contradiction-seed.json` |
| Combat: encounters, initiative, turns, attacks, spells, 0 HP, encounter view | `packages/combat/AGENTS.md`, ADR 0015 (owner-approved); contracts in `packages/contracts/src/combat/`; domain port and events in `packages/domain/src/combat/`; route `apps/server/src/http/routes/encounter-routes.ts`; fixtures `fixtures/ravenford/combat-seed.json`, `road-ambush.json` |
| Reactions: windows, Counterspell, the pause, undo with an open window | `packages/combat/AGENTS.md` (`src/reactions/`), ADR 0016 (owner-approved); domain records/events/fold in `packages/domain/src/combat/reaction-*.ts`; pause rule `packages/domain/src/kernel/decide/reaction-pause.ts`; contracts `packages/contracts/src/combat/reactions.ts` |
| AI gateway: providers, capability routing, ContextBuilder, structured proposals, fallback, traces | `packages/ai/AGENTS.md`, ADR 0017 (owner-approved); contracts `packages/contracts/src/ai-gateway/intents.ts`; Anthropic adapter and composition `apps/server/src/ai/`; routes `apps/server/src/http/routes/ai-routes.ts`; traces `apps/server/migrations/0002_ai_traces.sql` |
| Continuity Engine: checks by domain, explanations, options, lore claims | `packages/domain/src/authoring/AGENTS.md` (`continuity/`), ADR 0019 (owner-approved) |
| Relationships: NPC attitude toward the party | `packages/domain/src/relationships/AGENTS.md`, ADR 0019 §3 (owner-approved) |
| AI authoring: proposals, enabled operations, risk, continuity, preview, consent, commit, undo | `packages/domain/src/authoring/AGENTS.md`, ADR 0018 (owner-approved); contracts `packages/contracts/src/authoring/`; service and stores `apps/server/src/authoring/`; routes `apps/server/src/http/routes/authoring-routes.ts`; revisions `apps/server/migrations/0003_authoring_proposals.sql` |
| Asset identity: requests, worker jobs, approval, variants, lineage, player visibility, undo hold | `packages/domain/src/assets/AGENTS.md`, ADR 0022 (owner-approved); contracts `packages/contracts/src/assets/`; image port `packages/ai/src/images.ts`, `placeholder-images.ts`; worker and content stores `apps/server/src/assets/`; routes `apps/server/src/http/routes/asset-routes.ts`; contents `apps/server/migrations/0004_asset_contents.sql` |
| World visual state: weather, day phases, how things looked at a time, scenes | `packages/domain/src/visual/AGENTS.md`, ADR 0023 (owner-approved); weather `packages/domain/src/weather/weather.ts`; contracts `packages/contracts/src/visual/`; routes `apps/server/src/http/routes/visual-routes.ts`; Day 2 script `fixtures/ravenford/day-two.json` |
| Chronicle: chapters, traced prose, memory suggestions, flashbacks | `packages/domain/src/chronicle/AGENTS.md`, ADR 0024 (owner-approved); contracts `packages/contracts/src/chronicle/`; prose `packages/ai/src/chronicle.ts`; routes `apps/server/src/http/routes/chronicle-routes.ts` |
| Quest log: the Missing Caravan as a projection of the party's history | `packages/domain/src/quest/AGENTS.md`, ADR 0025 §2 (owner-approved); contracts `packages/contracts/src/quest/`; definitions `fixtures/ravenford/quests.json`; route `apps/server/src/http/routes/quest-routes.ts` |
| Ravenford end to end: the played slice, the semantics ledger, acceptance, PostgreSQL | `apps/server/src/scenario/AGENTS.md`, ADR 0025 §1, §3 |
| Character sheets (canonical) | `packages/domain/src/character/character.ts`; schema in `packages/contracts/src/rules/character-sheet.ts` |
| Shared contracts (command shapes, results, IDs, world time) | `packages/contracts/src/index.ts`, `packages/contracts/src/kernel/` |
| Client / UI | `apps/web/AGENTS.md`, ADR 0026; entry `apps/web/src/main.tsx`; shared presentation `packages/ui/AGENTS.md` |
| Object-first exploration: actions, hypotheses, recall, travel | `apps/web/src/exploration/`, `apps/web/src/world/world.tsx`, ADR 0027; journeys `tests/e2e/investigation-*.spec.ts` |
| Combat UX: battlefield, movement, area preview, reactions, DM encounter controls | `apps/web/src/combat/`, ADR 0028; journeys `tests/e2e/combat-*.spec.ts`, campaigns `apps/server/src/testing/ui-combat-campaigns.ts` |
| DM authoring UX: intent, preview, edit, confirm, cancel, undo | `apps/web/src/authoring/`, ADR 0029; journeys `tests/e2e/authoring-*.spec.ts`, campaigns `apps/server/src/testing/ui-authoring-campaigns.ts` |
| DM time/weather, perform an NPC; Chronicle and flashback | `apps/web/src/dm/`, `apps/web/src/chronicle/`, ADR 0030; journeys `tests/e2e/dm-tools.spec.ts` |
| Release candidate: install, start, limits, recovery | `docs/RELEASE_CANDIDATE.md`, `reports/STAGE_250_RELEASE.md` |
| Browser session, perspective changes, stale requests | `apps/web/src/session/app.tsx`, `apps/web/src/api/client.ts`, `resource.ts`; E2E `tests/e2e/AGENTS.md` |
| Session identity and full authorized character sheets | `packages/domain/src/knowledge/session.ts`, `packages/domain/src/character/AGENTS.md`; routes `apps/server/src/http/routes/session-routes.ts`, `character-routes.ts`; contracts `packages/contracts/src/session/views.ts`, `rules/character-view.ts` |
| Ravenford fixtures | `fixtures/ravenford/AGENTS.md` |
| Context-budget check | `scripts/context-budget/budget.ts` (policy constants), `scripts/context-budget/cli.ts` |
| Test layout | `vitest.config.ts` (unit vs integration projects), `tests/AGENTS.md`; package tests sit beside source as `*.test.ts` / `*.integration.test.ts`; test support in `testing/` folders (excluded from builds): `packages/domain/src/kernel/testing/`, `packages/context/src/testing/`, `packages/combat/src/testing/`, `packages/ai/src/testing/`, `packages/domain/src/authoring/testing/`, `packages/domain/src/assets/testing/`, `packages/domain/src/visual/testing/`, `packages/domain/src/chronicle/testing/`, `apps/server/src/testing/` (including `scenario/`) |
| Past stage outcomes | `reports/AGENTS.md`, then the one relevant `reports/STAGE_<NNN>_COMPLETION.md` |

Do not load every work order or historical report for an ordinary task. Generated assets, migrations, logs, and large fixtures must have local context guidance (`AGENTS.md`) and be queried narrowly. `OPUS_STAGE_00.md` is a deprecated pointer, not a second Stage 0 specification.

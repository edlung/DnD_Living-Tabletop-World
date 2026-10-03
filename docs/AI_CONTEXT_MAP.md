# AI Context Map

Product/architecture documents are at the repository root. Paths below are relative to that root. Stages 0 (repository foundation), 10 (World Kernel), 20 (Knowledge Boundary), 30 (Memory), 40 (Rules), 50 (Context Engine), and 60 (Investigation) have added the code/tooling entry points in the second table; each later stage keeps them current. Completion reports live in `reports/`; gate handoffs in `handoffs/`.

Read the nearest `AGENTS.md`, then only the entries needed for the task.

## Process and product

| Task | Smallest starting set |
|---|---|
| Start or authorize a stage | `QUICKSTART.md`, `EFFORT_MATRIX.md`, `AGENT_WORKFLOW.md`, the one authorized file in `work-orders/` |
| Repository foundation | `work-orders/OPUS_STAGE_000.md`, `ARCHITECTURE.md` (System Shape, Persistence, Deployment) |
| Product behavior or invariant | `ARCHITECTURE_INVARIANTS.md`, relevant section of `PRODUCT_BLUEPRINT.md` or `RAVENFORD_SPEC.md` |
| Find a stage or dependency | Relevant stage in `EXECUTION_PLAN.md`, `docs/IMPLEMENTATION_PREREQUISITES.md` |
| Knowledge boundary and later leakage paths | `docs/GATE_COVERAGE.md`, relevant knowledge/memory/NPC work order, `ARCHITECTURE.md` (Knowledge Architecture, NPC Context Isolation) |
| History, replay, undo | `docs/IMPLEMENTATION_PREREQUISITES.md` (Temporal and undo contracts), Stages 10, 90, or 110 as applicable |
| Deterministic rules | `docs/IMPLEMENTATION_PREREQUISITES.md` (Ruleset), Stage 40, relevant Ravenford mechanics |
| AI authoring or continuity | Stages 110/120, invariant 16, `RAVENFORD_SPEC.md` (DM Authoring Acceptance Flow) |
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
| Event store / PostgreSQL persistence | `apps/server/src/world-engine/postgres-event-store.ts`, `apps/server/migrations/0001_world_event_store.sql` |
| Seed Ravenford / dev harness | `apps/server/src/world-engine/seed-ravenford-cli.ts`, `fixtures/ravenford/kernel-seed.json` |
| Deterministic rules (SRD 5.2.1 slice) | `packages/rules/AGENTS.md`, ADR 0011 (owner-approved), `NOTICE.md` |
| Context Engine: perception, entity context, actions, legality, relevance | `packages/context/AGENTS.md`, ADR 0012 (owner-approved); contracts in `packages/contracts/src/context/`; route `apps/server/src/http/routes/context-routes.ts` |
| Investigation: player commands, clues, NPC disclosure, hypotheses | `packages/domain/src/investigation/AGENTS.md`, ADR 0013 (owner-approved); fixture `fixtures/ravenford/investigation-seed.json` |
| Character sheets (canonical) | `packages/domain/src/character/character.ts`; schema in `packages/contracts/src/rules/character-sheet.ts` |
| Shared contracts (command shapes, results, IDs, world time) | `packages/contracts/src/index.ts`, `packages/contracts/src/kernel/` |
| Client / UI | `apps/web/src/index.ts`, `packages/ui/src/index.ts` (placeholders; framework ADR at Stage 200) |
| Ravenford fixtures | `fixtures/ravenford/AGENTS.md` |
| Context-budget check | `scripts/context-budget/budget.ts` (policy constants), `scripts/context-budget/cli.ts` |
| Test layout | `vitest.config.ts` (unit vs integration projects), `tests/AGENTS.md`; package tests sit beside source as `*.test.ts` / `*.integration.test.ts`; test support in `testing/` folders (excluded from builds): `packages/domain/src/kernel/testing/`, `packages/context/src/testing/`, `apps/server/src/testing/` |
| Past stage outcomes | `reports/AGENTS.md`, then the one relevant `reports/STAGE_<NNN>_COMPLETION.md` |

Do not load every work order or historical report for an ordinary task. Generated assets, migrations, logs, and large fixtures must have local context guidance (`AGENTS.md`) and be queried narrowly. `OPUS_STAGE_00.md` is a deprecated pointer, not a second Stage 0 specification.

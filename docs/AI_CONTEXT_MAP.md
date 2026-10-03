# AI Context Map

Product/architecture documents are at the repository root. Paths below are relative to that root. Stage 0 (repository foundation) has added the code/tooling entry points in the second table; each later stage keeps them current. Its completion report is `reports/STAGE_000_COMPLETION.md`.

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
| HTTP surface | `apps/server/src/http/health-server.ts` (liveness only so far) |
| Domain (World Engine) | `packages/domain/src/index.ts` (Stage 0 placeholder) |
| Deterministic rules | `packages/rules/src/index.ts` (Stage 0 placeholder) |
| Shared contracts | `packages/contracts/src/index.ts` (Stage 0 placeholder) |
| Client / UI | `apps/web/src/index.ts`, `packages/ui/src/index.ts` (placeholders; framework ADR at Stage 200) |
| Ravenford fixtures | `fixtures/ravenford/AGENTS.md` |
| Context-budget check | `scripts/context-budget/budget.ts` (policy constants), `scripts/context-budget/cli.ts` |
| Test layout | `vitest.config.ts` (unit vs integration projects), `tests/AGENTS.md`; package tests sit beside source as `*.test.ts` / `*.integration.test.ts` |
| Past stage outcomes | `reports/AGENTS.md`, then the one relevant `reports/STAGE_<NNN>_COMPLETION.md` |

Do not load every work order or historical report for an ordinary task. Generated assets, migrations, logs, and large fixtures must have local context guidance (`AGENTS.md`) and be queried narrowly. `OPUS_STAGE_00.md` is a deprecated pointer, not a second Stage 0 specification.

# 0004. Module boundaries and dependency direction

- Status: Accepted
- Date: 2026-10-03
- Stage: 0
- Decision type: technical
- Owner approval: not required (technical). Any edge that would let AI, clients, or infrastructure reach canonical authority is an invariant question and needs owner approval.

## Context

The architecture is a modular monolith with enforced module boundaries (invariant 23). The World Engine is the only canonical authority (invariant 1); AI cannot write canonical state (2); rules stay deterministic (8–9); providers are replaceable (21); clients never call AI providers (22). Boundaries must be machine-checked, not only documented, and must keep AI context small (`AGENTS.md`).

## Options considered

1. **Documentation only** — drifts silently.
2. **Dedicated tools (dependency-cruiser, Nx module boundaries, eslint-plugin-boundaries)** — capable, but more configuration and dependencies than six packages need today.
3. **Package manifests + `exports` + TypeScript `rootDir` + ESLint `no-restricted-imports`, driven by one declared graph and covered by tests** — uses tools already present.

## Decision

Option 3. The graph is declared once in `workspace-boundaries.json`:

```text
@ltw/contracts  -> (nothing)
@ltw/domain     -> contracts
@ltw/rules      -> domain, contracts
@ltw/ui         -> contracts
@ltw/server     -> domain, rules, contracts      (composition root; only place for I/O)
@ltw/web        -> ui, contracts                  (talks to the server API only)
```

Enforcement layers:

1. **Public entry only.** Each library package's `exports` exposes only `.`; deep imports (`@ltw/x/src/...`) fail to resolve and are also lint errors.
2. **No relative escapes.** Each project's `tsconfig.build.json` sets `rootDir: src`, so a relative import into another package fails the build.
3. **Direction and forbidden modules.** `eslint.config.js` derives `no-restricted-imports` rules from the graph: disallowed workspace packages, plus forbidden module groups — AI provider SDKs, persistence drivers, and server I/O (`node:fs`, `node:http`, `pino`, …) — for `contracts`, `domain`, `rules`, `ui`, and `web`.
4. **Tests.** `tests/architecture/` verifies manifests against the graph (declared dependencies, acyclicity, single entry point, build wiring) and lints probe imports to prove the ESLint rules are wired.

Conventions inside a package:

- Organize by cohesive feature/domain folder (for example `src/knowledge/`, later), not by technical layer across the whole package.
- Import concrete files directly (`./claims/claim.ts`). `src/index.ts` is the package's only barrel and lists its deliberate public API; do not add internal barrels.
- Keep files at or below 500 lines (700 hard limit, enforced by `pnpm context-budget`). Split along a cohesive boundary rather than adding exclusions.
- `apps/server/src/platform/` holds cross-cutting infrastructure (config, logging, db). Domain modules never import it; the server composes them.

## Consequences

- Adding an edge means editing `workspace-boundaries.json`, the package manifest, and (if building against it) the project's `tsconfig.build.json` `references`; the architecture tests fail until all agree.
- Where AI orchestration code lives (server module vs separate package) is decided at Stage 100; it must not gain a write path that bypasses the World Engine.
- The web client framework is chosen by ADR at Stage 200.

## Amendments

- 2026-10-03 (Stage 50, ADR 0012): new package `@ltw/context -> rules, domain, contracts` (pure; same forbidden groups as `rules`); `@ltw/server` may also depend on `@ltw/context`. Clients still may not. No existing edge changed.
- 2026-10-04 (Stage 80, ADR 0015): new package `@ltw/combat -> rules, domain, contracts` (pure; same forbidden groups as `rules`). `@ltw/context` and `@ltw/server` may also depend on `@ltw/combat`; clients may not. The domain reaches combat only through its `CombatPort`, injected by the server. No existing edge changed.

## Invariants affected

Preserves 1, 2, 8, 9, 21, 22, 23 by making the forbidden dependency paths fail lint and tests.

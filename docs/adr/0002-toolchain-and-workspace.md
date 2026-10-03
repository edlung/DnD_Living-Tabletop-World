# 0002. Toolchain and workspace layout

- Status: Accepted
- Date: 2026-10-03
- Stage: 0
- Decision type: technical
- Owner approval: not required (technical)

## Context

Stage 0 requires strict TypeScript, reproducible installs, formatting, linting, typechecking, tests, and a build for a modular monolith (`ARCHITECTURE.md` → Deployment; invariant 23). The choices should be mainstream, reversible, and friendly to small, focused files.

## Options considered

1. **Package manager:** pnpm workspaces (strict `node_modules`, so undeclared dependencies fail to resolve; supply-chain release-age policy on by default in pnpm 11) vs npm workspaces (hoisting hides undeclared dependencies) vs Nx/Turborepo (orchestration we do not need yet).
2. **TypeScript:** 7.0 (native compiler, newest) vs 6.0 (last JavaScript-API release). `typescript-eslint` 8.x supports `typescript <6.1`, so type-aware linting requires 6.0.
3. **Test runner:** Vitest 4 vs Vitest 5 vs `node:test`. Vitest 5's `engines` exclude Node 25 (the current local runtime); Vitest 4 supports Node 20/22/24+. `node:test` lacks projects and good TypeScript ergonomics.
4. **Build:** `tsc -b` project references vs a bundler. Nothing needs bundling before the web client stage.

## Decision

- **Node.js 24 LTS** (`.node-version`, used by CI); `engines: >=24` so newer local runtimes work.
- **pnpm 11** workspaces (`packageManager` pinned), with `pnpm-lock.yaml` committed and `--frozen-lockfile` in CI. The default minimum-release-age policy stays on; do not add exclusions to bypass it.
- **TypeScript ~6.0** with a strict base (`tsconfig.base.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `erasableSyntaxOnly`). Revisit TypeScript 7 when `typescript-eslint` supports it.
- **Relative imports use `.ts` extensions** (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`). Emitted JS uses `.js`; sources also run directly under Node's type stripping (scripts, `pnpm dev:server`). `erasableSyntaxOnly` forbids enums, namespaces, and parameter properties so that stays true.
- **Typecheck** with one whole-repository program (`tsconfig.json`, no emit, includes tests). **Build** with `tsc -b tsconfig.build.json`, which references each project's `tsconfig.build.json` (tests excluded, `rootDir: src`).
- **Workspace packages** export `{"@ltw/source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js"}`. Typecheck and Vitest resolve the `@ltw/source` condition (source, no prior build); builds and Node runtime resolve `dist`. Verified in Stage 0 with a temporary cross-package probe (not retained).
- **Vitest 4** with two projects: `unit` (no external services) and `integration` (`*.integration.test.ts`, PostgreSQL).
- **ESLint 10** flat config with `typescript-eslint` `strictTypeChecked`, plus `eslint-config-prettier`; **Prettier 3** owns formatting. Owner-authored Development Pack Markdown is excluded from Prettier.

## Consequences

- No bundler, framework, ORM, or HTTP framework is chosen yet; each is decided at the stage that needs it.
- Upgrading to TypeScript 7 or Vitest 5 is a dependency bump plus re-validation, not an architecture change.

## Invariants affected

None weakened. Supports invariant 23 (modular monolith) via workspace packages with enforced boundaries (ADR 0004).

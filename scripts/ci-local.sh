#!/usr/bin/env bash
# CI-equivalent local validation: mirrors .github/workflows/ci.yml step for step,
# using the docker-compose PostgreSQL instead of the CI service container.
set -euo pipefail
cd "$(dirname "$0")/.."

export NODE_ENV=test

step() { printf '\n==> %s\n' "$1"; }

step 'Install (frozen lockfile)';  pnpm install --frozen-lockfile
step 'Start PostgreSQL';           pnpm run db:up
step 'Format check';               pnpm run format:check
step 'Lint';                       pnpm run lint
step 'Typecheck';                  pnpm run typecheck
step 'Context budget';             pnpm run context-budget
step 'Unit tests';                 pnpm run test
step 'Clean build';                pnpm run clean && pnpm run build
step 'Migrate (bootstrap)';        pnpm run db:migrate
step 'Migrate again (idempotent)'; pnpm run db:migrate
step 'Seed Ravenford';             pnpm run seed:ravenford
step 'Seed again (idempotent)';    pnpm run seed:ravenford
step 'Integration tests';          pnpm run test:integration

printf '\nCI-equivalent validation passed.\n'

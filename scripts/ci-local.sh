#!/usr/bin/env bash
# CI-equivalent local validation: every step of .github/workflows/ci.yml, in sequence, using the
# docker-compose PostgreSQL instead of the CI service container. Hosted CI runs them as parallel
# jobs, each on a fresh checkout (so its build is a clean one):
#   Static checks                Format check, Lint, Typecheck, Context budget
#   Unit tests                   Unit tests
#   Build and integration tests  Build, Migrate twice, Seed twice, Integration tests
#   UI and API journeys (i/3)    Build, Chromium, a third of the journeys (--shard=i/3); here
#                                one run of all of them, on the build above
#   Deployment check             deploy/verify/ci.sh (LTW_SKIP_DEPLOY_CHECK=1 skips it here)
#   CI passed                    fails unless every job above succeeded; nothing to run here
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
step 'Chromium for UI journeys';  pnpm exec playwright install chromium
step 'UI and API journeys';       pnpm run test:e2e
# The CI workflow's Deployment check (Docker, free ports 80/443); LTW_SKIP_DEPLOY_CHECK=1 skips it.
if [ "${LTW_SKIP_DEPLOY_CHECK:-}" != 1 ]; then
  step 'Deployment check';         bash deploy/verify/ci.sh
fi

printf '\nCI-equivalent validation passed.\n'

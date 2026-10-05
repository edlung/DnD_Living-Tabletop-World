# Stage 200 — UX foundation

- Date: 2026-10-04 (Europe/Oslo).
- Status: **COMPLETE**. Stage 210 is not authorized or started.
- Work order: `work-orders/OPUS_STAGE_200.md`.
- Prerequisite: Gate 05 **PASS**, `reviews/ASTRA_GATE_05_RETEST_2.md`; no open findings.
- Starting revision: `5cdd5bb4ece280045286b76bfde32f6403e256d4`.
- Delivery: committed as `a36ba3f` (parent `5cdd5bb`); the build below is that
  tree. No existing user changes were present at start.
- Model exception: the owner explicitly authorized the current GPT model in this
  chat instead of Opus 5.5/HIGH. Future model/gate requirements are unchanged.
- Technical decision: `docs/adr/0026-ux-foundation.md`.

## Delivered

- React/Vite Player/DM application with local-token sign-in, server-derived
  perspective choices, shared scene shell, location viewing, entity selection,
  scoped contextual options, and progressive disclosure of knowledge and sheets.
- Current scene/visual, Context, Knowledge, Memory/event-source, session,
  Combat, and Reaction projections come from the real HTTP API. No frontend
  rule calculation, canonical mutation, direct AI access, or required AI chat.
- Full character sheets expose every authorized current field. DM NPC/creature
  sheets are also reachable when present. Nested fields are explicitly copied
  by the server; hidden concentration targets remain hidden.
- Loading, empty, unavailable-image, and failure/retry states. Perspective
  changes clear selected data immediately, including hidden dropdown options;
  late success/failure cannot restore an earlier perspective or selection.
- Memory-only credentials, no-store requests, bounded timeouts, no redirect or
  cookie forwarding, effective-perspective checks, and revocable image URLs.
- Browser harness uses real in-memory World Engine/HTTP contracts with no AI
  provider. An isolated combat campaign reaches a real Counterspell window.
- Local and hosted CI include browser journeys. Context maps and nested agent
  guidance route future UI work to focused modules.

## Changed entry points

| Concern           | Files                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Client/session    | `apps/web/AGENTS.md`, `src/main.tsx`, `src/session/`, `src/api/`                                                                             |
| Scene and details | `apps/web/src/world/`, `src/styles/`                                                                                                         |
| Shared UI         | `packages/ui/src/character-sheet-details.tsx`, `knowledge-details.tsx`, `encounter-summary.tsx`, `status-panel.tsx`                          |
| Session API       | `packages/domain/src/knowledge/session.ts`, `apps/server/src/http/routes/session-routes.ts`, `packages/contracts/src/session/views.ts`       |
| Authorized sheets | `packages/domain/src/character/view.ts`, `apps/server/src/http/routes/character-routes.ts`, `packages/contracts/src/rules/character-view.ts` |
| Browser evidence  | `tests/e2e/AGENTS.md`, `playwright.config.ts`, `apps/server/src/testing/ui-server.ts`, `ui-campaigns.ts`                                     |
| Tooling/docs      | Workspace manifests/lockfile and TypeScript configuration; `README.md`, ADR 0026, context/gate maps, local CI, GitHub CI                     |

## Validation

The final `pnpm validate` command exited **0**. Its checks, in order:

| Check                   | Result                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| `pnpm format:check`     | PASS                                                                          |
| `pnpm lint`             | PASS, zero warnings                                                           |
| `pnpm typecheck`        | PASS                                                                          |
| `pnpm context-budget`   | PASS, 512 active files; zero above 500 or 700 lines                           |
| `pnpm test`             | PASS, 157 files / 1,541 tests, including earlier gate regressions             |
| `pnpm build`            | PASS, TypeScript workspace plus Vite browser bundle                           |
| `pnpm db:migrate`       | PASS, four existing migrations; none pending                                  |
| `pnpm seed:ravenford`   | PASS, zero new submissions / 91 duplicates; existing local campaign preserved |
| `pnpm test:integration` | PASS, 20 files / 77 tests against PostgreSQL                                  |
| `pnpm test:e2e`         | PASS, 23 Chromium journeys                                                    |

Also passed: `pnpm install --frozen-lockfile` and `git diff --check`.
Runtime: Node 25.8.1, pnpm 11.11.0, PostgreSQL 18. Hosted CI is configured
for Node 24, but was not executed remotely during this task.

Browser journeys verify Player/DM secrecy in responses and the complete DOM;
hidden character names/IDs in perspective choices; delayed, failed, and stale
perspective responses; scene loading and recovery; selection races; complete
Elowen and DM NPC sheets; logout, account/campaign changes, refresh/reload and
Back/Forward navigation; narrow layouts and keyboard disclosure; and a real
encounter/reaction with DM-only spell/stat fields absent from Player views.
Persisted BFCache restoration is not separately certified.

Manual UI/API smoke: `pnpm dev:server` on 3000 and `pnpm dev:web` on 5173,
using the persistent local PostgreSQL campaign. Inspected sign-in, scene,
selection and full character sheet in the in-app browser at narrow and 1280px
desktop widths. Fixed initial scroll position after sign-in during this check.

## Build identifier

Successful final bundle (`apps/web/build`, generated and ignored):

- `assets/index-qenmz_Ni.js` — SHA-256
  `3e3fe33b8fd042b6459bafc97b765accccfd5c79a8a20607e11b602bfd91e63c`.
- `assets/index-Dj3sb0KJ.css` — SHA-256
  `488b6a1189dfee31a0bb5e25d7c9cfef5fd187eb30e6825ac8faf3074f33009a`.

Reproduce with `pnpm install --frozen-lockfile`,
`pnpm exec playwright install chromium`, `pnpm db:up`, and `pnpm validate`.
Inspect build hashes with `shasum -a 256 apps/web/build/assets/*`.
To run the interface, use `pnpm dev:server` and `pnpm dev:web` in separate
terminals; tokens and the exact local steps are in `README.md`.

## Scope, review and limitations

No prior reviewed authorization, canonical mutation, or projection contract was
changed. The added strict reads and UI consumers have deterministic introduction
coverage under `docs/GATE_COVERAGE.md`; no gate is reopened and no claim is made
that Gate 05 certified this frontend. An independent implementation review found
and verified fixes for retained DM character options, unreachable DM NPC sheets,
and badge styling; it was not a formal Astra checkpoint.

This is a local UX foundation. Production authentication and the Stage 250 target
remain undecided. Stage 210's object-first interactions, Stage 220's battlefield
and reaction actions, and Stage 230's authoring workflows are not implemented.
Existing options and combat/reaction states are read-only. World refresh is
explicit; there is no live event subscription. Missing approved scene images use
an honest neutral fallback. Pending allocation of Day 2, Chronicle/flashback,
time advancement, and Tomas performance remains in the prerequisites document.

Stage 200 is complete. Stop here; Stage 210 requires explicit owner authorization.

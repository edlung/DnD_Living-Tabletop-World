# Checkpoint Handoff — ten original campaigns

- Gate: owner-requested local campaign delivery, 2026-11-08; no numbered product stage.
- Type: INITIAL.
- Completed stage: N/A — authored content and isolated integration under the scoped work order.
- Revision/build: `c61e12f5a2ac49d1e7391155cbc69d8a00e6dff2cef5131ff9fb7e2b0b94cf26`.
- Prior report / remediation / retest number: N/A. Intermediate checks are retained as evidence.
- Report: `reports/TEN_CAMPAIGNS_2026-11-08.md`.
- Session model: current Codex session integrated and verified; each of ten authors was
  separately configured as `gpt-6-astra`, effort `max`, as explicitly requested by the owner.
- Approved design: owner's request and clarifications in this chat; scoped work-order SHA-256
  `08b81923670ce62546a9f6f20161093f7922efd710b3d5f30eee543874335a15`.
- Dirty-file/package identity: `reports/evidence/ten-campaigns-2026-11-08/delivery-manifest.json`.
  Other sessions' uncommitted content and runtime edits are preserved.
- Status: technical delivery **PASS**; available for owner disposition. Human playtest **NOT_RUN**.
  No technical work or intermediate approval remains pending within this request.

## Objective

Deliver ten distinct Russian campaigns for five–eight or six–eight players plus a DM,
including four strictly 21+ campaigns, with eight developed sessions and eight heroes each.
Keep canonical World Engine authority, scoped knowledge and honest unplayed futures while
providing native packages, offline books, separate player exports and usable tactical maps.

## Authoritative Documents

- `work-orders/TEN_CAMPAIGNS_2026-11-08.md`
- `ARCHITECTURE_INVARIANTS.md`
- `AGENT_WORKFLOW.md`, `docs/PROJECT_WORKFLOW.md`, `docs/GATE_COVERAGE.md`
- `campaigns/collection-2026/AGENTS.md`, `campaigns/collection-2026/DISTINCTNESS.md`
- `scripts/campaign-collection/CONTENT_CONTRACT.md`

## Surfaces to Attack

- API/routes: existing public application interfaces exercised in `play.test.ts` using
  the isolated `play-fixture.ts`; no real database, invitation or activation.
- CLI: native compiler and actual workshop file parser through `package.test.ts`.
- UI: `campaigns/collection-2026/index.html`, individual DM/player/session/handout pages,
  all local links and SVG maps. Player pages and released handouts are portable single files.
- Logs/traces: `tests.json`, `layout.json`, `layout-ash-testament.json`, `layout-inputs.json`
  `layout-last-orbit.json`, `npc-negation-before.json` and `other-session-checks.json` under the evidence directory.

## Start / Reproduce

```sh
node --conditions=@ltw/source scripts/campaign-collection/build.ts
node --conditions=@ltw/source scripts/campaign-collection/render.ts
pnpm exec vitest run --project unit scripts/campaign-collection --maxWorkers=1
pnpm exec tsc -p scripts/campaign-collection/tsconfig.json
pnpm exec eslint scripts/campaign-collection --max-warnings=0
pnpm exec prettier --check scripts/campaign-collection campaigns/collection-2026
pnpm run typecheck
pnpm run context-budget
node scripts/campaign-collection/audit.ts /absolute/path/to/ui-layout-audit/audit.mjs
```

The audit takes the installed skill's auditor path, rather than embedding a user's path.
Its optional trailing campaign slugs limit a retest. Chromium needs a narrowly permitted
headless launch on this macOS sandbox. Tests need the current shared checkout, including
the family session's workshop parser and prepared-encounter runtime; the content ZIP is not an app.

## Test Personas / Scopes

In-memory DM, one assigned PLAYER, PARTY, PUBLIC, individual CHARACTER, NPC holders and
an unrelated outsider. All identities are test fixtures. No production credentials are needed.

## Canonical Secret or Invariant Under Test

Initial player projections exclude DM truth, NPC private testimony and locked handouts.
Inspection reveals only the corresponding clue. Native preparation creates no future played
history, combat or membership. NPC knowledge does not become global knowledge. Optional
seats cannot be required to obtain an essential clue. The chosen party occupies distinct cells;
only characters actually present at an encounter location enter combat.

## Validation Run

| Check                                          | Observed result                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| All supported native variants                  | 34 READY; default packages byte-identical to six-player variants                |
| Package, real in-memory play and export suites | 41/41 PASS                                                                      |
| Workshop parser limit                          | All accepted; largest file 336,087 bytes < 524,288                              |
| Full layout audit                              | 183 pages, 732 width states, zero findings/errors                               |
| Final Ash copyedit retest                      | 19 pages, 76 states, zero findings; all other HTML/CSS unchanged                |
| Last Orbit knowledge correction retest         | 17 pages, 68 states, zero findings                                              |
| Scoped TypeScript / ESLint / Prettier          | PASS                                                                            |
| Whole-project TypeScript / context budget      | PASS; 1,902 active files, zero over target/hard ceiling                         |
| Visual inspection                              | Catalog, books, sessions, players and coordinate grids at desktop/mobile widths |

## Coverage Ledger

This content delivery adds no runtime route or numbered-stage feature. Under
`docs/GATE_COVERAGE.md`, relevant existing boundaries are exercised without claiming a new
global gate pass or relabelling unimplemented/future work as tested.

| Due surface in this scope                                              | Reproducible access                             | Disposition                               |
| ---------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Canonical package schema, references, rules and temporal preparation   | `package.test.ts`                               | PASS for all 34 variants                  |
| PUBLIC/PARTY/CHARACTER/NPC/DM isolation                                | `package.test.ts`, `play.test.ts`               | PASS for this collection                  |
| Publication and player actions through existing application interfaces | `play.test.ts`                                  | PASS in memory only                       |
| Encounter access, eight-player start and repeated start                | `play.test.ts`                                  | PASS                                      |
| Offline player exports and local links                                 | `exports.test.ts`                               | PASS                                      |
| Book layout and coordinate maps                                        | `audit.ts`, screenshots and layout input hashes | PASS                                      |
| Human pacing, excitement and combat balance                            | Actual group play                               | NOT_RUN; not a technical acceptance claim |
| Deployment, live provider generation, production DB/activation         | Outside this local content request              | NOT_RUN; no new future stage authorized   |

## Adversarial Pass

Invalid party sizes, omitted heroes, initial secret exposure, foreign/PLAYER access to DM
encounter operations, repeated combat start, unplayed future events and file-size limits were
checked. Fixed stale Carnival package bytes, terrain-coordinate mismatches, ambiguous repeated
enemy scaling and a potential duplicate winter-night charge. No obsolete handouts/maps remain. A late runtime counterexample found negated secrets
in Last Orbit NPC facts. Those ignorance notes moved to DM-only directions. All 83 actual
NPC knowledge projections now pass; the previous failure is preserved in `npc-negation-before.json`.
Plot comparisons and independent audit coverage are recorded separately; shared rules or
table procedures are not asserted to make stories identical.

## Known Limitations

No human playtest or acceptance, deployment, real campaign activation, live provider job or
generated raster art. Genre actions and large-scale war/supply procedures remain DM-adjudicated.
The complete local directory is DM-private; separate player exports are not a security boundary
for publishing the whole directory. Neighbouring collections are still being written, so later
unavailable plots have no originality verdict. The full repository `pnpm validate` was not run
because it includes database mutations and unfinished parallel collections.

## Required Output

The report, catalog, full content archive and exact manifest are delivered. Work stops at this
completed scope; no later product stage or publication is started. Technical **PASS** with the
human-playtest and external-surface limits above.

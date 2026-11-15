# Family campaign delivery handoff

- Gate: Family campaign content and integration delivery, 2026-11-08
- Type: INITIAL
- Completed scope: `work-orders/FAMILY_CAMPAIGN_2026-11-08.md`; no new numbered product stage
- Base revision: `e69c3290ca34cbde4a837591bfb477b899581142`; delivered changes are uncommitted
- Prior report / remediation: N/A, first delivery under the current owner goal
- Report: `reports/FAMILY_CAMPAIGN_2026-11-08.md`
- Session model: the model selected in this Codex session; no delegated writer/reviewer
- Authority: the owner's active goal and answers: one adult DM, three players; wonder,
  mysteries, humour and an affecting ending. The scoped work order has SHA-256
  `2eb691b1d91dc4f021831a94bdd4c2535b87f0975d24d5a6432a2e5556864d2a`.
- Dirty-file/package identity: `reports/evidence/family-campaign-2026-11-08/file-identity.json`.
  It records every changed/new file relative to the base, excluding itself, including this handoff.
- Status: AWAITING_OWNER_DISPOSITION. Technical results are in the report; no human play
  acceptance, real activation or deployment is asserted.

## Objective

Deliver an original, illustrated Russian adventure with a complete playable beginning, middle,
climax and epilogue for three players and one adult DM. Content can be read locally; the native
package must use the existing owner revision, compiler and activation boundaries. Imported art
must bind to the exact authored scenario and remain subject to ordinary knowledge projections.
Prepared encounters and layout corrections must preserve World Engine authority and player agency.

## Authoritative documents

- `AGENTS.md`, `AGENT_WORKFLOW.md`, `docs/PROJECT_WORKFLOW.md`
- `ARCHITECTURE_INVARIANTS.md`, `docs/GATE_COVERAGE.md`
- `work-orders/FAMILY_CAMPAIGN_2026-11-08.md`
- `apps/server/src/campaigns/AGENTS.md`, `apps/web/src/workshop/AGENTS.md`
- `campaigns/lighthouse/AGENTS.md`, `scripts/lighthouse/AGENTS.md`
- `campaigns/lighthouse/README.md`, authored source JSON and asset provenance manifest

## Surfaces to attack

- API/routes: existing owner draft revision append, server-assigned identities and assessment;
  DM prepared-encounter list/start for immutable activated content; scoped image manifests/bytes.
- CLI/test harness: exact-package art matching, strict content-file parser, ordinary curated
  worker/approval path, publication-gated memory activation and actual domain commands.
- UI: empty-draft file picker/preview/save, uncertain retry, stale draft, owner lifecycle,
  separate activation; fixed turn tray and outcome reservation across viewport sizes.
- Logs/traces: retained evidence has measurements and selected screenshots only. Authentication
  material and generated browser traces are excluded from delivery evidence.

## Start / reproduce

From the repository root:

```sh
pnpm lighthouse:build
pnpm lighthouse:book
pnpm lighthouse:art
pnpm lighthouse:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm context-budget
pnpm test
pnpm build
# PostgreSQL checks use an explicitly configured disposable local DATABASE_URL and NODE_ENV=test.
pnpm test:integration
pnpm test:e2e
```

Open `campaigns/lighthouse/index.html` directly in a browser; no server or network is needed.
For the native journey, create an empty Russian owner draft and choose Scenario → import the
pack's `package.json` → preview → save. READY is a compiler result, not permission to activate.
The usual activation screen retains its separate confirmation. The README describes all party
variants, player invitations and the optional operator art transfer after activation. The art
tool's default mode is read-only; its explicit confirmation is not part of this automated delivery.

## Test personas / scopes

The family fixture creates in-memory DM, player assigned to Finn, and outsider personas; it uses
normal owner revision save, consent, activation worker and campaign publication. All three-hero
combinations and the four-hero variant compile. Browser tests own dedicated invitation-mode
fixtures; the resize test reads the existing immutable combat-preview fixture. No production
credentials or real family accounts are used.

## Canonical secret or invariant under test

Later revelations and Severin's secret must not be in opening PUBLIC/PARTY/player records or
accessible image bytes. NPC knowledge is individually scoped. A local full DM book is a private
artifact, not an authentication boundary. The world starts at the opening, with no future combat,
discovery, remembered victory or completed ending. Owners still explicitly choose revisions,
activation, prepared fights and narrative mutations. Three players can resolve every finale path.

## Validation run

The report and retained verification JSON contain exact totals and final status. The initial
full validation passed static, unit, build and PostgreSQL checks; two browser live-update waits
failed. They passed in the focused 16-test rerun. A distinct native ResizeObserver regression was
reproduced before the layout fix and passed after it. The next full browser run passed 244/245;
its remaining failure was a new incorrect test selector, then fixed and verified by a passing
10-test dice/resize run. All 245 unique browser cases have passing coverage across these runs;
no single entirely green full invocation is asserted. Initial failures are preserved separately.

| Check                                       | Result                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Native compiler and all party variants      | READY; zero findings                                                                     |
| Family package/play/art/integrity tests     | 9 PASS                                                                                   |
| Full unit suite                             | 3,605 PASS / 410 files                                                                   |
| PostgreSQL integration                      | 369 PASS / 71 files; temporary DB dropped                                                |
| Complete browser follow-up                  | 244 PASS / 1 test-selector failure, subsequently corrected                               |
| Final dice and resize regression run        | 10 PASS / 22.4s                                                                          |
| Book and import measured layout             | 40 + 4 views, zero errors/warnings; axe passed                                           |
| Typecheck, format, context budget and build | PASS; existing large-chunk advisory retained                                             |
| ESLint                                      | Full scan plus scoped recheck after one new test-style correction; no remaining findings |
| Diff whitespace                             | PASS                                                                                     |

## Coverage ledger

| Due surface                                                            | Reproducible evidence                                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Authored content, all party variants and real materialization          | `scripts/lighthouse/package.test.ts`                                                                |
| Normal activation, immutable initial content and published engine      | `scripts/lighthouse/play-fixture.ts`, family play/art tests                                         |
| Every essential clue and optional prepared encounters                  | `scripts/lighthouse/play.test.ts`                                                                   |
| Edited source refusal, exact art bytes, hidden image access and repeat | `scripts/lighthouse/art.test.ts`                                                                    |
| Generated package parity, all local links and 30 raster asset hashes   | `scripts/lighthouse/integrity.test.ts`                                                              |
| Content-only file schema/size and malformed/forged input               | `apps/web/src/workshop/package-file.test.ts`                                                        |
| Owner file import, preview and uncertain response retry                | `tests/e2e/workshop-package-import.spec.ts`                                                         |
| Owner isolation, activation and existing runtime boundaries            | Full unit/integration/browser regressions; existing Gate 07 history retained                        |
| Responsive book / import and accessibility                             | `book-layout.json`, `import-layout.json`, selected screenshots                                      |
| Native resize feedback, result overlay and turn tray                   | `resize-feedback.spec.ts`, `outcome-layer.spec.ts`, `phone-layout.spec.ts`, `combat-narrow.spec.ts` |

No prior gate report is rewritten. This adds a content-only UI consumer of existing owner
revision APIs and a digest-bound reader of existing activated scenarios; it does not relax a
protected contract. Paid providers, deployment, real owner activation and human family play are
not claimed as tested. A public player-hosting surface is outside this delivery's scope.

## Adversarial pass

Malformed/oversized packages, source/identity forgery, stale revisions and uncertain transport;
wrong/other scenario digest, outsider/player encounter access; hidden art by exact identity/hash,
edited source art mapping and repeat import. All required boundaries held in the automated
checks. Editorial checks covered unrolled essential clues, alternate sources, recovery paths,
three-player finale tasks, voluntary outcomes and epilogues tied to actual choices.

## Known limitations

The actual family has not played the campaign. Timing, balance, humour and emotional effect are
authored judgments awaiting human play. The operator art importer accepts only an exact delivered
package; edited scenarios require a reviewed mapping. Mixed neutral-side prepared encounters use
manual combat tools. Runtime activation, art transfer and deployment have not been performed.

## Required output

The linked completion report records the technical verdict and honest limits. This is the final
handoff for owner review/play; no further product stage or publication is started by this delivery.

# Astra Gate Handoff Request

- Gate: #5 — Full Ravenford Red Team (the review activity called Stage 190)
- Review type: RETEST
- Completed stage: 180 (Full Ravenford Integration). Gate 05 reviews the integrated backend of Stages 0–180. Every row of `docs/GATE_COVERAGE.md` is due, including the regressions from Gates 01–04.
- Revision/commit: `a85b6f87f1dbd5ed8287e294acc6d18b191e5904` (remediated code under retest, branch `main`). It follows `a89a2d5`, which added only the genuine earlier-writer histories `fixtures/history/a488de4-cited-examinations.json` and `fixtures/history/a488de4-cited-examination-undone.json`. Later commits on `main` add only the remediation report, this updated request, and the README status line. Earlier reviews: code `e9c05ad` (initial), `a488de4` (retest 1).
- Prior reports / remediation / retest number:
  - `reviews/ASTRA_GATE_05_REPORT.md` (FAIL: G05-H01 High, G05-M01 Medium), with its evidence under `reviews/evidence/gate-05/`;
  - `reviews/ASTRA_GATE_05_RETEST_1.md` (FAIL: G05-H02 High; G05-H01 and G05-M01 closed), with its evidence under `reviews/evidence/gate-05/retest-1/`;
  - remediation: `remediation/OPUS_GATE_05_REMEDIATION.md` (see its "Remediation for Retest 2" section);
  - this is retest 2.
  - Gate 04 passed at retest 1 (`reviews/ASTRA_GATE_04_RETEST_1.md`, revision `987c223`), Gate 03 at retest 4, Gate 02 at retest 2, and Gate 01 initially.
- Required output path: `reviews/ASTRA_GATE_05_RETEST_2.md`
- Requested Astra effort: MAX
- Status: AWAITING_ASTRA_RETEST

## Review Objective

**Retest scope.**

- Independently retest G05-H02 and its adjacent attack paths:
  - undo, beneath a standing chapter, of any command whose event it tells, whatever that command changed: repeated inspections, first inspections of things without clues, and every other event type the DM's salience table tells;
  - uncited examinations that changed nothing stay undoable (outside a chapter's window, told from memories only, or after it);
  - every source a standing chapter resolves (memory, knowledge, event) for every perspective;
  - refusal naming the chapter, atomicity, restart, chapter-first recovery, re-decision equality, replay, and integrity, which now requires that a standing chapter tells only events of standing commands.

  Also check chapters earlier writers recorded:
  - version 3, `fixtures/history/a488de4-cited-examinations.json`: read and displayed as stored, undo beneath it refused, recovery chapter first;
  - `fixtures/history/a488de4-cited-examination-undone.json`, where that writer accepted the undo: read as recorded, integrity names the entry left without its source, the earlier-writers audit names the undo, and undoing the chapter recovers;
  - version 2, `fixtures/history/e9c05ad-chronicle-names.json`.

- Recheck that G05-H01 and G05-M01 remain closed.
- The remediation is described in `remediation/OPUS_GATE_05_REMEDIATION.md`; treat its claims as non-authoritative.
- The retest 1 recipe `reviews/evidence/gate-05/retest-1/SOURCE_OCCURRENCE_PROBES.md` asserted the defect. On the remediated code it first stops at its expectation that a new chapter is version 3 (it is now 4). With that expectation alone changed, it stops at the source undo, which is refused.
- Recheck that what held at retest 1 still holds, since `ChronicleGenerated` changed version again and undo now counts the target command's standing among what it wrote.

The original Gate 05 objectives below still apply.

Break Ravenford across:

- knowledge;
- permissions;
- timeline;
- rules;
- state mutation;
- event ordering and replay;
- concurrency;
- rollback;
- NPC isolation;
- AI hallucination;
- continuity;
- provenance;
- asset identity;
- world-history reconstruction.

Run two passes:

- **(A) invariant-directed attacks**, using `ARCHITECTURE_INVARIANTS.md` and `ADVERSARIAL_TESTS.md`;
- **(B) emergent attacks** not suggested by any predefined list.

Attack the public and test surfaces without modifying source.

Since Gate 04, Stages 140–180 added these surfaces:

- AI relevance;
- asset identity;
- world visual state and weather;
- the Chronicle;
- the quest projection;
- the integrated slice.

They interact with every earlier surface. Prioritize invariant violations over cosmetic findings.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md`
- `RAVENFORD_SPEC.md`, `ADVERSARIAL_TESTS.md`, `PRODUCT_BLUEPRINT.md`, and `ARCHITECTURE.md` (the sections named by the coverage rows below)
- `docs/GATE_COVERAGE.md`, `docs/IMPLEMENTATION_PREREQUISITES.md`
- ADRs `docs/adr/0006`–`0025`, with their amendments; the index is `docs/adr/README.md`. The ADRs of the surfaces new since Gate 04 are:
  - 0021 (relevance);
  - 0022 (assets);
  - 0023 (visual state);
  - 0024 (Chronicle);
  - 0025 (integration, the semantics ledger, and quests).
- Earlier gate reports and retests under `reviews/` and their remediations under `remediation/`, for regression intent.

## Surfaces Available to Reviewer

- **API/routes**: Fastify app, `apps/server/src/http/routes/`. Every route is scoped to `/campaigns/:campaignId` and requires a persona token (`Authorization: Bearer …`).
  - **Knowledge:**
    - `GET /knowledge?perspective=`
    - `GET /knowledge/:knowledgeId`
    - `GET /knowledge/:knowledgeId/related`
    - `GET /entities`
    - `GET /entities/:entityId/knowledge`
  - **Memory:**
    - `GET /memories?perspective=&q=&entity=&location=&from=&to=&kind=&session=&asOf=&limit=`
    - `GET /memories/:memoryId`
    - `GET /sessions`
  - **Context:** `GET /entities/:entityId/context?perspective=[&ranking=ai]`
  - **Commands:** `POST /commands` with `{ commandId, command, expectedVersion?, reason? }`. Its rules:
    - players may issue only their character's commands;
    - the route refuses `CreateCampaign`, `ApplyAuthoring`, and `GenerateChronicle`.
  - **Encounter:** `GET /encounter?perspective=`, `GET /encounter/suggestion` (DM)
  - **NPC dialogue:** `POST /npcs/:npcId/dialogue` with intents talk, ask, show, insight, and an optional `line`
  - **AI:** `POST /ai/intents` (DM), `GET /ai/traces/:traceId` (DM)
  - **Authoring:**
    - `POST /authoring/proposals`
    - `GET /authoring/proposals/:proposalId`
    - `POST /authoring/proposals/:proposalId/revisions`
    - `POST /authoring/proposals/:proposalId/commit`
    - `POST /authoring/proposals/:proposalId/undo`
  - **Assets:**
    - `GET /assets` (DM lineage)
    - `GET /entities/:entityId/assets?perspective=`
    - `GET /assets/content/:contentHash?perspective=[&at=]`
  - **Visual state:**
    - `GET /entities/:entityId/presentation?perspective=[&at=]`
    - `GET /locations/:locationId/scene?perspective=[&at=]`
  - **Chronicle:**
    - `POST /chronicle` (DM)
    - `GET /chronicle?perspective=`
    - `GET /chronicle/suggestions?scope=&from=&to=` (DM)
    - `GET /memories/:memoryId/flashback?perspective=`
  - **Quests:** `GET /quests?perspective=`
  - **Health:** `GET /healthz`, outside campaigns.
- **CLI/test harness**:
  - every suite: `pnpm test` (unit) and `pnpm test:integration` (PostgreSQL);
  - the played Ravenford slice: `apps/server/src/scenario/`, with support in `apps/server/src/testing/scenario/` (`RavenfordSession` drives the real HTTP app as DM, player, and outsider);
  - domain worlds for direct engine access in tests: `packages/*/src/**/testing/`;
  - the re-decision oracle: `redecideEffective` in `@ltw/domain`;
  - replay: `replay`, `parseRecordedEvent`;
  - integrity: `checkWorldIntegrity`.
- **UI**: none. Stages 200–240 introduce the clients; see the coverage ledger.
- **Logs/traces**:
  - server logs: pino JSON on stdout;
  - AI traces: the DM-only route, and the `ltw_ai_traces` table;
  - the event store: `ltw_events`, `ltw_commands`, `ltw_event_streams`;
  - authoring revisions: `ltw_authoring_revisions`;
  - asset contents: `ltw_asset_contents`. All of these tables are append-only.

## Start / Reproduce

```text
pnpm install --frozen-lockfile
pnpm db:up                      # PostgreSQL 18 from docker-compose.yml
pnpm build
pnpm db:migrate
pnpm seed:ravenford             # idempotent
pnpm dev:server                 # http://127.0.0.1:3000, AUTH_MODE=dev-personas by default outside production

# Suites
pnpm test                       # unit, including the played slice
pnpm test:integration           # PostgreSQL, including the slice with restart parity
pnpm validate:ci-local          # everything CI runs
pnpm vitest run --project unit apps/server/src/scenario
```

Optional settings:

- `ANTHROPIC_API_KEY` enables the Anthropic adapter. Without it, AI requests use the deterministic local providers, and relevance ranking has no provider.
- `LTW_ASSET_WORKER_INTERVAL_MS` (0 disables the worker) and `LTW_ASSET_TIMEOUT_MS`.
- `LTW_QUESTS_FILE`.
- `LTW_AI_RELEVANCE_BUDGET_MS`.

To reach Day 2, the DM runs the script in `fixtures/ravenford/day-two.json`; the road ambush is `fixtures/ravenford/road-ambush.json`. Gate 04's planted secrets (`fixtures/ravenford/npc-boundary.json`) are not seeded; the tests plant them, and a reviewer may plant them as the DM.

## Test Personas / Scopes

Tokens come from `fixtures/ravenford/personas.json`. They are development tokens, not secrets, and production refuses them.

- `dev-dm-ravenford`: the DM of `ravenford`. Any perspective: `DM`, `PUBLIC`, `PARTY`, `CHARACTER:<id>`, `NPC:<id>`.
- `dev-player-elowen`: plays Elowen Starwhisper, a party member. `PLAYER`, `CHARACTER:elowen-starwhisper`, `PARTY`, `PUBLIC`.
- `dev-outsider`: not a member of the campaign.

System actors (the asset worker) exist only inside the server; no token yields one.

## Canonical Secret or Invariant Under Test

- **Ravenford's canonical mystery truth.** It lives in the WORLD_TRUTH records of `fixtures/ravenford/knowledge-seed.json`:
  - the cargo;
  - the manipulated site;
  - the goblin frame;
  - the Ashen Circle and its symbol.
- **Other protected data:**
  - the DM notes;
  - every NPC's own records, Orin's SECRET above all;
  - other holders' memories;
  - the Ashen Circle's identity and opaque ID;
  - the markers planted by `fixtures/ravenford/npc-boundary.json`.
- **Integrity of the world itself:**
  - canonical state and history: replay, as-of reconstruction, and undo safety, including assets and chapters;
  - rules legality, Counterspell windows included;
  - the authoring pipeline;
  - provenance of AI output, which must never become canon.

The expected answers to every check are in the fixtures, ADRs, and tests; this request does not restate them.

## Validation Already Run by Opus

| Command                                                                            | Result                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` on `a85b6f8` (`NODE_ENV=test`, docker-compose PostgreSQL) | PASS (exit 0)                                                                                                                                           |
| Frozen install, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                 | PASS                                                                                                                                                    |
| Context budget                                                                     | PASS: 473 files, none over the limits                                                                                                                   |
| `pnpm test` (unit)                                                                 | PASS: 150 files, 1505 tests, including the played slice and the Gate 05 regressions (`gate05-h01`, `gate05-h02`, `gate05-m01`, the chronicle histories) |
| `pnpm build`, `pnpm db:migrate` ×2, `pnpm seed:ravenford` ×2                       | PASS                                                                                                                                                    |
| `pnpm test:integration` (PostgreSQL)                                               | PASS: 20 files, 77 tests, including `gate05-regressions` and `chronicle-history` with a restart                                                         |

## Known Limitations

- **Chapters recorded before the remediations** (`ChronicleGenerated` versions 2 and 3) rest on everything before them, as earlier writers' commands do: undo beneath one is refused until the DM undoes it (owner rule, ADR 0006 retest 3 amendment).
- **A history where the retest 1 writer accepted an undo beneath its chapter** keeps that undo. The re-decision oracle folds the version 3 chapter as recorded and reports nothing. Integrity names the entry left without its source, and the earlier-writers audit names the undo, also after the DM recovers by undoing the chapter. Only reviewers' throwaway databases are known to hold such a history.
- **AI has not been run against the live API.** No key is configured; the local providers answer every AI request, and the quality, latency, and cost of AI intents, NPC replies, relevance ranking, and Chronicle prose are unmeasured.
- **Images are local placeholders.** They are deterministic SVGs, and no external image provider exists.
- **One worker per server process.** Several server processes would duplicate generator calls; each step is an idempotent command.
- **No lock timeout.** Authoring proposal locks run on a 4-connection pool.
- **Views replay the whole history** on each request, with no caching. Performance is measured only by the suites.
- **No calendar:** there are no seasons, and day phases use fixed hours.
- **Heuristic checks.** Chronicle hedging is a lexical check, and memory suggestions are heuristic.
- **Development authentication only** (ADR 0009). The production environment is an open owner question (`docs/IMPLEMENTATION_PREREQUISITES.md`, Q4).
- **Determinism in the suites only.** The integration suites roll skill checks from a script and hold combat dice at their middle face. The production server uses cryptographic randomness.
- **The UI is not built** (Stages 200–240). The spec's Player Acceptance UI flows are not in scope. Which UX stage owns the return/Day 2, Chronicle and flashback, DM time, and Tomas performance UI remains an open planning allocation.

## Coverage Ledger

Every backend row of `docs/GATE_COVERAGE.md` is due at this gate. The access paths are the routes above, with the personas above.

| Row     | Due surface                                                                                                                                      | Reproducible access                                                                                                                                                      | Opus evidence (non-authoritative)                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20      | Knowledge projections for PLAYER, PARTY, PUBLIC, CHARACTER, DM, and NPC; missing, forged, and malformed scopes; relations; serialization; errors | Knowledge routes; `fixtures/ravenford/knowledge-boundary.json`                                                                                                           | `knowledge-boundary.test.ts`, `knowledge-access.test.ts`, `knowledge-api.integration.test.ts`                                                                                                                                                                                                                                       |
| 30      | Memory and temporal retrieval in scope, including indirect queries and impossible memories                                                       | Memory routes; `RecordMemory`; `fixtures/ravenford/memory-boundary.json`                                                                                                 | `memory-routes.test.ts`, `npc-memories-history.integration.test.ts`, domain memory suites                                                                                                                                                                                                                                           |
| 50–60   | Entity context and investigation: actions, reasons, evidence, hypotheses                                                                         | Context route; `EnterLocation`, `ExamineEntity`, `AskAbout`, `FormHypothesis`, `ShowEvidence`, `InsightCheck`                                                            | `context-routes.test.ts`, `investigation-routes.test.ts`, `gate02-regressions*.test.ts`                                                                                                                                                                                                                                             |
| 70      | Contradictions keep their types and reveal no truth                                                                                              | `SetClaim` (DM), `AskAbout`; knowledge routes                                                                                                                            | `contradiction-routes.test.ts`, domain contradiction suites                                                                                                                                                                                                                                                                         |
| 90      | Reaction eligibility, expiry, double-spend, concurrency, ordering and replay, undo                                                               | Encounter route; `StartCombat`, `CastSpell`, `UseReaction`, `DeclineReaction`, `CloseReactionWindow`                                                                     | `reaction-routes.test.ts`, `gate03-*` suites, `reaction.integration.test.ts`                                                                                                                                                                                                                                                        |
| 100–120 | AI contexts; proposals cannot bypass permission, validation, confirmation, continuity, atomicity, provenance, or safe undo                       | `POST /ai/intents`, AI traces, authoring proposal routes                                                                                                                 | `ai-routes.test.ts`, `authoring-*.test.ts`, `authoring.integration.test.ts`, `proposal-races.integration.test.ts`                                                                                                                                                                                                                   |
| 130     | NPC dialogue and actions: prompt injection, other NPCs' knowledge, DM truth, future events                                                       | Dialogue route; `GET /encounter/suggestion`; `npc-boundary.json`                                                                                                         | `npc-dialogue.test.ts`, `npc-isolation.test.ts`, `packages/ai` dialogue suites                                                                                                                                                                                                                                                      |
| 140     | AI relevance ranks only legal actions; the deterministic fallback                                                                                | `GET /entities/:id/context?ranking=ai`                                                                                                                                   | `context-ranking.test.ts`, `packages/ai/src/relevance.test.ts`                                                                                                                                                                                                                                                                      |
| 150–160 | Player-facing asset metadata, lineage, and historical visual state; asset jobs under the authoring undo policy                                   | Asset, presentation, and scene routes (`at`); `RequestAsset`, `ApproveAsset`, `RetractAsset`, `CancelAssetRequest`, `SetWeather`; the asset worker in the running server | `asset-routes.test.ts`, `visual-routes.test.ts`, `assets/*.test.ts`, `assets.integration.test.ts`, domain assets and visual suites                                                                                                                                                                                                  |
| 170     | Chronicle and flashbacks keep permitted knowledge and epistemic types, with traceable sources                                                    | Chronicle and flashback routes                                                                                                                                           | `chronicle-routes.test.ts`, `chronicle.integration.test.ts`, domain chronicle suites (with `gate05-h01.test.ts`, `gate05-h02.test.ts`), `packages/ai/src/chronicle.test.ts`, `chronicle-history.test.ts`, `chronicle-occurrence-history.test.ts`, `chronicle-history.integration.test.ts`, `gate05-regressions.integration.test.ts` |
| 180     | All backend surfaces integrated, with the Gate 01–04 regressions; Ravenford's command and event semantics, including the quest projection        | `GET /quests`; the whole slice in `apps/server/src/scenario/`                                                                                                            | `ravenford.test.ts`, `ravenford-ledger.test.ts`, `ravenford-acceptance.test.ts`, `ravenford.integration.test.ts`, `packages/domain/src/quest/quest.test.ts`, `gate05-m01.test.ts`, `gate05-regressions.integration.test.ts`                                                                                                         |

- **Required but unavailable:** none for the backend slice. Each of Ravenford's minimum commands and events has an executable path (ADR 0025 §1).
- **NOT YET IN SCOPE:** UI consumers, introduced at Stages 200–230. They are validated at Stage 240 with a real usability session, linked to the release at Stage 250. Backend review does not certify UI behavior.

## Required Output

Write `reviews/ASTRA_GATE_05_RETEST_2.md` using `ASTRA_REVIEW.md`. Gate #5 uses `05`, including the review activity called Stage 190. Preserve the previous reports. Do not modify source implementation. End with PASS or FAIL, and STOP.

# Astra Gate Handoff Request

- Gate: #2 — Contradiction / Knowledge Integrity
- Review type: RETEST
- Completed stage: 70 (Contradiction Engine); the gate also covers Stages 30 and 50–60 per `docs/GATE_COVERAGE.md`
- Revision/commit: `017ab0b4fb1386dfc994a46bb4d82b762aaba237` (remediated code under retest; later commits on `main` add only this updated handoff and the remediation report). Earlier reviews: `781dc75` (initial), `757db10` (retest 1).
- Prior report / remediation / retest number: `reviews/ASTRA_GATE_02_REPORT.md` (FAIL: G02-H01, G02-H02) and `reviews/ASTRA_GATE_02_RETEST_1.md` (FAIL: G02-H03, G02-M01; G02-H01/H02 closed) / `remediation/OPUS_GATE_02_REMEDIATION.md` (see its "Remediation for Retest 2" section) / retest 2. Gate 01 passed at `641c6af` (`reviews/ASTRA_GATE_01_REPORT.md`).
- Required output path: `reviews/ASTRA_GATE_02_RETEST_2.md`
- Requested Astra effort: MAX
- Status: AWAITING_ASTRA_RETEST

## Review Objective

**Retest scope.**

- Independently retest G02-H03 and G02-M01 and their adjacent attack paths:
  - the authority a player command was accepted under (the controlling-player assignment) and every other premise an undo could remove while the command stands;
  - undo recovery for commands that changed nothing restorable, and dependent-first undo chains.
- Recheck that G02-H01 and G02-H02 remain closed.
- Rerun the Gate 02 surfaces the remediation touched: authorization, player commands, undo, and contradictions (their IDs now derive from the causing command).
- The remediation is described in `remediation/OPUS_GATE_02_REMEDIATION.md`; treat its claims as non-authoritative.
- One rule changed by owner decision: ADR 0010's location filter, see its 2026-10-03 amendment.

The original Gate 02 objectives below still apply.

Try to break knowledge integrity across the memory, entity-context, investigation, and contradiction surfaces. Four objectives:

1. **Make testimony, a hypothesis, or any other non-fact become fact** without a valid transition. The only valid transition is a new DM-authored record (ADR 0014 §3).
2. **Make the system infer who is lying,** or which account is true, beyond the evidence.
3. **Cross-contaminate NPC knowledge.** One NPC must never learn another's knowledge or the party's.
4. **Obtain secret truth or DM data from an unauthorized perspective,** through contradictions or their explanations, memories, context actions and reasons, investigation outcomes, evidence relations, hypotheses, errors, or command results.

DM data includes WORLD_TRUTH, DM notes, NPC-private records, undiscovered clues and their DCs, disclosure policy, and claims.

Gate 01 regressions remain in scope wherever these stages changed shared surfaces: knowledge views, command results, and seeds.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md` (especially 4–7, 9, 11, 19; also 1–3, 8, 20)
- `PRODUCT_BLUEPRINT.md` — Knowledge; AI Role
- `ARCHITECTURE.md` — Knowledge Architecture, NPC Context Isolation, Context Engine
- `RAVENFORD_SPEC.md` — NPCs, Canonical Mystery Truth, Arrival / Contextual Interaction, Investigation Site, Integrity Acceptance
- `ADVERSARIAL_TESTS.md` — sections A, B, C, G, I, J (only the parts that exist at this stage)
- `docs/GATE_COVERAGE.md` — rows 30, 50–60, 70
- Owner-approved product ADRs:
  - `docs/adr/0008-knowledge-boundary.md`
  - `docs/adr/0010-memory-and-temporal-retrieval.md` (including its Gate 02 amendment on location containment)
  - `docs/adr/0012-context-engine.md`
  - `docs/adr/0013-investigation.md` (including its Gate 02 amendment on premises)
  - `docs/adr/0014-contradictions-and-epistemic-integrity.md`
- Technical ADRs:
  - `docs/adr/0009-http-api-and-dev-authentication.md` (HTTP check order, uniform errors)
  - `docs/adr/0006-temporal-model-and-undo.md` (only if you test undo or `asOf`)
- `docs/adr/0011-ruleset-srd-5-2.md` — only as background for skill checks
- Retest inputs: `reviews/ASTRA_GATE_02_REPORT.md`, `reviews/ASTRA_GATE_02_RETEST_1.md`, and `remediation/OPUS_GATE_02_REMEDIATION.md` (non-authoritative)

## Surfaces Available to Reviewer

- **API/routes.** Base URL `http://127.0.0.1:3000`, campaign `ravenford`; authenticate with `Authorization: Bearer <token>`.
  - Knowledge:
    - `GET /campaigns/:campaignId/knowledge?perspective=…`, with optional `type`, `about=<entityId>`, and `asOf=<world seconds>`
    - `GET /campaigns/:campaignId/knowledge/:knowledgeId?perspective=…`
    - `GET /campaigns/:campaignId/knowledge/:knowledgeId/related?perspective=…&depth=1..3`
    - `GET /campaigns/:campaignId/entities?perspective=…`
    - `GET /campaigns/:campaignId/entities/:entityId/knowledge?perspective=…`
  - Memory (Stage 30):
    - `GET /campaigns/:campaignId/memories?perspective=…`, with optional `q`, `entity`, `location`, `from`, `to`, `kind`, `session`, `asOf`, and `limit`
    - `GET /campaigns/:campaignId/memories/:memoryId?perspective=…`
    - `GET /campaigns/:campaignId/sessions`
  - Entity context (Stage 50): `GET /campaigns/:campaignId/entities/:entityId/context?perspective=PLAYER|CHARACTER:<id>`
  - Commands: `POST /campaigns/:campaignId/commands`, with body `{ commandId, command, expectedVersion?, reason? }`.
    - **Player commands** (Stage 60), each naming the player's own `characterId`:
      - `EnterLocation { characterId, locationId }`
      - `AskAbout { characterId, npcId, topicId }`
      - `ExamineEntity { characterId, entityId, method: inspect | investigation | perception }`
      - `FormHypothesis { characterId, scope: PARTY | CHARACTER, statement, subjects?, relations? }`
    - **DM commands** include everything from earlier stages, plus `AddClue`, `SetDisclosure`, and `SetClaim { target: { kind: knowledge, knowledgeId } | { kind: clue, clueId }, claim: { subjectId, aspect, value } }`.
    - The DM can use these commands to author more scenarios, for example additional claims, NPC records, or clues.
  - `GET /healthz`
  - Perspective values: `DM`, `PUBLIC`, `PARTY`, `PLAYER`, `CHARACTER:<entityId>`, `NPC:<entityId>`.
- **CLI/test harness:**
  - `pnpm seed:ravenford` (idempotent)
  - `pnpm test` and `pnpm test:integration`
  - The relevant suites live under:
    - `packages/domain/src/{memory,investigation,contradiction,knowledge}/`
    - `packages/context/src/`
    - `apps/server/src/http/`
  - Skill checks on the live server use cryptographic dice. Rolls cannot be scripted over HTTP; scripted dice exist only in test harnesses.
- **UI:** none (UX stages begin at 200).
- **Logs/traces:** JSON logs on the server's stdout. With `LOG_LEVEL=info` or `debug`, each request logs its request ID and actor. Perspective requests also log the effective perspective, and command submissions log the command type and status.

## Start / Reproduce

```text
pnpm install --frozen-lockfile
cp .env.example .env           # optional: every variable has a development default
pnpm db:up                     # PostgreSQL 18 via docker compose (host port 54329)
pnpm build
pnpm db:migrate
pnpm seed:ravenford            # kernel, knowledge, memory, rules, investigation, contradiction seeds; safe to rerun
LOG_LEVEL=info pnpm --filter @ltw/server start     # listens on 127.0.0.1:3000

curl -H "Authorization: Bearer dev-player-elowen" \
  "http://127.0.0.1:3000/campaigns/ravenford/knowledge?perspective=PARTY"

# Clean slate between experiments (destroys the local development database volume):
docker compose down -v && pnpm db:up && pnpm db:migrate && pnpm seed:ravenford

# Full CI-equivalent validation:
pnpm validate:ci-local
```

The seed starts on Day 1 at 10:00. Elowen is in Market Square with Mira. Mira's departure account is already in the party's knowledge; Thorne waits at the North Gate.

## Test Personas / Scopes

Development persona tokens from `fixtures/ravenford/personas.json`. These are not production secrets; production refuses this authentication mode.

| Token               | Actor           | Campaign role                                       | May request perspectives                                                                                                   | May issue commands                        |
| ------------------- | --------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `dev-dm-ravenford`  | `dm-ravenford`  | DM                                                  | Any                                                                                                                        | All except campaign creation over HTTP    |
| `dev-player-elowen` | `player-elowen` | Player controlling `elowen-starwhisper` (the party) | `PLAYER`, `CHARACTER:elowen-starwhisper`, `PARTY`, `PUBLIC`; entity context with `PLAYER` / `CHARACTER:elowen-starwhisper` | The four player commands, for Elowen only |
| `dev-outsider`      | `outsider`      | Not a campaign member                               | none                                                                                                                       | none                                      |

NPC scope fixtures (Mira, Orin, Thorne) are requested with the DM token as `perspective=NPC:<id>`. They are projections, not dialogue; runtime NPC dialogue is Stage 130 / Gate 04.

## Canonical Secret or Invariant Under Test

As the reviewer you may read the fixtures:

- `fixtures/ravenford/knowledge-seed.json` and `knowledge-boundary.json`
- `memory-seed.json` and `memory-boundary.json`
- `investigation-seed.json` (clues with DCs, disclosure policy)
- `contradiction-seed.json` (claims)

Unauthorized runtime personas must never obtain any of the following:

- **WORLD_TRUTH and DM records:** the Ashen Circle's involvement (opaque faction ID), the rare alchemical reagents, the manipulated site and staged evidence, that the attackers were not simply goblins, the symbol's meaning, and DM pacing notes (including that the party's goblin theory is wrong).
- **NPC-private records** that the NPC has not shared under its disclosure policy. Orin's knowledge is entirely guarded, and so is Thorne's missing-patrol report.
- **Investigation data before discovery:** clue existence, DCs, and statements. Also any trace of disclosure policy or claims, and any record of another scope.

Epistemic invariants:

- Records never change type, statement, or relations.
- Testimony and hypotheses never become FACT except through a new DM-authored record.
- Contradictions are recorded only where one holder's audience sees both records, are worded neutrally, and decide nothing.
- Memories respect presence and visibility rules (ADR 0010).

## Validation Already Run by Opus

| Command                                                                                                                                            | Result                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                   | PASS                                                                                                                                                                                                                                                                                                |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                                                                                                 | PASS                                                                                                                                                                                                                                                                                                |
| `pnpm context-budget`                                                                                                                              | PASS — 192 active files, 0 over 500 lines, 0 over 700                                                                                                                                                                                                                                               |
| `pnpm test`                                                                                                                                        | PASS — 56 files, 753 tests (includes all Gate 02 regressions, the randomized tests, and the re-decision oracle)                                                                                                                                                                                     |
| `pnpm build`                                                                                                                                       | PASS                                                                                                                                                                                                                                                                                                |
| `pnpm db:migrate` on a fresh volume, then again                                                                                                    | PASS — `0001_world_event_store` applied once                                                                                                                                                                                                                                                        |
| `pnpm seed:ravenford` on a fresh volume, then again                                                                                                | PASS — 83 commands accepted (stream version 92, 21 entities); second run: 83 duplicates, nothing written                                                                                                                                                                                            |
| `pnpm test:integration`                                                                                                                            | PASS — 6 files, 25 tests (includes the Gate 02 regressions on PostgreSQL before and after reload)                                                                                                                                                                                                   |
| `pnpm validate:ci-local`                                                                                                                           | PASS                                                                                                                                                                                                                                                                                                |
| Live server on PostgreSQL: the reviewers' exact HTTP reproductions of G02-H01 and G02-H02 (at `757db10`) and of G02-H03 and G02-M01 (at `017ab0b`) | PASS. Hidden and nonexistent locations identical. Disclosure undo blocked by the move. Assignment undo blocked by the player's move or hypothesis, then accepted in reverse order. The empty inspection, move, and disclosure unwind in order. The database was reset and reseeded clean afterwards |
| Mutation checks (Stage 60/70: 9 + 14 defects; remediation for retest 1: 10; for retest 2: 5), injected one at a time                               | Each detected, then reverted                                                                                                                                                                                                                                                                        |

## Known Limitations

- **Authentication:** development persona tokens only (ADR 0009). There is one party member and one player.
- **Perception and disguises:** concealment and disguises are not modeled. A perceived entity is shown by ID and kind until known. Some evidence entities have descriptive IDs (for example `goblin-weapon`); only entities whose identity must stay secret use opaque IDs (ADR 0008).
- **Travel:** has no duration or route; the DM controls the clock.
- **Disclosure:** NPC disclosure is policy-only (WILLING or GUARDED). Trust, motivation, and dialogue are Stage 130.
- **Not executable yet:** Talk, Trade, and Insight are context descriptors only. Detect Magic execution is Stage 80.
- **Skill checks:** one attempt per character, entity, and method. The engine draws a d20 even for a check that is then rejected; the draw is discarded and never shown.
- **Premises and undo:** a player command records the premise it used: perception, else the earliest premise that made the target known (ADR 0013 amendment). Undoing that premise is blocked while the command stands. A later, redundant disclosure is not a premise and stays undoable.
- **Containment:** between two places a perspective knows, containment counts as known geography (ADR 0010 amendment, owner-approved). A place whose whereabouts must stay secret must itself stay unknown.
- **Contradictions:** conflict detection uses strict equality of DM-authored claim values; free text is never compared. Players cannot set claims. Contradiction records are not listed in player command outcomes; players read them through the knowledge API.
- **Party:** party membership follows the current assignment (no history), and there is no unassignment command.
- **Intentional disclosures:** records the DM assigns to non-DM scopes, and records an NPC shares under a WILLING policy, are intentional disclosures, not leaks.
- **Operations:** there is no rate limiting. The GitHub Actions workflow has not run on GitHub (there is no remote); `pnpm validate:ci-local` mirrors it.

## Coverage Ledger

Due surfaces (`docs/GATE_COVERAGE.md`):

| Row              | Surface                                                                                                           | Reproducible access                                                                    | Opus evidence                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30               | Memory and temporal retrieval scope: semantic, entity, location, time, kind, session queries; impossible memories | `/memories`, `/memories/:id`, `/sessions`; `RecordMemory` as DM                        | `packages/domain/src/memory/*.test.ts`, `apps/server/src/http/memory-routes.test.ts`, `fixtures/ravenford/memory-boundary.json`                                                                                                                                                                                   |
| 30 → 60          | Memories created by play (DISCOVERY, CONVERSATION)                                                                | Player commands, then `/memories`                                                      | `packages/domain/src/investigation/{examine,conversation}.test.ts`                                                                                                                                                                                                                                                |
| 50–60            | Entity context: perception, visible state, actions, reasons, topics, relevance                                    | `/entities/:id/context`                                                                | `packages/context/src/{entity-context,legality,leakage,relevance,command-alignment}.test.ts`, `apps/server/src/http/context-routes.test.ts`                                                                                                                                                                       |
| 50–60            | Investigation paths: movement, questioning, examination, outcomes, rejections, evidence relations, hypotheses     | Player commands; knowledge routes                                                      | `packages/domain/src/investigation/*.test.ts` (including the end-to-end `investigation-path.test.ts`), `apps/server/src/http/investigation-routes.test.ts`                                                                                                                                                        |
| 70               | Contradictions: type preservation, neutrality, joint scope, no truth leakage, NPC isolation, DM-only claims       | Knowledge routes (`type=CONTRADICTION`, `/related`); `SetClaim` as DM; player commands | `packages/domain/src/contradiction/*.test.ts` (including the randomized oracle test), `apps/server/src/http/contradiction-routes.test.ts`, `packages/context/src/relevance.test.ts`                                                                                                                               |
| 20 (regression)  | Knowledge boundary after the changed shared surfaces (DM-only `claim` field, player result shape, new seeds)      | Knowledge routes                                                                       | `packages/domain/src/knowledge/*.test.ts` (including the randomized boundary test), `apps/server/src/http/knowledge-*.test.ts`                                                                                                                                                                                    |
| Gate 02 retest   | G02-H01: location filtering with hidden targets and ancestry                                                      | `/memories?location=…`, DM authoring                                                   | `packages/domain/src/memory/location-filter.test.ts`, `packages/domain/src/memory/recall-noninterference.property.test.ts`, `apps/server/src/http/gate02-regressions.test.ts`, `apps/server/src/world-engine/gate02-regressions.integration.test.ts`                                                              |
| Gate 02 retest   | G02-H02: premises of player commands under undo                                                                   | Player commands, DM `UndoCommand`                                                      | `packages/domain/src/investigation/premises.test.ts`, `packages/domain/src/investigation/premises.property.test.ts`, `packages/domain/src/kernel/replay.test.ts`, the same HTTP and PostgreSQL regression files                                                                                                   |
| Gate 02 retest 2 | G02-H03 / G02-M01: authority premises and undo recovery                                                           | Player commands by an assigned player, DM `AssignCharacter`, `UndoCommand`             | `packages/domain/src/investigation/authority-and-recovery.test.ts`, `packages/domain/src/investigation/premises.property.test.ts` (with the re-decision oracle `packages/domain/src/kernel/testing/redecide.ts`), `packages/domain/src/kernel/replay.test.ts`, the HTTP and PostgreSQL `gate02-regressions` files |
| All              | Persistence and restart                                                                                           | PostgreSQL server                                                                      | `apps/server/src/world-engine/*.integration.test.ts`                                                                                                                                                                                                                                                              |

Required but untestable surfaces: none known.

Future surfaces — NOT YET IN SCOPE (not tested, not passed):

| Surface                                                                     | Introduction stage                    | Next review              |
| --------------------------------------------------------------------------- | ------------------------------------- | ------------------------ |
| Detect Magic and other spellcasting on evidence; combat                     | 80                                    | Gate 03 (with reactions) |
| Reaction windows                                                            | 90                                    | Gate 03                  |
| AI contexts, authoring proposals (including AI-proposed claims), continuity | 100–120                               | Gate 04                  |
| Runtime NPC dialogue and trust-based disclosure                             | 130                                   | Gate 04                  |
| Asset metadata and lineage                                                  | 150–160                               | Gate 05                  |
| Chronicle and flashbacks (including contradiction events)                   | 170                                   | Gate 05                  |
| Production authentication                                                   | Requires an ADR before any deployment | Gate 05 at the latest    |

## Required Output

Write `reviews/ASTRA_GATE_02_RETEST_2.md` using `ASTRA_REVIEW.md`. Preserve previous reports, including `reviews/ASTRA_GATE_02_REPORT.md` and `reviews/ASTRA_GATE_02_RETEST_1.md`. Do not modify source implementation. End with PASS or FAIL and STOP.

# Astra Gate Handoff Request

- Gate: #3 — Reaction Integrity
- Review type: RETEST
- Completed stage: 90 (Reaction Engine). The gate also covers the Stage 80 combat surfaces, which Gate 02 deferred to this gate (see its Coverage Ledger).
- Revision/commit: `e893497fef95e53ec54f4baa0a314a341d09515b` (remediated code under retest, branch `main`). Later commits on `main` add only this updated handoff, the remediation report, and the README status line. Earlier reviews: `429e2a2` (initial), `88d8137` (retest 1), `b38cbbc` (retest 2).
- Prior reports / remediation / retest number:
  - `reviews/ASTRA_GATE_03_REPORT.md` (FAIL: G03-H01, G03-H02, G03-H03);
  - `reviews/ASTRA_GATE_03_RETEST_1.md` (FAIL: G03-H04; the first three closed);
  - `reviews/ASTRA_GATE_03_RETEST_2.md` (FAIL: G03-H05, G03-H06; G03-H01 to G03-H04 closed);
  - remediation: `remediation/OPUS_GATE_03_REMEDIATION.md` (see its "Remediation for Retest 3" section); this is retest 3.
  - Gate 02 passed at retest 2 (`reviews/ASTRA_GATE_02_RETEST_2.md`, revision `017ab0b`).
- Required output path: `reviews/ASTRA_GATE_03_RETEST_3.md`
- Requested Astra effort: MAX
- Status: AWAITING_ASTRA_RETEST

## Review Objective

**Retest scope.**

- Independently retest G03-H05 and its adjacent attack paths:
  - history written by earlier revisions: reload, as-of reconstruction, continuation by the current engine, and undo beneath and of old commands;
  - the per-type schema versions, which read every stored version, refuse unknown ones, and never write a legacy variant;
  - the re-decision oracle on such history: it folds commands earlier writers decided, as recorded.
  - Genuine rows written by revision 88d8137 are in `fixtures/history/` (see "Start / Reproduce").
- Independently retest G03-H06 and its adjacent attack paths:
  - spells by a character outside a fight at its combatants and at creatures outside it, with and without an open window, unhurt and injured;
  - the same through the Context Engine;
  - any other command such a character can send while a window is open.
- An adjacent defect was found and fixed during this remediation; attack it too. Narrative combat records (`SpellCast`, `HealingApplied`, …) now read every creature they name: try undo of a creature beneath a record that names it, on fresh and on old history.
- Recheck that G03-H01 to G03-H04 remain closed, with the adjacent items fixed for retests 1 and 2.
- The remediation is described in `remediation/OPUS_GATE_03_REMEDIATION.md`; treat its claims as non-authoritative.
- Owner decisions:
  - G03-H06 (2026-10-04, ADR 0015 and ADR 0016 retest 2 amendments): a character outside a fight cannot target its combatants (`TARGET_IN_COMBAT`) in any phase of the fight. Its player may thus learn that a creature the character perceives is fighting, never anything about a reaction window.
  - Retest 1, unchanged: entities without a battlefield square are not sensed by Detect Magic during combat (ADR 0015 Gate 03 amendment).

The original Gate 03 objectives below still apply.

Try to break reaction integrity:

1. **Double-spend** a Reaction, a spell slot, or an answer.
2. **Stale windows:** use a window that expired, closed, or was undone.
3. **Late reactions:** react after the trigger resolved.
4. **Races:** race concurrent reactions and closes.
5. **Ordering:** exploit replay, event ordering, or idempotent retries.
6. **Rollback:** produce an inconsistent rollback (undo or rewind) while a reaction window exists.

Also attack the surfaces a window depends on:

- **The pause.** Can anything change while a window is open that the suspended spell or the eligibility relied on?
- **Determinism.** Does every recorded roll and decision stay deterministic?
- **Leakage.** Can an unauthorized perspective learn what it must not? This includes the suspended spell's identity and target, the other candidates, or the existence of a fight its character is not in.

The Stage 80 combat surfaces are due here too: encounters, turns, attacks, spells (including Detect Magic), 0 HP, the encounter view, combat undo, and replay. Gate 01 and 02 regressions apply wherever Stages 80–90 changed a shared surface: command results, the Context Engine, placements and their undo footprint, and knowledge revealed by Detect Magic.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md` — especially 1, 5, 8, 9, 10, 11, 12, and 20
- `ARCHITECTURE.md` — Reaction Engine; Context Engine
- `RAVENFORD_SPEC.md` — Combat Encounter; Integrity Acceptance (an invalid Counterspell is rejected by the Rules)
- `ADVERSARIAL_TESTS.md` — sections E, H, and I (only the parts that exist at this stage)
- `docs/GATE_COVERAGE.md` — row 90
- Owner-approved product ADRs:
  - `docs/adr/0016-reaction-engine.md` — the decision under review, including its Gate 03, retest 1, and retest 2 amendments
  - `docs/adr/0015-combat-engine.md`, including its Stage 90, Gate 03, retest 1, and retest 2 amendments
  - `docs/adr/0006-temporal-model-and-undo.md` — §8, §9, and the Stage 90 and Gate 03 amendments
  - `docs/adr/0011-ruleset-srd-5-2.md` — Counterspell and the turn economy
  - `docs/adr/0012-context-engine.md` — the Stage 80 and 90 amendments
  - `docs/adr/0013-investigation.md` — the Gate 03, retest 1, and retest 2 amendments on results that found nothing
- Technical ADRs:
  - `docs/adr/0007-world-kernel-model-and-event-store.md` (pipeline, footprints, concurrency; the Gate 03 retest 2 amendment on schema versions)
  - `docs/adr/0009-http-api-and-dev-authentication.md` (HTTP check order, player result hygiene)
- Retest inputs: `reviews/ASTRA_GATE_03_REPORT.md`, `reviews/ASTRA_GATE_03_RETEST_1.md`, `reviews/ASTRA_GATE_03_RETEST_2.md`, and `remediation/OPUS_GATE_03_REMEDIATION.md` (non-authoritative)

## Surfaces Available to Reviewer

- **API/routes.** Base URL `http://127.0.0.1:3000`, campaign `ravenford`. Authenticate with `Authorization: Bearer <token>`.
  - `POST /campaigns/:campaignId/commands` with body `{ commandId, command, expectedVersion?, reason? }`. Players may not send `expectedVersion`.
    - **Combat** (Stage 80):
      - DM only: `StartCombat { locationId, battlefield, combatants }` and `EndCombat { encounterId }`.
      - A player for their own character, or the DM for anyone: `MoveCombatant { combatantId, path }`, `Attack { combatantId, attackId, targetId }`, `CastSpell { combatantId, spellId, using?, targetId?, point? }`, and `EndTurn { combatantId }`.
    - **Reactions** (Stage 90):
      - A candidate's player for their own character, or the DM: `UseReaction { combatantId, windowId, reaction: 'counterspell', using? }` and `DeclineReaction { combatantId, windowId }`.
      - DM only: `CloseReactionWindow { windowId }`.
    - **Authoring and undo:** every earlier DM command (for example `UndoCommand { targetCommandId }`, `SetCharacterSheet`, `SetStatBlock`, `PlaceEntity`, `CreateEntity`, `AssignCharacter`, `AdvanceWorldTime`, `AddClue`), plus the Stage 60 player commands.
  - `GET /campaigns/:campaignId/encounter?perspective=…` — the encounter, and the open reaction window as that perspective may see it.
  - `GET /campaigns/:campaignId/entities/:entityId/context?perspective=PLAYER|CHARACTER:<id>`
  - Knowledge, memory, and session routes as in Gate 02.
  - `GET /healthz`
- **CLI/test harness:**
  - `pnpm test` and `pnpm test:integration`.
  - Reaction suites: `packages/combat/src/reactions/*.test.ts`; `packages/context/src/{reaction,leakage}.test.ts`; `apps/server/src/http/reaction-routes.test.ts`; `apps/server/src/world-engine/reaction.integration.test.ts`.
  - Test harness: `packages/combat/src/testing/`.
    - `road.ts` and `reactions.ts`: scripted dice; Seren, a second Counterspell-capable character who exists only in tests.
    - `racing.ts`: a second engine on the same store.
  - On the live server, every die comes from cryptographic randomness drawn when a command is resolved and recorded with it. Dice cannot be scripted over HTTP.
- **UI:** none (UX stages begin at 200).
- **Logs/traces:** JSON logs on stdout. With `LOG_LEVEL=info`, each command submission logs the actor, command type, and status.

## Start / Reproduce

```text
pnpm install --frozen-lockfile
pnpm db:up                     # PostgreSQL 18 via docker compose (host port 54329)
pnpm build
pnpm db:migrate
pnpm seed:ravenford            # includes the Old Trade Road goblins (combat-seed.json); safe to rerun
LOG_LEVEL=info pnpm --filter @ltw/server start     # 127.0.0.1:3000

# The Old Trade Road ambush (fixtures/ravenford/road-ambush.json): place everyone, then start.
for e in goblin-raider-1 goblin-raider-2 goblin-raider-3 goblin-shaman elowen-starwhisper; do
  curl -s -X POST http://127.0.0.1:3000/campaigns/ravenford/commands \
    -H 'content-type: application/json' -H 'Authorization: Bearer dev-dm-ravenford' \
    -d "{\"commandId\":\"place-$e\",\"command\":{\"type\":\"PlaceEntity\",\"entityId\":\"$e\",\"locationId\":\"old-trade-road\"}}"
done
curl -s -X POST http://127.0.0.1:3000/campaigns/ravenford/commands \
  -H 'content-type: application/json' -H 'Authorization: Bearer dev-dm-ravenford' \
  -d "$(jq -c '{commandId: "start", command: .startCombat}' fixtures/ravenford/road-ambush.json)"
curl -s 'http://127.0.0.1:3000/campaigns/ravenford/encounter?perspective=DM' -H 'Authorization: Bearer dev-dm-ravenford'
# End turns (EndTurn) until the Shaman is current, then as DM:
#   CastSpell { combatantId: goblin-shaman, spellId: ashen-bolt | binding-hex, targetId: elowen-starwhisper }

# Clean slate between experiments (destroys the local development database volume):
docker compose down -v && pnpm db:up && pnpm db:migrate && pnpm seed:ravenford

# G03-H05: start instead from the rows revision 88d8137 stored (fixtures/history/AGENTS.md).
# On a migrated, empty database (no seed), from the repository root:
docker compose down -v && pnpm db:up && pnpm db:migrate
cat > load-history.mts <<'EOF'
import { createRequire } from 'node:module';
import { DEV_DATABASE_URL } from './apps/server/src/platform/config/config.ts';
import { insertHistory, loadHistoryRows } from './apps/server/src/testing/history-rows.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const pool = new Pool({ connectionString: DEV_DATABASE_URL });
await insertHistory(pool, await loadHistoryRows('88d8137-gate03-retest1'));
await pool.end();
EOF
node --conditions=@ltw/source load-history.mts && rm load-history.mts
# Then start the server as above; the stream is at version 178 (its scenario steps: jq '.labels' fixtures/history/88d8137-gate03-retest1.json).

# Full CI-equivalent validation:
pnpm validate:ci-local
```

Initiative is rolled. Elowen starts 50 ft from the Shaman, within Counterspell's 60 ft.

## Test Personas / Scopes

Development persona tokens from `fixtures/ravenford/personas.json`. These are not production secrets; production refuses this authentication mode.

| Token               | Actor           | Campaign role                                       | Combat and reactions                                                                                                        |
| ------------------- | --------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dev-dm-ravenford`  | `dm-ravenford`  | DM                                                  | Starts and ends combat, acts for goblins and characters, answers for any candidate, closes windows, undoes                  |
| `dev-player-elowen` | `player-elowen` | Player controlling `elowen-starwhisper` (the party) | Combat commands and window answers for Elowen only; encounter view and context as `PLAYER` / `CHARACTER:elowen-starwhisper` |
| `dev-outsider`      | `outsider`      | Not a campaign member                               | none                                                                                                                        |

There is one player persona. The DM can author more characters, but with no token for their players the DM answers for them. The test harness has a second player (Seren).

## Canonical Secret or Invariant Under Test

Reaction integrity, per ADR 0016:

- **One answer per candidate.** A Reaction is spent at most once per round and returns only at the start of its owner's turn. A slot is spent at most once, within the one-slot-per-turn rule.
- **One window at a time.** At most one window is open, and a closed window (resolved, expired, or undone) accepts nothing. A suspended spell resolves exactly once, or is countered.
- **The pause.** While a window is open, no other combat command is accepted, and nothing the window depends on changes.
- **Undo** follows the ADR 0006 §8 footprint rule; unsafe undo is rejected with blockers, and the state stays consistent after any accepted undo.
- **Replay** reproduces every state, and retrying a command ID never acts twice.

Visibility, per ADR 0016 §4 and ADR 0015 §6:

- A candidate's player sees the caster and the components, never the spell's identity, its target, the save DC, or other candidates.
- A player whose character is not part of the fight cannot tell that a window exists. Whether a fight exists, it learns only by perceiving a combatant: a spell at it is refused with `TARGET_IN_COMBAT` (owner decision, ADR 0015 and ADR 0016 retest 2 amendments).
- History any revision stored stays readable with its meaning; no event is rewritten (ADR 0007 retest 2 amendment).
- Initiative, stat blocks, non-party hit points, reaction events, and rolls are DM data.

Earlier secrets still hold: the Gate 01/02 fixtures `knowledge-boundary.json` and `memory-boundary.json`, plus WORLD_TRUTH, DM, and NPC-private records, clues, disclosure policy, and claims.

## Validation Already Run by Opus

| Command                                                                                                                                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                     | PASS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                                                                                                   | PASS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm context-budget`                                                                                                                                | PASS — 274 active files, 0 over 500 lines, 0 over 700                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm test`                                                                                                                                          | PASS — 82 files, 949 tests, including the Gate 03 regressions (G03-H05 and G03-H06: `packages/combat/src/gate03-h05-regressions.test.ts`, `gate03-h06-regressions.test.ts`, `packages/context/src/outsider.test.ts`, `packages/domain/src/kernel/event-versions.test.ts`) and the randomized suites: the reaction suite with Bram probing open windows from outside the fight, and random commands and undos on the retest 1 history (`history.property.test.ts`)                                                                                                |
| `pnpm build`                                                                                                                                         | PASS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm db:migrate` on a fresh volume, then again                                                                                                      | PASS — `0001_world_event_store` applied once (no new migration)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm seed:ravenford` on a fresh volume, then again                                                                                                  | PASS — 91 commands accepted (stream version 100, 25 entities); the second run writes nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm test:integration`                                                                                                                              | PASS — 10 files, 44 tests, including `gate03-retest2-regressions.integration.test.ts`: the retest 1 rows on PostgreSQL over HTTP, and G03-H06 after a restart                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm validate:ci-local`                                                                                                                             | PASS on `e893497`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Live server on PostgreSQL (crypto dice), over HTTP                                                                                                   | PASS, built from `e893497`. With the retest 1 rows in the development database: the player's encounter read returns 200; a DM command is accepted; undoing the far charm or its clue beneath the old casts is refused, naming them; a new Detect Magic is stored as version 2. In a fight without Elowen, her Healing Word at the Shaman is refused with `TARGET_IN_COMBAT`, identically before and while Seren's window is open; healing herself with the window open is accepted; her player sees no encounter. The database was then reset and reseeded clean |
| Mutation checks against the full unit suite, one at a time: the 17 Stage 90 reaction defects and the fixes made for retests 1, 2, and 3 (7 + 3 + 10) | All 37 detected (two only after their tests were sharpened; see the remediation report)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A larger randomized campaign, run temporarily and then deleted                                                                                       | 80 reaction seeds × 120 steps, 60 domain seeds, and 60 seeds × 60 steps on the retest 1 history: 200 of 201 tests passed, covering every integrity, replay, pause, range, undo-safety, re-decision, window-hiding, and legacy-history check. Seed 1666 failed only the coverage assertion that some window opened; the Shaman's one turn passed without its cast                                                                                                                                                                                                 |

## Known Limitations

- **Counterspell is the only reaction.** By owner decision (ADR 0016 §6), opportunity attacks are deferred and moving away from an enemy provokes nothing. Monsters have no reactions, a Counterspell never opens a window of its own (no chains), and windows exist only in combat.
- **Expiry** is the DM's (or the system's) explicit close. There are no timers.
- **Outside a fight** (owner decision, G03-H06): a character not in a fight cannot target its combatants. To act on them it must be in the fight, and a fight cannot be joined once started: the DM includes characters when starting it.
- **History from earlier revisions** keeps the premises its writer recorded. The re-decision oracle folds those commands as recorded, so it cannot judge them by today's rules (ADR 0007 retest 2 amendment).
- **The pause is visible to combatants:** they get `REACTION_PENDING` when acting while a window is open, but the encounter view shows the window only to its candidates, its caster's player, and the DM.
- **Time:** outside reaction windows, the DM may still advance world time during an encounter (Stage 80 behavior).
- **Player results** carry no event list and no rejection details (ADR 0014 §4). A refused combat action shows the rules reason as its message, without `moveRequiredFt`.
- **Combat simplifications from ADR 0015** apply: everyone sees everyone, cover is per square, elevation is 0, and the DM issues monster actions.
- **Authentication:** development persona tokens only (ADR 0009), and one player persona.
- **Operations:** there is no rate limiting. The GitHub Actions workflow has not run on GitHub (there is no remote); `pnpm validate:ci-local` mirrors it.

## Coverage Ledger

Due surfaces (`docs/GATE_COVERAGE.md` row 90, plus the Stage 80 surfaces Gate 02 deferred here):

| Row                | Surface                                                                                                                       | Reproducible access                                                                                                                                      | Opus evidence                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 90                 | Eligibility (range, slot, Reaction, cover, Incapacitated, the dead, spent Reaction regained, several candidates)              | Shaman `CastSpell` as DM; DM-authored sheets and characters; encounter view (DM)                                                                         | `packages/combat/src/reactions/eligibility.test.ts`                                                                                                                                                                      |
| 90                 | Opening, resolution, outcomes, perspective views; invalid Counterspell rejected by the Rules                                  | `UseReaction`, `DeclineReaction`; encounter view; context                                                                                                | `reactions/lifecycle.test.ts`, `apps/server/src/http/reaction-routes.test.ts`, `packages/context/src/reaction.test.ts`                                                                                                   |
| 90                 | Expiry; double-spend; stale and late answers; non-candidates; the pause; outsiders                                            | `CloseReactionWindow`; repeated answers; any command during a window                                                                                     | `reactions/integrity.test.ts`                                                                                                                                                                                            |
| 90                 | Concurrency (answer racing a close, in both orders; the same candidate twice; two candidates; bursts on two engines)          | Parallel HTTP requests; the test harness's second engine                                                                                                 | `reactions/concurrency.test.ts`, `apps/server/src/world-engine/reaction.integration.test.ts`                                                                                                                             |
| 90                 | Ordering and replay (idempotent retries, as-of reads, restart without randomness, re-decision)                                | Repeated command IDs; `pnpm test:integration`                                                                                                            | `reactions/{integrity,undo,property}.test.ts`, `reaction.integration.test.ts`                                                                                                                                            |
| 90                 | Undo and rewind with an open window (trigger, answers, earlier commands, unrelated commands, every point of a window's life)  | `UndoCommand` as DM                                                                                                                                      | `reactions/undo.test.ts`, `reactions/property.test.ts`, `reaction.integration.test.ts`                                                                                                                                   |
| 80                 | Combat: encounters, initiative, turns, movement, attacks, spells, Detect Magic, 0 HP, death saves                             | Combat commands; encounter view                                                                                                                          | `packages/combat/src/{encounter,movement,attack,spells,dying,history}.test.ts`, `apps/server/src/world-engine/combat.integration.test.ts`                                                                                |
| 80                 | Encounter view and context in combat: no non-party HP, initiative, or stat blocks for players; no fight visible to outsiders  | Encounter route; context route                                                                                                                           | `apps/server/src/http/encounter-routes.test.ts`, `packages/context/src/{combat,leakage}.test.ts`                                                                                                                         |
| 50–70 (regression) | Context actions and reasons in combat; command results; knowledge revealed by Detect Magic; placement undo footprints         | Context route; player commands; knowledge routes                                                                                                         | `packages/context/src/*.test.ts`, `packages/combat/src/spells.test.ts`, `reactions/undo.test.ts` (leaving the battlefield), the Gate 02 regression suites                                                                |
| Gate 03 retest     | G03-H01: undo reopening a window after later changes                                                                          | `UndoCommand` after an answer and DM authoring                                                                                                           | `packages/combat/src/gate03-regressions.test.ts`, `reactions/property.test.ts` (what-if undos), `apps/server/src/http/gate03-regressions.test.ts`, `apps/server/src/world-engine/gate03-regressions.integration.test.ts` |
| Gate 03 retest     | G03-H02: premises of combat results that changed nothing                                                                      | DM edits of combatants, attacks, turn ends, then undo                                                                                                    | The same files                                                                                                                                                                                                           |
| Gate 03 retest     | G03-H03: Detect Magic range in combat, both paths, entities without a square                                                  | `AddClue` (magic), `CastSpell detect-magic`, player knowledge and memories                                                                               | The same files                                                                                                                                                                                                           |
| Gate 03 retest     | Adjacent: stat-block authoring after combat; negative premises of examinations and Detect Magic                               | `EndCombat`, `SetStatBlock`, repeated `ExamineEntity`, `PlaceEntity`/`EnterLocation` before Detect Magic, then undo                                      | `gate03-regressions.test.ts`, `packages/domain/src/investigation/negative-premises.test.ts`, `premises.property.test.ts`                                                                                                 |
| Gate 03 retest 2   | G03-H04: spells cast outside an encounter while a fight the caster is not in runs (Hunter's Mark, Healing Word, Detect Magic) | Player `CastSpell` for a character outside the fight; DM `CreateEntity`, `ChangeEntityStatus`, `PlaceEntity`, player `EnterLocation`, then `UndoCommand` | `packages/combat/src/gate03-h04-regressions.test.ts`, `reactions/property.test.ts` (bystanders), `apps/server/src/world-engine/gate03-regressions.integration.test.ts`                                                   |
| Gate 03 retest 2   | Adjacent: Detect Magic and the magic clues it did not reach                                                                   | `AddClue` (magic) beyond the caster’s reach, `CastSpell detect-magic`, then undo of the clue                                                             | `gate03-h04-regressions.test.ts`, `reactions/property.test.ts`                                                                                                                                                           |
| Gate 03 retest 3   | G03-H05: history stored by earlier revisions; schema versions; the oracle on old history                                      | The rows in `fixtures/history/` loaded into a database ("Start / Reproduce"); any command, read, or undo on top                                          | `packages/combat/src/gate03-h05-regressions.test.ts`, `history.property.test.ts`, `packages/domain/src/kernel/event-versions.test.ts`, `apps/server/src/world-engine/gate03-retest2-regressions.integration.test.ts`     |
| Gate 03 retest 3   | G03-H06: a character outside a fight and its combatants, with and without an open window                                      | Player `CastSpell` for Elowen outside a fight; encounter and context routes                                                                              | `packages/combat/src/gate03-h06-regressions.test.ts`, `reactions/property.test.ts` (Bram during windows), `packages/context/src/outsider.test.ts`, the same PostgreSQL file                                              |
| Gate 03 retest 3   | Adjacent: narrative combat records under undo                                                                                 | `UndoCommand` of a creature a standing record names                                                                                                      | `history.property.test.ts`, `gate03-h05-regressions.test.ts`                                                                                                                                                             |
| All                | Persistence and restart                                                                                                       | PostgreSQL server                                                                                                                                        | `apps/server/src/world-engine/*.integration.test.ts`                                                                                                                                                                     |

Required but untestable surfaces: none known. A second player persona over HTTP does not exist (see Known Limitations); multi-player races are covered through the DM and in the test harness.

Future surfaces — NOT YET IN SCOPE (not tested, not passed):

| Surface                                                             | Introduction stage                                                | Next review                        |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| Opportunity attacks and other reactions (Shield, monster reactions) | A later combat-rules extension; needs an ADR 0016 amendment first | The first gate after it is added   |
| Timed expiry of reaction windows                                    | Not scheduled; a timer would issue the existing close command     | The first gate after it is added   |
| AI contexts, authoring proposals, continuity                        | 100–120                                                           | Gate 04                            |
| Runtime NPC dialogue and NPC/monster actions                        | 130                                                               | Gate 04                            |
| Asset metadata and lineage                                          | 150–160                                                           | Gate 05                            |
| Chronicle and flashbacks (including combat and reaction events)     | 170                                                               | Gate 05                            |
| Combat UX (reaction prompts in the client)                          | 220                                                               | UI regressions as consumers appear |
| Production authentication                                           | Requires an ADR before any deployment                             | Gate 05 at the latest              |

## Required Output

Write `reviews/ASTRA_GATE_03_RETEST_3.md` using `ASTRA_REVIEW.md`. Preserve previous reports and their evidence, including `reviews/ASTRA_GATE_03_REPORT.md`, `reviews/ASTRA_GATE_03_RETEST_1.md`, and `reviews/ASTRA_GATE_03_RETEST_2.md`. Do not modify source implementation. End with PASS or FAIL and STOP.

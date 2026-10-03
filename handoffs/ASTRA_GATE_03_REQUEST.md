# Astra Gate Handoff Request

- Gate: #3 — Reaction Integrity
- Review type: INITIAL
- Completed stage: 90 (Reaction Engine). The gate also covers the Stage 80 combat surfaces, which Gate 02 deferred to this gate (see its Coverage Ledger).
- Revision/commit: `429e2a273ef17a304c09d62965cc60b6cf3be7ad` (branch `main`). Later commits on `main` add only this handoff and the completion report.
- Prior report / remediation / retest number: N/A (initial review). Gate 02 passed at retest 2 (`reviews/ASTRA_GATE_02_RETEST_2.md`, revision `017ab0b`).
- Required output path: `reviews/ASTRA_GATE_03_REPORT.md`
- Requested Astra effort: MAX
- Status: AWAITING_ASTRA_REVIEW

## Review Objective

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
  - `docs/adr/0016-reaction-engine.md` — the decision under review
  - `docs/adr/0015-combat-engine.md`, including its Stage 90 amendment
  - `docs/adr/0006-temporal-model-and-undo.md` — §8, §9, and the Stage 90 amendment
  - `docs/adr/0011-ruleset-srd-5-2.md` — Counterspell and the turn economy
  - `docs/adr/0012-context-engine.md` — the Stage 80 and 90 amendments
- Technical ADRs:
  - `docs/adr/0007-world-kernel-model-and-event-store.md` (pipeline, footprints, concurrency)
  - `docs/adr/0009-http-api-and-dev-authentication.md` (HTTP check order, player result hygiene)

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
- A player whose character is not part of the fight cannot tell that a fight or a window exists.
- Initiative, stat blocks, non-party hit points, reaction events, and rolls are DM data.

Earlier secrets still hold: the Gate 01/02 fixtures `knowledge-boundary.json` and `memory-boundary.json`, plus WORLD_TRUTH, DM, and NPC-private records, clues, disclosure policy, and claims.

## Validation Already Run by Opus

| Command                                                                  | Result                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                         | PASS                                                                                                                                                                                                                                                                 |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`                       | PASS                                                                                                                                                                                                                                                                 |
| `pnpm context-budget`                                                    | PASS — 255 active files, 0 over 500 lines, 0 over 700                                                                                                                                                                                                                |
| `pnpm test`                                                              | PASS — 73 files, 862 tests, including the reaction suites, the randomized property test (6 seeds, 70 random steps each, with undos), and the re-decision oracle                                                                                                      |
| `pnpm build`                                                             | PASS                                                                                                                                                                                                                                                                 |
| `pnpm db:migrate` on a fresh volume, then again                          | PASS — `0001_world_event_store` applied once (no new migration)                                                                                                                                                                                                      |
| `pnpm seed:ravenford` on a fresh volume, then again                      | PASS — 91 commands accepted (stream version 100, 25 entities); the second run writes nothing                                                                                                                                                                         |
| `pnpm test:integration`                                                  | PASS — 8 files, 31 tests, including Counterspell across a restart without randomness, a forced race between two engines on one database, the DM's close stored and replayed, and undo with an open window                                                            |
| `pnpm validate:ci-local`                                                 | PASS                                                                                                                                                                                                                                                                 |
| Live server on PostgreSQL (crypto dice), the Counterspell flow over HTTP | PASS: window, limited player view, `REACTION_PENDING` on a move, Counterspell (countered), late answer refused, unsafe undo refused with blockers, reverse undo reopens and removes the window, stale answer refused. The database was then reset and reseeded clean |
| Mutation checks: 17 reaction defects, injected one at a time             | Each detected, then reverted                                                                                                                                                                                                                                         |

## Known Limitations

- **Counterspell is the only reaction.** By owner decision (ADR 0016 §6), opportunity attacks are deferred and moving away from an enemy provokes nothing. Monsters have no reactions, a Counterspell never opens a window of its own (no chains), and windows exist only in combat.
- **Expiry** is the DM's (or the system's) explicit close. There are no timers.
- **The pause is visible to combatants:** they get `REACTION_PENDING` when acting while a window is open, but the encounter view shows the window only to its candidates, its caster's player, and the DM.
- **Time:** outside reaction windows, the DM may still advance world time during an encounter (Stage 80 behavior).
- **Player results** carry no event list and no rejection details (ADR 0014 §4). A refused combat action shows the rules reason as its message, without `moveRequiredFt`.
- **Combat simplifications from ADR 0015** apply: everyone sees everyone, cover is per square, elevation is 0, and the DM issues monster actions.
- **Authentication:** development persona tokens only (ADR 0009), and one player persona.
- **Operations:** there is no rate limiting. The GitHub Actions workflow has not run on GitHub (there is no remote); `pnpm validate:ci-local` mirrors it.

## Coverage Ledger

Due surfaces (`docs/GATE_COVERAGE.md` row 90, plus the Stage 80 surfaces Gate 02 deferred here):

| Row                | Surface                                                                                                                      | Reproducible access                                                              | Opus evidence                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 90                 | Eligibility (range, slot, Reaction, cover, Incapacitated, the dead, spent Reaction regained, several candidates)             | Shaman `CastSpell` as DM; DM-authored sheets and characters; encounter view (DM) | `packages/combat/src/reactions/eligibility.test.ts`                                                                                                       |
| 90                 | Opening, resolution, outcomes, perspective views; invalid Counterspell rejected by the Rules                                 | `UseReaction`, `DeclineReaction`; encounter view; context                        | `reactions/lifecycle.test.ts`, `apps/server/src/http/reaction-routes.test.ts`, `packages/context/src/reaction.test.ts`                                    |
| 90                 | Expiry; double-spend; stale and late answers; non-candidates; the pause; outsiders                                           | `CloseReactionWindow`; repeated answers; any command during a window             | `reactions/integrity.test.ts`                                                                                                                             |
| 90                 | Concurrency (answer racing a close, in both orders; the same candidate twice; two candidates; bursts on two engines)         | Parallel HTTP requests; the test harness's second engine                         | `reactions/concurrency.test.ts`, `apps/server/src/world-engine/reaction.integration.test.ts`                                                              |
| 90                 | Ordering and replay (idempotent retries, as-of reads, restart without randomness, re-decision)                               | Repeated command IDs; `pnpm test:integration`                                    | `reactions/{integrity,undo,property}.test.ts`, `reaction.integration.test.ts`                                                                             |
| 90                 | Undo and rewind with an open window (trigger, answers, earlier commands, unrelated commands, every point of a window's life) | `UndoCommand` as DM                                                              | `reactions/undo.test.ts`, `reactions/property.test.ts`, `reaction.integration.test.ts`                                                                    |
| 80                 | Combat: encounters, initiative, turns, movement, attacks, spells, Detect Magic, 0 HP, death saves                            | Combat commands; encounter view                                                  | `packages/combat/src/{encounter,movement,attack,spells,dying,history}.test.ts`, `apps/server/src/world-engine/combat.integration.test.ts`                 |
| 80                 | Encounter view and context in combat: no non-party HP, initiative, or stat blocks for players; no fight visible to outsiders | Encounter route; context route                                                   | `apps/server/src/http/encounter-routes.test.ts`, `packages/context/src/{combat,leakage}.test.ts`                                                          |
| 50–70 (regression) | Context actions and reasons in combat; command results; knowledge revealed by Detect Magic; placement undo footprints        | Context route; player commands; knowledge routes                                 | `packages/context/src/*.test.ts`, `packages/combat/src/spells.test.ts`, `reactions/undo.test.ts` (leaving the battlefield), the Gate 02 regression suites |
| All                | Persistence and restart                                                                                                      | PostgreSQL server                                                                | `apps/server/src/world-engine/*.integration.test.ts`                                                                                                      |

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

Write `reviews/ASTRA_GATE_03_REPORT.md` using `ASTRA_REVIEW.md`. Do not modify source implementation. End with PASS or FAIL and STOP.

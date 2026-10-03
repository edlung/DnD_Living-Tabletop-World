# Stage 80 Completion Report — Combat Engine

- Work order: `work-orders/OPUS_STAGE_080.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `0500915` (branch `main`)
- Formal gate: none at this stage. Stage 90 (reactions, Counterspell window) is next and was not started.
- Status: **COMPLETE**

## Decisions

| ADR                                                                                                                                                                                           | Decision                                                                                                                                                                                      | Approval                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [0015](../docs/adr/0015-combat-engine.md)                                                                                                                                                     | Encounters on a 5-ft battlefield; initiative; turn economy; movement; cover; attacks; slice spells and stat-block spells; conditions; 0 HP; goblin content; context in combat; encounter view | Approved as written by the owner on 2026-10-04, before implementation. Owner choice: SRD 5.2.1 death saving throws for characters at 0 HP |
| Amendments: [0004](../docs/adr/0004-module-boundaries.md), [0011](../docs/adr/0011-ruleset-srd-5-2.md), [0012](../docs/adr/0012-context-engine.md), [0013](../docs/adr/0013-investigation.md) | `@ltw/combat` edges; combat mechanics in the rules; context legality in combat; Detect Magic and `magic` clues                                                                                | Follow from ADR 0015                                                                                                                      |

## Delivered

- **`@ltw/combat`** (pure; rules, domain, contracts). It implements the domain `CombatPort`, which the server injects into the World Engine.
  - `StartCombat` (DM): validates the battlefield and combatants, then rolls and orders initiative.
  - `MoveCombatant`: step by step; difficult terrain costs double; no passing through living creatures; standing up from Prone costs half Speed.
  - `Attack`: cover adds to AC; Advantage and Disadvantage from Prone, Unconscious, and long range; critical hits double every die (Hunter's Mark and the goblin Advantage die included); Longbow Slow lasts until the attacker's next turn; Extra Attack.
  - `CastSpell` for characters: Fireball hits allies and the caster, with cover on the Dex save and an automatic failure when Unconscious. Also Misty Step, Healing Word, Hunter's Mark (concentration with a target), and Detect Magic, which reveals `magic` clues. Counterspell returns `NO_VALID_TRIGGER`.
  - `CastSpell` for creatures: stat-block spell attacks and saves (Ashen Bolt, Binding Hex).
  - `EndTurn`: skips the dead; at the start of a turn, Slow ends and a dying character rolls its death save.
  - `EndCombat` (DM).
  - 0 HP: monsters die; characters fall Unconscious and Prone, lose Concentration, and make death saves. Damage at 0 HP adds failures; massive damage kills; healing revives.
- **Determinism.** Each combat command draws 64 uint32 values at resolution, and they are stored with the command. Events record every roll. Replay, retries, and re-decision never draw again. Every combat command reads and writes the encounter, so undo unwinds strictly in reverse order.
- **Context Engine in combat.**
  - Shows distance, range with `moveRequiredFt`, cover, and turn reasons.
  - Adds a `fireball` action centered on the selected combatant, with `area.affected` and `ALLY_IN_AREA` (a warning only).
  - `longbow_attack` gets the `LONG_RANGE` hint.
  - Non-party HP stays hidden.
- **Server.**
  - Crypto entropy and the combat port are composed in `runtime.ts`.
  - New route `GET /campaigns/:id/encounter?perspective=…`: the DM sees initiative and all HP; a combatant's player sees party HP only and names only when known; any other perspective gets `encounter: null`.
  - Player combat outcomes go through `forPlayer`.
- **Fixtures.**
  - `combat-seed.json` (seeded last): three Goblin Raiders and the Goblin Shaman, created unplaced, with stat blocks.
  - `road-ambush.json`: placements and the `StartCombat` scenario (wagons give half cover, the ditch is difficult terrain).

## Validation gate evidence — "Deterministic combat integration tests pass"

| Item                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL determinism        | `apps/server/src/world-engine/combat.integration.test.ts`: a two-round ambush (Fireball, Hunter's Mark, Ashen Bolt, longbow kill). A restarted engine with no entropy source reloads the same state, and a retry is `duplicate` with the same outcome. `replay`, `checkWorldIntegrity`, and `redecideEffective` with the combat port all agree. Undo is refused out of order (`UNDO_UNSAFE`) and succeeds in reverse back to the pre-fight state |
| Encounter lifecycle           | `packages/combat/src/encounter.test.ts`: initiative tie-breaks; DM-only start and end; invalid encounters; turn order and round wrap; the dead are skipped; economy reset; Slow removed at end of combat                                                                                                                                                                                                                                         |
| Movement                      | `movement.test.ts`: costs, difficult terrain, gaps, occupied squares, bounds, turn                                                                                                                                                                                                                                                                                                                                                               |
| Attacks                       | `attack.test.ts`: cover AC; crit doubling; monster death; Slow and its expiry; Hunter's Mark on the marked target only; Extra Attack; total cover; `moveRequiredFt`; DM-only goblins                                                                                                                                                                                                                                                             |
| Spells                        | `spells.test.ts`: Fireball saves with cover and half damage; the caster in her own area breaks Concentration; Misty Step; Healing Word; Counterspell; Detect Magic once; goblin spell attack and half-damage save                                                                                                                                                                                                                                |
| 0 HP                          | `dying.test.ts`: Unconscious and Prone; a close crit with the extra die gives two failures; death by failures; natural 20 revives (still Prone, stands for half Speed); stable after three successes; massive damage; healing revives                                                                                                                                                                                                            |
| Replay / oracle / undo        | `history.test.ts`: in memory, same checks as on PostgreSQL                                                                                                                                                                                                                                                                                                                                                                                       |
| Context alignment and leakage | `packages/context/src/combat.test.ts` (distance, area, ally hint, range, turn, engine alignment); `leakage.test.ts` (goblin statistics never change any context; marker crawl in combat)                                                                                                                                                                                                                                                         |
| HTTP                          | `apps/server/src/http/encounter-routes.test.ts`: perspective views, no DM data for the player, player outcome without events, refusals without details, DM-only start/end                                                                                                                                                                                                                                                                        |

## Commands and results (Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                  | Result                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm validate:ci-local` | PASS (format, lint, typecheck, budget, unit, clean build, migrate ×2, seed ×2, integration) |
| `pnpm test`              | PASS — 65 files, 815 tests                                                                  |
| `pnpm test:integration`  | PASS — 7 files, 27 tests                                                                    |
| `pnpm context-budget`    | PASS — 231 files, 0 over 500 lines                                                          |
| `pnpm seed:ravenford` ×2 | PASS — 91 commands, version 100, 25 entities; the second run writes nothing                 |

## Assumptions and limitations

- A character who dies from a death save at the start of their turn still holds that turn until it is ended.
- `ALLY_IN_AREA` counts the caster as a party member inside the area.
- Over HTTP, players get combat refusals as a code and reason only. `moveRequiredFt` is available from the Context Engine.
- A character who is not a combatant acts as out of combat during an encounter. Fireball and Misty Step need the encounter.
- The 64-value pool covers the worst slice action (a level-9 Fireball against 16 combatants). An exhausted pool throws instead of rolling silently.
- Not in Stage 80, per ADR 0015 §7: reactions and opportunity attacks, Dash/Dodge/Disengage/Hide, line of sight, elevation, and monster AI.

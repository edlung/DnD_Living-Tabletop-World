# Combat Engine (`@ltw/combat`)

Decides encounter commands for the World Engine through the domain's `CombatPort`. Authority: `docs/adr/0015-combat-engine.md` (owner-approved), on top of ADR 0011 (rules) and ADR 0006 (undo). Pure: no AI, no I/O; randomness only from the command's recorded entropy pool (`poolDice`).

| Concern                                                           | File                    |
| ----------------------------------------------------------------- | ----------------------- |
| Port implementation and dispatch (`createCombatEngine`)           | `src/engine.ts`         |
| One view of sheet or stat block; full-value vitals events         | `src/vitals.ts`         |
| Encounter lookups, cover, occupancy, turn state                   | `src/battlefield.ts`    |
| Rejection mapping, premises                                       | `src/refusal.ts`        |
| `StartCombat` (initiative), `EndCombat`                           | `src/start-end.ts`      |
| Turn order, start-of-turn effects (Slow ends, death saves)        | `src/turns.ts`          |
| `MoveCombatant`                                                   | `src/movement.ts`       |
| Attack legality (shared with the Context Engine)                  | `src/legality.ts`       |
| `Attack` resolution (crits, Hunter's Mark, Slow, goblin die)      | `src/attack.ts`         |
| Spell legality: character slice spells and stat-block spells      | `src/spell-legality.ts` |
| Character spell resolution (Fireball, Healing Word, Detect Magic) | `src/spells.ts`         |
| Stat-block spell resolution (Ashen Bolt, Binding Hex)             | `src/monster-spells.ts` |
| Spell saving throws (cover, Unconscious auto-fail)                | `src/saves.ts`          |
| Damage, 0 HP, death-save failures, concentration, healing         | `src/damage.ts`         |
| Perspective-scoped encounter view                                 | `src/view.ts`           |

Rules:

- Mechanics come from `@ltw/rules`; this package only gathers inputs from the encounter. A new mechanic needs ADR 0011/0015 first.
- Every combat command reads and writes the encounter, so undo unwinds combat strictly in reverse order. Character resources change through `CharacterSheetSet`, monster vitals through `StatBlockSet`, encounter changes through full-value events.
- Every decision records `PremisesRecorded`; dice are consumed in a fixed order (attack d20, damage dice, extra dice, then saves) so replays and the re-decision oracle (`redecideEffective`) agree.
- Legality functions are shared with `@ltw/context`; keep both callers aligned (`packages/context/src/combat.test.ts`).
- Views are built field by field: initiative, stat blocks, and non-party HP are DM data.
- Tests use `src/testing/road.ts`: the full Ravenford seed plus `combat-seed.json`, the ambush scenario `road-ambush.json`, and scripted entropy (`roll(sides, ...faces)`; unqueued draws roll the middle face). Stage 90 (reactions, Counterspell window) is out of scope here.

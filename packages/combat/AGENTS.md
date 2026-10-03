# Combat Engine (`@ltw/combat`)

Decides encounter commands for the World Engine through the domain's `CombatPort`. Authority: `docs/adr/0015-combat-engine.md` and `docs/adr/0016-reaction-engine.md` (both owner-approved), on top of ADR 0011 (rules) and ADR 0006 (undo). Pure: no AI, no I/O; randomness only from the command's recorded entropy pool (`poolDice`).

| Concern                                                                              | File                           |
| ------------------------------------------------------------------------------------ | ------------------------------ |
| Port implementation and dispatch (`createCombatEngine`)                              | `src/engine.ts`                |
| One view of sheet or stat block; full-value vitals events                            | `src/vitals.ts`                |
| Encounter lookups, cover, occupancy, turn state                                      | `src/battlefield.ts`           |
| Rejection mapping, premises                                                          | `src/refusal.ts`               |
| `StartCombat` (initiative), `EndCombat`                                              | `src/start-end.ts`             |
| Turn order, start-of-turn effects (Slow ends, death saves)                           | `src/turns.ts`                 |
| `MoveCombatant`                                                                      | `src/movement.ts`              |
| Attack legality (shared with the Context Engine)                                     | `src/legality.ts`              |
| `Attack` resolution (crits, Hunter's Mark, Slow, goblin die)                         | `src/attack.ts`                |
| Spell legality: character slice spells and stat-block spells                         | `src/spell-legality.ts`        |
| Character spell resolution (Fireball, Healing Word, Detect Magic)                    | `src/spells.ts`                |
| Stat-block spell resolution (Ashen Bolt, Binding Hex)                                | `src/monster-spells.ts`        |
| Spell saving throws (cover, Unconscious auto-fail)                                   | `src/saves.ts`                 |
| Damage, 0 HP, death-save failures, concentration, healing                            | `src/damage.ts`                |
| Perspective-scoped encounter view                                                    | `src/view.ts`                  |
| Reaction matcher and Counterspell eligibility (shared with context)                  | `src/reactions/eligibility.ts` |
| Suspending a cast in a reaction window                                               | `src/reactions/suspend.ts`     |
| Answers and the DM's close (`UseReaction`, `DeclineReaction`, `CloseReactionWindow`) | `src/reactions/respond.ts`     |
| Resolving a suspended cast after the window closes                                   | `src/reactions/complete.ts`    |
| The open window as each perspective sees it                                          | `src/reactions/view.ts`        |

Rules:

- Mechanics come from `@ltw/rules`; this package only gathers inputs from the encounter. A new mechanic needs ADR 0011/0015 first.
- Every combat command reads and writes the encounter, so undo unwinds combat strictly in reverse order. Character resources change through `CharacterSheetSet`, monster vitals through `StatBlockSet`, encounter changes through full-value events.
- Every decision records `PremisesRecorded`; dice are consumed in a fixed order (attack d20, damage dice, extra dice, then saves) so replays and the re-decision oracle (`redecideEffective`) agree.
- Legality functions are shared with `@ltw/context`; keep both callers aligned (`packages/context/src/combat.test.ts`).
- Views are built field by field: initiative, stat blocks, and non-party HP are DM data.
- A cast someone could counter is suspended: its effect is decided only when the window closes, on the state after the answers (`foldDrafts`) and with the closing command's dice. The pause rule itself lives in the domain kernel (`kernel/decide/reaction-pause.ts`), so no command path skips it.
- Someone outside the encounter must not learn it exists: their combat commands answer `NOT_IN_COMBAT` and their answers `REACTION_WINDOW_CLOSED`, exactly as with no fight (`reactions/integrity.test.ts`).
- Tests use `src/testing/road.ts`: the full Ravenford seed plus `combat-seed.json`, the ambush scenario `road-ambush.json`, and scripted entropy (`roll(sides, ...faces)`; unqueued draws roll the middle face). Reaction tests add `testing/reactions.ts` (Seren, a test-only second Counterspell caster), `testing/racing.ts` (a rival engine on the same store that loses a race on purpose), and `testing/verify.ts` (replay, integrity, re-decision).

# Rules (`@ltw/rules`)

Deterministic slice rules on SRD 5.2.1. Authority: `docs/adr/0011-ruleset-srd-5-2.md` (owner-approved); attribution in `NOTICE.md`. Rules decide legality; AI never does (invariants 8, 9). Legal but suboptimal choices stay legal (invariant 20).

| Concern                                                                | File                    |
| ---------------------------------------------------------------------- | ----------------------- |
| Injected dice, scripted dice                                           | `src/dice.ts`           |
| Grid distance, path cost                                               | `src/grid.ts`           |
| Modifiers, proficiency, DCs, multiclass slots                          | `src/character-math.ts` |
| D20 tests, attack rolls, damage                                        | `src/d20.ts`            |
| Slice spells and weapons (data)                                        | `src/catalog.ts`        |
| Turn economy, movement, illegal reasons                                | `src/turn.ts`           |
| Spell legality and resource use                                        | `src/casting.ts`        |
| Counterspell                                                           | `src/reactions.ts`      |
| Concentration                                                          | `src/concentration.ts`  |
| Weapon attacks                                                         | `src/attacks.ts`        |
| Healing Word, Fireball, HP, checks                                     | `src/effects.ts`        |
| Combat: cover, circumstances, death saves, initiative order (ADR 0015) | `src/combat.ts`         |

Rules:

- Pure functions only. No clocks, no `Math.random`, no I/O. Randomness comes only from `Dice`; resolvers return the rolls they used.
- A new rule, spell, or condition needs an ADR 0011 entry, or a new ADR, before code. Encode mechanics; never copy SRD text.
- Illegal results carry a typed `reason` and, where useful, a `resolution` (for example `moveRequiredFt`).
- Tests use `src/testing/elowen.ts` (the approved fixture) and `scriptedDice`.

# Item possession (`src/items/`)

Who carries an item entity, whether it is worn, and what using it does. Authority: `docs/adr/0039-item-possession.md` (Stage 460). The catalog (data, validation) is `@ltw/contracts` `items/`; the rules here only apply it.

| Concern                                               | File            |
| ----------------------------------------------------- | --------------- |
| `Possession`, carried/worn queries, armor class delta | `records.ts`    |
| Event payloads and the `possession` undo restore      | `events.ts`     |
| Fold and restore                                      | `evolve.ts`     |
| `GrantItem` (DM/system) and the player commands       | `decide.ts`     |
| Footprints (reads/writes) of the item events          | `footprints.ts` |
| Structural invariants                                 | `integrity.ts`  |
| Carrier-only inventory view                           | `view.ts`       |

Rules:

- Sheet changes (armor class, healing, conditions) are an ordinary `CharacterSheetSet` beside the item event; never fold a sheet change inside an item event.
- A held item's old placement is ignored; perception shows a carried item only to its carrier (`investigation/perception.ts`). A drop places the item with `EntityPlaced`.
- Player commands record premises (`premisesEvent`) and refuse only a combatant during an encounter (`COMBAT_ALREADY_ACTIVE`): someone outside a fight must not learn one runs (Gate 03, G03-H06).
- Only the DM or a trusted system process may grant. Stacks move whole; weight is never enforced.
- Catalog IDs are stable; never rename or reuse one after release.

# Item possession (`src/items/`)

Who carries an item entity, whether it is worn, and what using it does. Authority: `docs/adr/0039-item-possession.md` (Stage 460). The catalog (data, validation) is `@ltw/contracts` `items/`; the rules here only apply it.

| Concern                                                | File            |
| ------------------------------------------------------ | --------------- |
| `Possession`, carried/worn queries, armor class delta  | `records.ts`    |
| The catalog: Ravenford's and the SRD's, made on a base | `catalog.ts`    |
| Event payloads and the `possession` undo restore       | `events.ts`     |
| Fold and restore                                       | `evolve.ts`     |
| `GrantItem` (DM/system) and its refusals               | `grant.ts`      |
| The checks every item decision shares                  | `handling.ts`   |
| The player commands                                    | `decide.ts`     |
| Attunement (the DM's, or the table's in a Short Rest)  | `attune.ts`     |
| Charges, identifying, the dawn's recharge              | `charges.ts`    |
| Footprints (reads/writes) of the item events           | `footprints.ts` |
| Structural invariants                                  | `integrity.ts`  |
| Carrier-only inventory view, and the party's stash     | `view.ts`       |
| The party's stash: giving to it and taking from it     | `stash.ts`      |
| Coins shared out with change (`SplitCoins`)            | `coins.ts`      |

Rules:

- Sheet changes (armor class, healing, conditions) are an ordinary `CharacterSheetSet` beside the item event; never fold a sheet change inside an item event.
- A held item's old placement is ignored; perception shows a carried item only to its carrier (`investigation/perception.ts`). A drop places the item with `EntityPlaced`.
- Player commands record premises (`premisesEvent`) and refuse only a combatant during an encounter (`COMBAT_ALREADY_ACTIVE`): someone outside a fight must not learn one runs (Gate 03, G03-H06).
- Only the DM or a trusted system process may grant. Stacks move whole; weight is never enforced.
- Catalog IDs are stable; never rename or reuse one after release.
- Read an entry through `itemEntry` (an id) or `entryOf` (a possession): a magic weapon, armor,
  shield or ammunition made on a base reads as the base with the magic's name and magic
  (docs/adr/0054-items-as-data.md §5); never read a possession's catalog id alone.
- An unidentified item reaches its carrier's view as what it looks like (its base, or the unknown
  magic item), never its magic, charges or words; its curse shows to the DM, or to its carrier once
  attuned (`view.ts`). Dice (a potion's healing, the dawn's charges) come from the command's
  entropy, which the World Engine draws.

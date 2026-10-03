# Stage 40 Completion Report — Character & Rules Kernel

- Work order: `work-orders/OPUS_STAGE_040.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `3e7c76dea8abeebddc17647f2cc00e5d423fbeaa` (branch `main`)
- Formal gate: none at Stage 40. Reaction integrity is reviewed at Gate 03 (after Stage 90).
- Status: **COMPLETE — awaiting owner authorization for Stage 50**

## Decisions

| ADR                                         | Decision                                                  | Approval                                                                                     |
| ------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [0011](../docs/adr/0011-ruleset-srd-5-2.md) | SRD 5.2.1 slice ruleset, grid, Elowen's sheet, randomness | Owner choices made, then the ADR approved as written on 2026-10-03, before any legality code |

**Post-approval correction (disclosed to the owner):** the ADR first said "one spell slot per turn, on the creature's _own_ turn". SRD 5.2.1 says "on a turn", so the ADR and the code now follow the source. In practice Elowen cannot cast a slotted spell on her turn and also Counterspell with a slot during that same turn. Counterspell on an enemy's turn is unaffected.

`NOTICE.md` carries the CC-BY-4.0 attribution required by SRD 5.2.1. The code encodes mechanics only and copies no SRD text. Rule facts were checked against the official SRD 5.2.1 PDF: Counterspell, Fireball, Healing Word, Misty Step, Hunter's Mark, Detect Magic, Magic Initiate, the multiclass slot table and its rounding, one slot per turn, Concentration DC, natural 20/1, Critical Hits, and Favored Enemy uses.

## Delivered

- **Contracts:** the character sheet schema with cross-field checks, and `SetCharacterSheet`.
- **Rules** (`packages/rules/`, pure, injected dice):
  - grid distance and path cost;
  - derived modifiers, DCs, and multiclass slots;
  - D20 tests and attack rolls;
  - spell legality: range with `moveRequiredFt`, visibility, slots and upcasting, slot-free casts, action economy, one slot per turn, Concentration replacement;
  - Counterspell eligibility and resolution;
  - Concentration saves and ending;
  - movement with difficult terrain and Slowed;
  - Longbow attacks with range bands, cover, Archery, Extra Attack, critical doubling including Hunter's Mark;
  - Healing Word and Fireball.
- **Domain:** canonical character sheets via `SetCharacterSheet` (DM/system, undoable).
- **Fixture:** `rules-seed.json` with Elowen's reconciled sheet: Ranger 7 (Hunter) / Wizard 8 (Evoker); slots 4/3/3/3/2/1; Healing Word through Magic Initiate (Wisdom).

## Validation gate evidence

| Gate item        | Evidence (`packages/rules/src/*.test.ts`)                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Range            | Every slice spell at exactly its range and 5 ft beyond; `moveRequiredFt`; Longbow normal, long (Disadvantage), and out-of-range bands; Misty Step 30 ft; Counterspell 60 ft                   |
| Slots            | Slot level too low, none left, upcasting, expenditure; three slot-free Hunter's Marks and one slot-free Healing Word, then slots; one slot per turn on any turn                               |
| Reactions        | Counterspell trigger validity (distance, visibility, components), slot ≥ 3, one Reaction per round restored on her own turn, Incapacitated, resolution through the target's Constitution save |
| Movement         | Speed limit to the square, diagonals, difficult terrain, Slowed, off-turn, Incapacitated, invalid paths                                                                                       |
| Concentration    | DC formula including the 30 cap, keep or lose on the save, replacement by a new Concentration spell, ending on Incapacitated or 0 HP                                                          |
| Skill resolution | Elowen's six skills, DC ties, Advantage/Disadvantage/cancel, no natural 20/1 effect on checks                                                                                                 |

Mutation checks (one slot per turn removed, range off by one square, Reaction ignored, Concentration cap removed) were each detected.

## Commands and results (Node 25.8.1, pnpm 11.11.0, PostgreSQL 18)

| Command                                                   | Result                                                 |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm validate:ci-local`                                  | PASS                                                   |
| `pnpm test`                                               | PASS — 30 files, 547 tests                             |
| `pnpm test:integration`                                   | PASS — 4 files, 17 tests                               |
| `pnpm context-budget`                                     | PASS — 130 files, 0 over 500 lines                     |
| Fresh volume: `pnpm db:migrate`, `pnpm seed:ravenford` ×2 | PASS — 66 commands → version 75; reseed writes nothing |

## Assumptions and limitations

- Only slice mechanics are implemented. Other spells, conditions, and features need an ADR 0011 entry first.
- Gameplay commands that change resources (casting in combat, damage) and roll recording in events begin at Stage 80. This stage provides the pure rules and canonical sheets.
- Monster statistics (Goblin Raiders, Goblin Shaman) are campaign content for Stage 80. The Shaman is not in the SRD and will be DM-authored.
- Sheets are canonical DM data and are not yet served to players; that is the Stage 50 Context Engine, through perspectives.

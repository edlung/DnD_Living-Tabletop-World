# 0043. The DM's screen: the DM's hand, a running fight, the session

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 620,
  owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Amends ADR 0015 §3–5 (the DM changes a
  running fight), ADR 0010 (a session pauses), ADR 0034's shell (the open sheet is remembered for a
  tab) and ADR 0040 (a check asked of several at once).
- Context: a DM at a table runs the game from a laptop or an iPad. Until now the DM could start and
  end fights, act for players and author the world, but not apply damage, healing or a condition by
  hand, change a fight's order, see the party at a glance, keep notes, or run a session's start,
  pause and end.

## Decision

1. **The DM's hand is the World Engine's.** `AdjustHitPoints` (damage of a type, or healing),
   `SetCondition` and `SetInspiration` (Heroic Inspiration on a character sheet) are DM commands
   with a required reason (1–200 characters). Damage and healing run through the fight's own rules
   — dying and death saves, massive damage, a Concentration save, regaining consciousness — in or
   out of a fight; the narrative record is the DM's own `HitPointsAdjusted`, never a creature's
   attack. Each decision reads the target's vitals, so undoing an earlier change of the same
   creature after a later one is refused as unsafe instead of silently wiping the later one. A
   ruling — what an improvised action led to — is a party memory (`RecordMemory`, CONSEQUENCE) with
   the DM's reason. Reasons are DM data kept with the stored command; the DM's history lists every
   change by hand with its reason and the kernel's undo. A check may be asked of up to eight
   characters at once as one group (`groupId`, migration 0029).
2. **A running fight changes.** `AddCombatant` (someone at the fight's place, on a free square,
   initiative rolled or the total the DM names), `RemoveCombatant` (with a reason; the turn passes
   on if it was theirs; their slowing ends), `DelayTurn` (the current combatant, before spending
   anything and able to act, waits until after a later combatant this round; its turn's start does
   not repeat) and `SetInitiative` (the DM's total stands; the recorded roll and modifier stay). One
   `CombatOrderChanged` holds the whole new order and the turn's place. A changed combatant is
   placed by its total after any with the same total; the rest keep their order. Fights hold up to
   40 combatants.
3. **The control layout.** The DM's dock gains a Party sheet: every character at a glance (hit
   points, Armor Class, conditions, inspiration, passive Perception, Insight and Investigation, spell
   slots, death saves) with the DM's hand on each, a check for everyone at the table, and a ruling;
   it takes most of the screen's height on a laptop or an iPad. The Encounter sheet's turn order
   takes the fight's changes. Forms check themselves before sending; the World Engine decides again.
4. **A reload comes back.** The open sheet's name is remembered for the tab (sessionStorage), so a
   reload, or an iPad that slept and reloaded, comes back to it; never world data.
5. **Notes.** The DM's notes (title and text) are descriptive DM data beside the world (migration
   0029), the DM's only, never canonical, at most 200 a campaign.
6. **A session's lobby and lifecycle** (620d, below).

## Consequences

- Contracts: the hand and fight-change commands, `DAMAGE_TYPES`, `MAX_COMBATANTS` 40, the
  history's hand entries, group check requests, notes. Domain: `HitPointsAdjusted`,
  `CombatOrderChanged` (footprints, folds, undo). Combat: `hand.ts`, `order.ts`. Server: the DM's
  history, `dm/note-*`, the check request groups. Client: `dm/party-sheet.tsx`, `party-card.tsx`,
  `hand-forms.tsx`, `notes-sheet.tsx`, `combat/turn-order-controls.tsx`, `styles/dm-screen.css`,
  `i18n/ru-dm-screen.ts`.
- Migration 0029 is additive: an older build ignores the column and the table.

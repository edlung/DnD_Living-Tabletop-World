# 0053. Monsters as data: the SRD's stat blocks in the World Engine

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 650,
  decisions 6 and 19, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR 0051
  §3–4 (the mechanics layer; the catalogs feed the game) and ADR 0015 §3 (stat blocks) to the SRD
  5.2.1's 330 stat blocks; Ravenford's four keep their own.
- Context: the DM fought with four stat blocks and a Multiattack of repeated attacks. A table
  expects the SRD's bestiary: a creature found by name, type or challenge rating, set on the
  board, its attacks with their extra damage, a breath that fills a cone, Recharge and per-day
  uses, bonus actions and reactions, Pack Tactics, Magic and Legendary Resistance, legendary
  actions, condition immunities, and the encounter's difficulty before it starts.

## Decision

1. **From the text to a stat block.** `scripts/srd/monster-mechanics.ts` reads each stat block's
   lines into the engine's stat block: Armor Class, hit points, size (the first of a choice),
   speeds (walk, fly with hover, swim, climb, burrow), senses, scores and saves, initiative,
   damage resistances, immunities and vulnerabilities, **condition immunities**, and its attacks —
   melee, ranged, or both ("Melee or Ranged Attack Roll") — each with its damage and the damage
   it adds ("plus 3 (1d6) Fire damage"). A Multiattack's count becomes the attacks of its Attack
   action, any of its attacks in any order. What it cannot read stays text the DM resolves.
2. **Actions with a save** ("Dexterity Saving Throw: DC 20, each creature in a 60-foot Cone.
   Failure: 63 (18d6) Fire damage. Success: Half damage.") become area actions resolved as a
   spell's save (ADR 0052 §5): its area on the board, one damage roll, half or none. **Recharge**
   (a d6 at the start of the creature's turn, recorded) and **per-day uses** limit them.
3. **The DM's catalog**: the DM finds a stat block by name, type or challenge rating and adds it
   to the campaign — a new creature with that stat block — and to a running fight on a chosen
   square. Before a fight starts, its **difficulty** for the party: the SRD 5.2.1's XP budget per
   character level (Low, Moderate, High) against the XP of its creatures.
4. **Traits and reactions as data where regular**: Pack Tactics (Advantage with an ally within 5
   ft of the target), Magic Resistance (Advantage on saves against spells), Legendary Resistance
   (a failed save made a success, per day), Parry (+AC against one melee hit, a reaction), and
   **legendary actions** (uses per round, an action after another creature's turn); the rest of a
   block's traits and actions are shown to the DM as the SRD gives them.

## Consequences

- The stat block gains `conditionImmunities`, an attack's `extraDamage`, and save actions with
  their area, recharge and uses; old stat blocks read as before (every field optional).
- The DM screen shows a creature's whole SRD text beside its engine stats; a player sees what the
  party knows of it, never its block.
- Stage 650c runs in parts: the conversion, the catalog and adding creatures; save actions,
  Recharge and per-day uses; traits, reactions, legendary actions and the encounter's difficulty.

## Invariants affected

Preserves 1, 8 and 9: the catalog describes; the server rolls every die and records every effect;
knowledge isolation holds — a player's view of a creature is the party's knowledge of it.

# 0046. Reactions beyond Counterspell: opportunity attacks, attack reactions, rerolls

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 640,
  owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Amends ADR 0016 (the reaction window
  gains triggers beside a spell) and ADR 0045 §5 (Disengage's mark and Ready's held attack now act).
- Context: ADR 0016 built one reaction — Counterspell — and deferred opportunity attacks. A table
  that plays by the SRD 5.2.1 rules expects a raider to swing at someone who runs past, a rogue to
  halve a hit with Uncanny Dodge, a held arrow to fly when its moment comes and the DM's Heroic
  Inspiration to buy a second roll. The server decides each, and the encounter waits for each
  answer, as it waits for a Counterspell.

## Decision

1. **The window, generalized.** The reaction window of ADR 0016 §1 stays the one mechanism: one
   window open at a time, the encounter paused (`REACTION_PENDING`), every answer an event, the DM's
   close (`CloseReactionWindow`) expiring whoever has not answered, the same undo rules. Its trigger
   is one of: a spell being cast (ADR 0016), a creature leaving reach (§2), an attack roll (§3) or
   damage taken (§4). Each candidate carries the reactions it may use in this window; an answer uses
   one of them (`UseReaction` with `reaction`) or declines. A candidate is answered for by its
   character's player, the DM, or — for a creature a player commands (ADR 0044 §7) — that player.
   Stored windows stay readable: the trigger's kinds and the reactions only grow; a window of before
   carries no reactions list and means Counterspell.
2. **Opportunity attacks.** A combatant that moves by its own movement (`MoveCombatant`) out of a
   hostile creature's reach provokes it, unless the mover took Disengage this turn. Hostile: the
   party and the hostile side to each other; a neutral combatant neither provokes nor reacts. The
   provoked creature may react when it is alive, not Incapacitated, its Reaction unused, it can see
   the mover (the mover is not Invisible, the creature not Blinded) and it can make a melee attack:
   a stat block's melee attack, a character's melee weapon, else an Unarmed Strike (1 + Strength
   bludgeoning). Reach is 5 ft, or a stat block melee attack's own reach (reach weapons: 640d). The
   move stops on the last square inside the reach and the window opens with the rest of the path
   suspended; an `opportunity-attack` answer makes one melee attack against the mover at once,
   resolved as any attack (roll, damage, conditions, Concentration, death), and spends the
   Reaction. When nobody is pending the window resolves and the rest of the path goes on — unless
   the mover can no longer move (dead, at 0 HP, Incapacitated, Speed 0), when it stays — and may
   open the next window at the next reach it leaves. Misty Step's teleport provokes nothing.
3. **An attack roll's window.** After a weapon attack's d20 and before its damage:
   - **Heroic Inspiration.** An attacking character that holds Heroic Inspiration and missed may
     spend it to reroll the d20 and must use the new roll (`inspiration-reroll`; not a Reaction).
     Offered on a miss only: rerolling a hit chases a Critical Hit, which tables rarely do.
   - **Shield** (level 1, Reaction, when hit by an attack roll): +5 AC until the start of the
     shielded creature's next turn, the triggering attack included. Offered only when +5 would turn
     this hit into a miss — never against a Critical Hit, which hits regardless. Spends a slot.
   - **Uncanny Dodge** (Rogue 5, Reaction, when an attacker it can see hits it): the attack's
     damage against it is halved, rounded down. The damage is rolled first, so the player sees what
     they halve.
     The attacker's reroll is decided first; the target's Shield or Uncanny Dodge (one Reaction:
     either) after the hit is known. Monster attacks and character attacks alike; spell attacks wait
     for Stage 650's spells.
4. **Damage taken.** **Hellish Rebuke** (level 1, Reaction, when damaged by a creature within 60 ft
   it can see): 2d10 fire to that creature, +1d10 a slot level above 1, a Dexterity save for half
   against the reactor's spell save DC. The window opens after the damage is applied.
5. **The readied attack.** A creature holding a readied attack (640b's Ready) takes its Reaction
   to make it against the readied creature when its player (or the DM) judges the trigger has
   come: any time outside its own turn until its next turn starts, while it can react and the
   target is in reach or range (`MakeReadiedAttack`, no window: the trigger is the player's words,
   which the DM sees). Making it ends the readiness. The player sees the held attack and its
   trigger, with the button, while another creature's turn runs; the DM sees every readied attack
   and makes a creature's.
6. **Heroic Inspiration on the table's checks.** A player whose character holds Heroic
   Inspiration may spend it on the character's latest roll when that is a check at the table
   (ADR 0040), rolled by the app or entered from the player's own dice (ADR 0044 §4): no table or
   World Engine roll of the character's since, and not a save its conditions fail outright. The
   rules say "reroll any die": the lower d20 is rolled again — the dropped one with Advantage, the
   kept one with Disadvantage, the only die a reroll can change for the better — and the check is
   counted anew in the mode it was rolled in (its conditions counted then), its modifier kept. The
   new roll counts, a request it answered takes its total, and the first stays in the log marked
   as no longer counting. Where the dice are the players' own, the new die's face may be entered;
   the DM confirms it as any entered roll. The inspiration is spent through the World Engine
   (`SpendInspiration`, under the roll's own command ID, so a second press spends nothing more); the
   reroll is written once per roll (migration 0033: `reroll_of`, unique, and `check_mode`, the mode
   rolled in). The DM may do it for a character. The World Engine's saving throws inside a spell's
   resolution are not rerolled yet: a save window comes with Stage 650's spells.
7. **Not here.** Feather Fall waits for falling (640f). Monster reactions from stat blocks (Parry
   and the like) come with Stage 650's monsters. Forced movement (Push, Shove) provokes nothing and
   comes with 640d.

## Consequences

- The encounter pauses more often: every provoking move, every inspired miss, every hit a Shield
  or Uncanny Dodge could answer. The prompt names what happened and the choices; "let it go" is one
  press, and the DM can close any window.
- The window's candidates may now be creatures: the DM answers for them in the Encounter sheet.
- Undo follows ADR 0016 §3 unchanged: answers in reverse order, a window's opening read every
  combatant it considered, the suspended move or attack restored with it.

## Invariants affected

Implements 10 (reactions are domain events). Preserves 1, 8, 9, 11, 12 and 20: every legal
reaction can be chosen, declining is always possible, and the server computes every number.

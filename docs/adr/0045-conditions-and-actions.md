# 0045. Conditions and actions: the SRD 5.2.1 rules of play

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 640,
  decisions 5 and 6, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR 0011
  (each further SRD rule needs an ADR before it is implemented) and ADR 0015 (the slice's four
  conditions); the sections grow with the stage's parts (640a–g).
- Context: the slice knew Incapacitated, Prone, Unconscious and the Slow mastery's Slowed. A family
  at the table meets Poisoned, Frightened, Grappled and the rest in their first fights, and the DM
  needs them to work as the rules say — the server computing every number — not as reminders.

## Decision

1. **The conditions** are the SRD 5.2.1 set: Blinded, Charmed, Deafened, Exhaustion, Frightened,
   Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned
   and Unconscious. Slowed stays the Slow mastery's effect (−10 ft until the slowing creature's
   next turn). Paralyzed, Petrified, Stunned and Unconscious include Incapacitated; Unconscious
   brings Prone with it. Their effects, computed in `@ltw/rules` and applied by the World Engine:

   | Condition     | Effect the server applies                                                                                                                                        |
   | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Blinded       | its attack rolls have Disadvantage; attack rolls against it have Advantage                                                                                       |
   | Charmed       | it cannot attack its charmer or aim a damaging spell at them                                                                                                     |
   | Deafened      | none computed (a check that needs hearing fails: the DM's ruling, shown as a reminder)                                                                           |
   | Exhaustion    | a level 1–6 (§3): every D20 Test −2 per level, Speed −5 ft per level, death at 6                                                                                 |
   | Frightened    | Disadvantage on its ability checks and attack rolls; it cannot move closer to the source                                                                         |
   | Grappled      | Speed 0; Disadvantage on its attacks against anyone but the grappler                                                                                             |
   | Incapacitated | no action, Bonus Action or Reaction; Concentration ends; Disadvantage on Initiative                                                                              |
   | Invisible     | Advantage on Initiative; its attacks have Advantage; attacks against it Disadvantage                                                                             |
   | Paralyzed     | Incapacitated; Speed 0; fails Strength and Dexterity saves; attacks against it have Advantage, and a hit from within 5 ft is a Critical Hit                      |
   | Petrified     | Incapacitated; Speed 0; fails Strength and Dexterity saves; attacks against it have Advantage; Resistance to all damage; it cannot be Poisoned                   |
   | Poisoned      | Disadvantage on its attack rolls and ability checks                                                                                                              |
   | Prone         | (ADR 0015) Disadvantage on its attacks; attacks within 5 ft have Advantage, from farther Disadvantage; standing costs half its Speed                             |
   | Restrained    | Speed 0; its attacks have Disadvantage; attacks against it Advantage; Disadvantage on its Dexterity saves                                                        |
   | Stunned       | Incapacitated; fails Strength and Dexterity saves; attacks against it have Advantage                                                                             |
   | Unconscious   | (ADR 0015) Incapacitated and Prone; Speed 0; fails Strength and Dexterity saves; attacks against it have Advantage, and a hit from within 5 ft is a Critical Hit |

   Advantage and Disadvantage from every source cancel as ADR 0011 says. Sight is not modelled
   yet (Stage 640g brings light and senses): Frightened's Disadvantage holds while its source is in
   the fight, and Blinded or Invisible apply whoever looks.

2. **How long, a save to end, and a source.** In a fight the DM may give a condition a duration —
   until the start or the end of a named combatant's turn, after 1–100 such turns — a saving throw
   that ends it (ability and DC, rolled by the server at the end of each of the affected creature's
   turns and recorded), and a source (the charmer, the one it fears, the grappler). These details
   live on the encounter's combatant record; the sheet or stat block keeps the condition. A
   condition removed by any path drops its details, and when the fight ends a condition with a
   duration or a save ends with it (the DM sets it again if it should last). Outside a fight a
   condition lasts until the DM, a rest or a rule removes it.
3. **Exhaustion** is a level, 1–6, on the sheet or stat block (absent: none), set by the DM with a
   reason. Each level takes 2 from every D20 Test and 5 ft from Speed; level 6 kills (a character
   dies as from three failed death saves, a creature drops dead); a long rest lowers it by one.
4. **Where the effects reach.** Attack rolls (their legality and Advantage), saving throws (spells,
   Concentration, a condition's own save; an automatic failure records no roll), the table's
   checks and saves (a condition's Advantage or Disadvantage joins the asked one, Exhaustion lowers
   the total, an automatic failure is said so and its die kept for the log), Speed and movement,
   actions, Bonus Actions and Reactions, Concentration, Initiative, and damage (Petrified's
   Resistance). The DM's Condition dialog offers every condition, Exhaustion's level and, in a
   fight, the duration, the save and the source; every screen that shows conditions shows them
   with their mark and words, and the character sheet adds a line of what each does, in English
   and Russian. The marks of the new conditions are GPT's, as all the art.
5. **The actions** beside Attack and Magic (640b), one command (`TakeAction`) that spends the
   Action of the creature whose turn it is, its player's or the DM's: **Dash** adds the creature's
   Speed (after its conditions) to this turn's movement; **Disengage** marks the turn so no
   opportunity attack is provoked (640c brings the attacks); **Dodge** gives attacks against the
   creature Disadvantage and its Dexterity saves Advantage until its next turn, while it can move
   and act; **Help** in a fight aims at a foe within 5 ft: the next attack an ally of the helper
   makes against it before the helper's next turn has Advantage, and spends the Help;
   **Hide** is a Dexterity (Stealth) check against DC 15 from a square of Three-Quarters or Total
   Cover (light and sight come with 640g) — on a success the creature is Invisible, marked hidden,
   until it attacks or casts a spell; **Search** (Perception, Insight, Medicine, Survival),
   **Study** (Arcana, History, Investigation, Nature, Religion) and **Influence** (Persuasion,
   Deception, Intimidation, Performance, Animal Handling) roll the chosen skill with the
   creature's conditions and log it at the table for the DM to read; **Utilize** records the use
   of an object for the DM to narrate; **Ready** holds one of the creature's attacks against a
   creature with a trigger in the player's words until its next turn (640c lets the reaction
   fire it). The marks live on the turn record and end when its next turn starts; the context
   lists the creature's own actions on itself and Help, Ready and Influence on another, each
   judged by the same rules. A key in the Russian dictionary never carries two words: a test
   holds that, after "Ready" (the lobby's) nearly became the action's name.

   **Surprise.** As the DM starts a fight they may name a side that is surprised — the party or
   the foes, for a prepared encounter and for one started from the scene: each of its creatures
   rolls Initiative with Disadvantage (SRD 5.2.1), and its initiative record keeps `surprised`
   for the DM's turn order and side panel. A creature that joins a running fight is never
   surprised. Opportunity attacks and spending Heroic Inspiration to reroll a die are decisions
   after a trigger the encounter waits for, so they come with 640c's reaction windows.

## Consequences

- Stored events stay readable: the conditions' list only grows, and the new fields (a combatant's
  condition details, Exhaustion, a check's automatic failure) are optional.
- A build from before Stage 640 cannot read a sheet with a new condition; rolling back across
  640 needs the recovery of `deploy/RUNBOOK.md` §3, as every forward-only change.
- Later parts of Stage 640 add opportunity attacks, reactions and the Heroic Inspiration reroll,
  weapons, hit points, space and movement, and the world around; each adds its section here
  before it is built.

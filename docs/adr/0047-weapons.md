# 0047. Weapons: properties, masteries, unarmed strikes, two weapons, ammunition

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 640,
  decisions 5 and 6, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Extends ADR 0011
  (each further SRD rule needs an ADR before it is implemented), ADR 0045 (Grappled, Prone) and
  ADR 0046 (reach for opportunity attacks). Stage 640d: §1, §2, §4, §5 and §7 in its first part,
  §3 and §6 in its second.
- Context: the slice's weapons hit and miss with the sheet's bonus and the Slow mastery; their
  properties were data the rules did not read. A fighter at the table expects a greatsword to be
  heavy, a rapier to take Dexterity, a glaive to reach, a longbow to spend arrows and a shortsword
  and dagger to attack twice — and the 2024 masteries to work.

## Decision

1. **Properties** (SRD 5.2.1), read by the server from the weapon's data on every attack. The rules
   know the whole SRD weapon table but its firearms (36 weapons; their items with Stage 650):
   - **Finesse**: the higher of Strength and Dexterity, the same for the attack and its damage.
   - **Heavy**: Disadvantage on the attack with a melee Heavy weapon below Strength 13, with a
     ranged one below Dexterity 13.
   - **Light**: an Attack action that attacked with a Light weapon allows one extra attack (§4).
   - **Range** (normal/long): beyond the normal range the attack has Disadvantage; beyond the long
     range it cannot be made. New with this stage: a ranged attack made within 5 ft of a foe that
     sees the attacker and is not Incapacitated has Disadvantage.
   - **Reach**: 10 ft for the attack and for the opportunity attacks made with it.
   - **Thrown**: a melee weapon with Thrown is thrown at a target beyond its reach, with its thrown
     range and its melee ability (Finesse's choice included); the event records it thrown. Thrown
     weapons are not counted: the table has what it throws, or picks it up again — the DM rules
     otherwise.
   - **Two-Handed**: refused while a shield is held (§7).
   - **Versatile**: its larger die in two hands, when nothing else is held — no shield, no weapon
     item in the off hand. The server takes the grip; the event records it.
   - **Ammunition**: a shot spends a piece of its kind, when the kind is counted (§5).
   - **Loading**: the Attack action fires a Loading weapon once, however many attacks it allows;
     a Bonus Action's or a Reaction's attack is one shot anyway.
2. **Masteries** (SRD 5.2.1): a character uses a weapon's mastery for a kind of weapon it has
   mastered — the sheet's `weaponMasteries`, or, until Stage 660's choices, as many of its sheet's
   weapons in order as its classes' Weapon Mastery allows (Barbarian 2–4, Fighter 3–6, Paladin,
   Ranger and Rogue 2). Monsters use none until Stage 650. Each applies on its trigger:
   - **Cleave**: a melee hit lets the attacker make one more melee attack roll with the weapon at a
     second creature within 5 ft of the first and within its reach, once per turn, its damage
     without the ability modifier unless negative. It is offered at once after the hit, on the
     attacker's own turn, as its own option; it lapses when the attacker attacks or moves again.
   - **Graze**: a miss that stays one deals the attack's ability modifier (when above 0) as damage
     of the weapon's type.
   - **Nick**: the other hand's attack (§4) is part of the Attack action, not a Bonus Action.
   - **Push**: a hit pushes the target up to 10 ft straight away; the attacker chooses 10, 5 or no
     feet. A pushed creature provokes no opportunity attack (ADR 0046 §7) and stops at the
     battlefield's edge, total cover or another creature. Sizes come with 640f; until then any
     target is pushed.
   - **Sap**: a hit gives the target Disadvantage on its next attack roll before the start of the
     attacker's next turn.
   - **Slow**: as the slice, for a hit that deals damage: the target's Speed −10 ft until the start
     of the attacker's next turn, never more than 10 ft in all.
   - **Topple**: a hit may force a Constitution save (DC 8 + the attack's ability modifier + the
     Proficiency Bonus) or the target falls Prone; the attacker chooses to try.
   - **Vex**: a hit that deals damage gives the attacker Advantage on its next attack roll against
     that target before the end of its next turn.
     Push's and Topple's choices are asked before the roll ("on a hit: push 10 ft, 5 ft, or not"),
     so the encounter never pauses for them.
3. **Unarmed Strike** (SRD 5.2.1), for every character, with one of three effects chosen with it
   (the turn tray asks, beside the object at hand of §6):
   - **Damage**: an attack roll with Strength + Proficiency Bonus; 1 + Strength modifier
     Bludgeoning (a monk's Martial Arts die waits for Stage 660).
   - **Grapple**: no attack roll; the target makes a Strength or Dexterity save (the better, as a
     creature would choose) against DC 8 + Strength modifier + Proficiency Bonus, or it is
     Grappled, its grappler named. Sizes come with 640f; until then any target may be held. The
     grappled creature escapes with its action: Athletics or Acrobatics (its player's choice)
     against the grappler's DC (a monster grappler's 8 + Strength + 2 until Stage 650's stat blocks).
     Its grappler lets go at will, with no action. A grapple ends when its grappler is gone from
     the fight, dead or Incapacitated, or more than 5 ft away: read as each turn starts and after a
     shove. The grappler drags what it holds: each foot of its move costs another, and the first
     creature it holds follows into the square it left last.
   - **Shove**: the same save and DC, or the target is pushed 5 ft straight away (stopping as Push
     does) or knocked Prone, the attacker's choice made with the shove.
     Each is one attack of the Attack action (Extra Attack counts them); a grapple or a shove rolls no
     attack, so Help and Vex wait for an attack roll. A hand is freed as part of the attack, as the
     rules let a weapon be stowed with one.
4. **Two weapons**: after the Attack action attacked with a Light weapon, an attack with another
   Light weapon — another kind, or a second of the same kind in the other hand — as a Bonus
   Action, once per turn (Nick: within the Attack action); its damage adds no ability modifier
   unless negative. Not while a shield is held. The turn tray offers it while it is on offer.
5. **Ammunition**: carried as stacks of ammunition items (arrows, bolts, sling stones, needles).
   A character that carries no stack of a kind is not counted for it — the quiver stays the DM's,
   as before. A shot spends a piece from the first stack that holds any; with every stack empty the
   weapon cannot fire. The fight remembers what each spent; when the DM ends it, half (rounded
   down) comes back to the stack it came from: the minute's search after a fight, done for the
   table. The character sheet shows what is left beside each weapon.
6. **Improvised weapons**: an object wielded as a weapon (the DM's word, or a weapon used against
   its design: a ranged weapon in melee, a melee weapon without Thrown thrown) has no Proficiency
   Bonus, deals 1d4 (Bludgeoning unless the DM says otherwise), and thrown has range 20/60.
7. **Hands**: each hand holds what the inventory puts in it — a weapon item, a shield in the off
   hand, or nothing; a weapon the sheet lists without an item is at hand, drawn with its attack. A
   shield in the off hand rules out Two-Handed weapons, the Versatile grip in two hands and the
   other hand's attack.

## Consequences

- An attack carries its choices: for Push and Topple the turn tray asks before the roll; the extra
  attacks (the other hand's, Cleave's) are their own options while on offer. The grip is the
  server's. The player sees each option's mastery and whether the roll will have Advantage or
  Disadvantage before choosing.
- Monsters keep their stat blocks' attacks (their reach and range are data already); their
  masteries and Multiattack mixes come with Stage 650.
- Old events stay readable: every new field is optional; an attack without a grip was one-handed.

## Invariants affected

Preserves 1, 8 and 9: the server computes every number and every condition from the weapon's
data, the sheet and the inventory; the client only asks the choices.

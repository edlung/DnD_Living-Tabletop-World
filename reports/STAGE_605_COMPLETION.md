# Stage 605 completion — a party for the table

Work order `work-orders/STAGE_605.md`; program `docs/FULL_GAME_PLAN.md` (Milestone A), owner approval
`reviews/OWNER_FULL_GAME_2026-11-02.json`; ADR 0011 and ADR 0015 amendments of 2026-11-02; 2026-11-02.

## What changed

- **Three classes in the rules.** The Fighter, the Rogue and the Cleric are sheet classes with what
  the rules already do: Hit Point Dice (d10, d8, d8), the Cleric a full caster for spell slots and a
  spellcasting source, Extra Attack by class level (`attacksFor`: a Ranger's at 5; a Fighter's at
  5, 11 and 20). Levelling up uses it. Their other features and the spell lists are Stages 640–660.
- **Elowen's companions** (`fixtures/ravenford{,-ru}/table-seed.json`, seeded last so earlier
  history keeps its command IDs): Brann Ironvale (Fighter 15, Champion), Tamsin Quickfoot (Rogue 15,
  Thief) and Maren Ashby (Cleric 15, Life Domain, Healing Word and Detect Magic), each a free seat
  the DM invites a player to, known to the party by its records of the company, their armor and
  shields worn through `EquipItem` so their Armor Class follows what they wear (18, 17, 17).
- **The road ambush for four.** Seven more foes in the DM's data (three goblin raiders, a second
  shaman, two grey worgs, a goblin warlord — «Гоблин-вожак»), opaque IDs as Gate 06 requires.
- **Prepared encounters** (contract `combat/prepared.ts`, server `combat/prepared-encounters.ts`,
  `encounters.json` per language): the DM's Encounter sheet lists the adventure's ready fights; one
  press places the foes and starts the fight with the party's characters at the place, through the
  World Engine as the DM, idempotent per request; refused while a fight runs, with no foe left, or
  with nobody of the party there. The open-ground start goes on in a second column (12 a side).
- **Quest books by language.** A campaign seeded from Ravenford reads the quest book of its own
  language (found here: a campaign started from the English template on the Russian deployment
  showed Russian quests).
- **Topics.** A player character is a conversation topic with an NPC only when a question about it
  is open or evidence about it was shown: the companions crowded the five topics with Mira.
- **Two Russian strings that showed in English on a play screen** ("Prepared encounters", the
  Journal's "Quests"): they lived only in the workshop's dictionaries, which play screens never
  load. A new test holds every string outside the workshop in the dictionaries `main.tsx` loads.
- **Turn order of a big fight.** The anchor's grid column no longer grows with fifteen portraits
  (they slid under the view switch and the board's legend); the order scrolls inside the band, and
  an edge fades where more of it hides; a long name breaks instead of being cut.

## Verification

- Unit 3536 passed (new: the three classes and `attacksFor`; prepared encounters over HTTP — the
  ADR 0009 order, the start with four and eleven, a retried request, the refusals; the Russian quest
  book of a template campaign; the open-ground columns; the play dictionaries). Spec updates for the
  bigger party: the knowledge boundary (EN, RU: three PARTY records), the DM's perspective choices,
  presence, the review campaign's open seats, the party's known entities.
- Browser: `party.spec.ts` 2 journeys (the DM starts the ambush in one step, the player's screen
  follows with fifteen in the order; Russian), axe on the Encounter sheet. Full suite: 215 of 222 on
  the first run; the seven that failed assumed Elowen was the party's only character (defaults that
  picked the first character, the rail's first portrait, the keyboard invitation) or met this
  stage's own reset rule, and one found a real layout fault: beside a conversation six figures
  climbed over the ways beyond the place (a crowded talking scene now shrinks another step). The
  DM's performed NPC now speaks first with someone who is there. All seven specs pass after the
  fixes (36 tests).
- Layout audit at 1440, 768, 390 and 320 px of the Encounter sheet with the prepared ambush and of
  the fifteen-strong battle (Russian): no findings after the fixes above.
- Lint, typecheck, Prettier and the context budget clean.

## Adversarial notes

- The start route checks the DM before anything else after input (401, 400, 404, 403), and what
  would refuse before placing a foe; a retry of a started request answers "started" without a second
  fight; a player or an outsider can neither list nor start.
- A campaign the workshop prepared gets no Ravenford encounters, and an encounter whose place or
  foes a campaign lacks is not listed.
- Not modelled yet: moving the whole party at once (each player travels; the DM acts for an absent
  one), the companions' class features beyond the list above.

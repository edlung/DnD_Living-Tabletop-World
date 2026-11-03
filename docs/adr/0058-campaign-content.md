# 0058. Campaign content: the DM's editors, handouts and tables, the starter adventure

- Status: Accepted (owner-delegated product decision 2026-11-03; `docs/FULL_GAME_PLAN.md` Stage 680,
  owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Builds on ADR 0018 (authoring), 0039
  (items), 0043 (the DM's screen), 0044 (the table: handouts §5, rolls), 0053 (monsters as data),
  0054 (items as data), 0056 (characters from the SRD) and 0057 (encounters, maps and loot).
- Context: at play the DM adds content only through AI proposals (an NPC at a time) or the
  bestiary in a running fight; places, creatures outside a fight, story objects, clues, knowledge
  and quests have commands but no hand; a handout is written and sent at once; there are no random
  tables. The only campaign a DM can start without the workshop is the level-15 Ravenford slice.
  The workshop's guide offers Ravenford's own items and nine spells, and no monster by name, though
  the World Engine checks accept the whole SRD.

## Decision

1. **The DM's editors.** At play the DM makes and changes content by hand, each a World Engine
   command that the DM's history lists and undoes: a place (its name, words, kind and the place it
   lies in); a person (an NPC, where it is, moved, gone); a creature from the bestiary, named and
   placed outside a fight, its Armor Class, Hit Points and Speed set by hand; a story object (a
   unique item, given to someone or left at a place); a clue at a place (what it says, how it is
   found); knowledge (what a character, the party, an NPC or everyone knows); and any thing renamed
   or described again. Nothing here passes through the AI; the NPC card's written proposal stays.
2. **Quests by hand.** A DM's quest is a world fact: a title, what it is about, its steps in order,
   each done or not, and whether the party knows it. A known quest shows in the party's journal with
   its steps beside the quests the campaign's quest book follows; an unknown one is the DM's alone.
3. **The handout library.** Handouts written ahead are the DM's preparation, kept beside the world
   as the DM's notes are and never seen until given; giving one is giving a handout as today (ADR
   0044 §5) — a copy, to the party or one player — and it stays in the library, changed, given again
   or deleted at the DM's word, with when it was last given.
4. **Random tables.** The DM writes tables — a name, a die from d4 to d100, its results by ranges —
   kept beside the world. A roll on one is a table roll the server makes, for the DM alone or for the
   table, its result named beside it; what the result brings in, the DM brings by hand.
5. **The starter adventure.** A second campaign template beside the Ravenford slice: a new
   adventure for levels 1–5 in the Ravenford setting with its own places, people, creatures,
   quests, clues, knowledge, items, encounters, handouts and random tables, its pictures made by
   GPT, in English and Russian. A campaign made from it starts with ready-made level-1 characters
   in free seats and lets a player build their own; it advances by milestones. Its quests and
   prepared encounters are its own: a template's campaign reads its template's, not Ravenford's.
   The level-15 slice stays a one-shot.
6. **The workshop with the full SRD.** The workshop's generation may name any SRD monster (a
   creature by its bestiary id, its stat block then the SRD's), magic item, piece of equipment and
   spell; its guide lists them by id and name, and every check is the World Engine's as before.

## Notes from the implementation (Stage 680a, 2026-11-03)

- "Make by hand" in the Add sheet makes, with no AI: a place (`CreateEntity` of a location, its kind
  and the place it lies in), a person (an NPC where it is), a creature from the bestiary named and
  placed anywhere outside a fight (the bestiary route takes a place), a story object given to
  someone or left at a place (`POST …/story-objects`: `CreateEntity`, then `GrantItem` with no
  catalog entry, IDs from the request), a clue (`AddClue`; a skill check's clue lies on an item or a
  feature, a look's or Detect Magic's on anything — `clueFits` in contracts, the domain's rule too),
  what someone knows (`AddKnowledge`, a FACT for the party, everyone, a character or an NPC), and a
  quest by hand.
- "Change by hand" on a thing's card (the DM's, every kind but a character): its name and words
  (`UpdateEntityProfile`; a person's still go through the NPC card's written proposal), where it is
  (`PlaceEntity`), whether it is in the world (`ChangeEntityStatus`), and a creature's or an NPC's
  Armor Class, Hit Point maximum and Speed (`SetStatBlock` on the block read from
  `GET …/entities/:id/stat-block`, the DM's alone).
- The DM's history lists these and the DM's other table changes that had no entry — a shop, the
  map's pins and routes, downtime, quests — as `edit` entries worded from the command, undone as any
  change. The bestiary route's commands are the DM's own now, so a creature made there is listed (and
  its stat block beside it).
- Quests by hand: `SetQuest` writes, rewrites or takes one away whole (title, what it is about, up
  to twelve steps, whether the party knows it), `SetQuestStep` ticks a step; the quest log returns
  them beside the quest book's (`handQuests`), every one to the DM, the known ones to the party.

## Notes from the implementation (Stage 680b, 2026-11-03)

- The library is one store beside the world (migration `0036_dm_library.sql`, the server's
  `library/`): an entry is a kept handout or a random table, its body read back through its
  contracts schema (`keptHandoutSchema`, `randomTableSchema`), at most 100 handouts and 50 tables a
  campaign; the DM's routes are `…/dm/library` (read), `…/dm/library/handouts/:id` and
  `…/dm/library/tables/:id` (write, `/delete`), nobody else's.
- `…/handouts/:id/give` gives a copy through the handout routes' own check (`handoutRefused`: a
  character's player or the party, a picture its reader knows) into the handouts' store, and notes
  when it was given; the Party sheet keeps a handout from the same form that gives one ("Keep for
  later") and lists the kept ones under it, each given, changed or deleted there.
- A random table covers its die once, in order, from 1 (`rangeGap`): the Dice sheet writes it as
  lines, a range first ("1–2 Wolves"), lines with no numbers sharing the die evenly.
  `…/tables/:id/roll` rolls its die with the table's dice (`DiceSource`) into the table's rolls as
  `{ kind: 'table', name, result }` — the one roll subject with free text, the DM's own words —
  hidden for the DM alone or shown to the table, worded in the log, the plate and the chat.

## Consequences

- Stage 680 runs in parts (`work-orders/STAGE_680.md`): the editors; the library and the tables;
  the workshop's SRD; the starter adventure.
- The DM's history gains the editors' commands as a kind of its own, worded from the command.
- The library and the tables are stores beside the world (migrations), the DM's alone; a roll and a
  given handout are the table's as before.

## Invariants affected

Preserves 1, 8 and 9: every change to the world is the World Engine's, every die its own; a player
sees a quest, a handout or a table's roll only when the DM shows it.

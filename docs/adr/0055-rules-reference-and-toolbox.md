# 0055. The rules reference, the Gameplay Toolbox, the Russian rules text and the catalogs' art

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` Stage 650,
  decisions 5, 6 and 7, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Completes ADR
  0051 (the SRD data: §5, Russian) for the SRD 5.2.1's Rules Glossary (pages 176–191), its Gameplay
  Toolbox (pages 192–203) and the magic items' rules (pages 204–208); ADR 0050 §8–9 (hazards and
  poison) and ADR 0045 §2 (conditions' details) apply.
- Context: the app applies the rules but never shows them. A player asks what Prone does, what the
  Help action gives, what a Frightened creature may do; the DM looks up a trap's save, a contagion's
  course, a sample fear DC. The SRD's text is English; a Russian table reads English until the
  translation pass the plan names (decision 7) exists. The new catalogs (spells, monsters, items)
  have no pictures.

## Decision

1. **The glossary as data.** `scripts/srd/glossary.ts` reads the Rules Definitions: each entry's
   name, its tag (Action, Area of Effect, Attitude, Condition, Hazard), its paragraphs and lists
   and the entries its "See also" names, and the abbreviations. The Gameplay Toolbox and the magic
   items' rules are read as sections of reference text (headings, paragraphs, tables as rows).
   Both are `packages/rules/src/srd/{glossary,toolbox}.json`, served by the server; the browser
   loads them when the reference opens, never in its first bundle.
2. **The rules reference in the app.** A Rules sheet for everyone at the table: the glossary's
   entries found by name or by tag, an entry's words with links to the entries it names, the
   abbreviations; the toolbox's sections for the DM. Read-only: nothing in it changes the world.
3. **Terms where they are used.** A condition's chip, an action in the tray and a spell's name open
   their entry's words in place (a popover opened by a tap or a click, never by hover alone; Escape
   closes it and focus returns to the term).
4. **The toolbox's mechanics** (the DM's hand, the World Engine's numbers):
   - **Traps**: the eight example traps as data (trigger, save, damage, condition, tiers by level,
     detect and disarm DCs). The DM springs one on the creatures it catches; the server rolls each
     save and the damage and applies the condition. Detecting and disarming are checks the DM calls.
   - **Magical contagions** (Cackle Fever, Sewer Plague, Sight Rot): the DM infects a creature (a
     save where the text names one); the contagion is recorded on it with its course — its
     Exhaustion, its condition, its save to fight it at the end of a Long Rest or at the dawn, the
     successes it needs — and ends by that course or by the DM (a spell such as Lesser Restoration).
   - **Fear and mental stress**: Frightened with a Wisdom save at the DC the DM picks (the sample
     DCs at hand), repeated at the end of each of its turns; mental stress as Psychic damage with a
     save, none or half on a success as the DM chooses.
   - **The environment**: frigid water and deep water join cold and heat as hazards by the minute or
     the hour; slippery ice is Difficult Terrain with a Dexterity save against Prone; heavy
     precipitation and strong wind are the place's weather: Lightly Obscured and Disadvantage on
     Perception, Disadvantage on ranged weapon attacks.
   - **Poisons**: the fourteen sample poisons enter the item catalog with their price; using one
     applies its effect through ADR 0050 §9.
     What the toolbox leaves to the DM (narrative and environmental curses, prolonged mental effects,
     a rolling stone's course) stays text in the reference.
5. **Russian.** A glossary of the Russian 5e terms (`packages/rules/src/srd/ru/terms.json`, the
   client dictionary's words included) fixes each term's Russian. `scripts/srd/translate.ts` runs the
   Codex CLI on the owner's ChatGPT subscription over every entry whose English has no current
   Russian (a hash of the English), asks for JSON in the entry's own shape, and keeps a Russian only
   when it holds its English's numbers, dice and DCs and the glossary's terms; the rest is asked
   again. The Russian is `packages/rules/src/srd/ru/*.json` beside the English; the server sends it
   to a Russian campaign and the catalog's Russian names come from it. A test holds every entry
   translated and current. Until an entry has its Russian, the English shows, marked as English.
6. **The catalogs' art.** GPT pictures by kind — the fourteen creature types, the eight schools of
   magic, the item kinds — made as the earlier sets were (originals outside the repository, a
   manifest with each original's SHA-256 in it). An entry shows its kind's picture until it has its
   own.

### Notes from the implementation (Stage 650e part 1, 2026-11-03)

- The glossary reads as 155 entries and 33 abbreviations; the Toolbox and the magic items' rules as
  116 sections, among them the eight traps, the three contagions and the fourteen sample poisons
  (the line under an entry's name is its subtitle); the 27 tables read into their columns, each
  table's columns and row shape written in `scripts/srd/reference-tables.ts`. A run-in head stands
  apart from its words; a label keeps its colon ("Trigger:").
- The Rules sheet is in the dock for everyone, the first tool to wait under More. A term opens its
  entry in a native popover (`popover="auto"`): Escape and a click elsewhere close it, focus stays
  on the term; the table's TV has no terms. A condition's chip on the character card and the title
  of an action that asks a choice (Search, Study, Influence, Ready) are terms; the spells tab
  already shows each spell's words. The toolbox (index and sections) reaches the DM only.

### Notes from the implementation (Stage 650e part 2, 2026-11-03)

- The DM's Party sheet holds the Toolbox at the table: a trap (the eight, at the tier of the
  characters' levels; the rolling stone has one) sprung on the characters it catches, mental
  stress (the three sample effects or the DM's own save, DC and d6s, none or half on a success),
  and a contagion given to one character. A trap's numbers are data the tests hold to its words
  (`packages/rules/src/toolbox/traps.ts`); a pit is a fall (the glossary's Falling: damage and
  Prone). Each creature saves and takes its damage through the damage rules.
- A contagion's course is on the character's sheet (`contagions`) and followed on the DM's party
  card: it takes hold (a level of Exhaustion), the character fights it (Cackle Fever after a Long
  Rest, three saves won ending it and its level; Sewer Plague at dawn, a level more or less, none
  ending it), or it ends (Sight Rot only so, its Blinded lifted). Its carrier sees it once it has
  taken hold; the DM from the infection. The DM says when; the World Engine rolls.
- Fear stays the condition form's (Frightened with a Wisdom save first, the sample DCs in the
  reference); the sample poisons and the environment's frigid water, deep water, slippery ice,
  strong wind and heavy precipitation stay text in the reference — the DM applies them with the
  hand tools (a condition with a save, Exhaustion, damage). The toolbox's changes enter the DM's
  history as changes by hand, undone like any other.

## Consequences

- Stage 650e runs in parts: the rules reference and the terms in place; the toolbox's mechanics;
  the Russian rules text; the catalogs' art.
- The Rules sheet joins the dock's More menu for every role; the DM's Time sheet gains the toolbox's
  hazards; the DM's tools gain traps, contagions, fear and mental stress.
- The translation is data in the repository: it is reviewed as any other words, and a changed
  English entry fails the completeness test until its Russian is made again.

## Invariants affected

Preserves 1, 8 and 9: the reference is read-only data; every save, roll and condition the toolbox
applies is the server's, recorded as the DM's commands.

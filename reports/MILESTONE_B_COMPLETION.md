# Milestone B completion — the rules (Stages 640, 650, 660)

Program `docs/FULL_GAME_PLAN.md` (Milestone B, decisions 5, 6, 14–18), owner approval
`reviews/OWNER_FULL_GAME_2026-11-02.json`; work orders `work-orders/STAGE_640.md`,
`STAGE_650.md`, `STAGE_660.md`; ADRs 0045–0056 (each written before its rules); 2026-11-03.
Branch `claude/full-game-b`, main (Stage 700, the native apps) merged in.

## What changed

### Stage 640 — the rules of play (ADRs 0045–0050)

- **Conditions and actions (640a–b).** The 15 conditions and Exhaustion's six levels in the rules
  and at the table, with durations and saves to end that the server rolls; Dash, Disengage, Dodge,
  Help, Hide, Influence, Ready, Search, Study, Utilize; surprise.
- **Reactions (640c).** Opportunity attacks and the readied attack; an attack's windows: Shield,
  Uncanny Dodge, Hellish Rebuke, and Heroic Inspiration on a missed attack or a table check
  (migration 0033, additive).
- **Weapons (640d).** Properties, the eight masteries, the other hand, ammunition spent and
  recovered; Unarmed Strike's damage, grapple and shove, escape, dragging, the object at hand.
- **Hit points (640e).** Temporary hit points, a lowered maximum, resistance, vulnerability and
  immunity for characters as for monsters, knocking out and first aid, objects to break.
- **Space and movement (640f).** Size and space, walls and squeezing; speeds, water, heights,
  flying, climbing, swimming, crawling, jumping, burrowing and falling; Feather Fall; underwater
  combat; mounted combat.
- **The world around (640g).** Light and sight (darkvision, blindsight, obscurement), rests by the
  full rules, hazards, poison and armor's Strength and Stealth.

### Stage 650 — the SRD as data (ADRs 0051–0055)

- **The import (650a).** SRD 5.2.1 read from its text (the PDF stays outside the repository): 339
  spells, 330 stat blocks, equipment, magic items, the glossary and rules sections, with the CC-BY
  attribution on the About page.
- **Spells as data (650b).** Any SRD spell cast through the World Engine from its mechanics
  (attacks, saves, areas, healing, darts, upcasting, rituals, concentration); the tray's spells
  with their slot; what a spell's words leave over is the DM's.
- **Monsters as data (650c).** The SRD's stat blocks as the engine's, the DM's bestiary, breaths
  with Recharge and uses per day, Pack Tactics, Magic Resistance, legendary attacks, the fight's
  difficulty.
- **Items as data (650d).** The SRD's equipment and magic items in a campaign's catalog, items made
  on a base, attunement, the protection items, charges at dawn, identifying and curses.
- **The rules reference and the Toolbox (650e).** The glossary and rules in the app, terms in
  place; traps, mental stress and contagions at the table; the SRD in Russian (held complete by a
  test) and the catalogs' pictures by kind.

### Stage 660 — characters from the SRD (ADR 0056)

- **The data (660a).** The twelve classes, four backgrounds, nine species and seventeen feats, in
  English and in Russian.
- **Creation (660b).** The builder for a player or the DM: species, class, background, abilities
  by standard array, point buy or the World Engine's rolls, skills, equipment or gold, spells; the
  World Engine validates the sheet.
- **Advancement (660c).** Experience divided among those present, or milestone levels; a level's
  hit points, features and choices; multiclassing with its prerequisites.
- **Features in play (660d).** Resources counted and restored at rests, `UseFeature` (Rage, Second
  Wind, Action Surge, Lay on Hands, Bardic Inspiration, Focus, Font of Magic, Arcane Recovery…), the
  features that change numbers, Eldritch Invocations and Metamagic.
- **The table's life (660e).** The campaign's options (a level's hit points, levels by experience
  or milestone, carrying shown or enforced, the starting level); death's time and the four spells
  that return the dead with the ordeal; languages and the printable sheet; a character brought from
  another campaign as a sheet; a player's wish for a portrait the DM makes; the four summons a
  slot scales (Find Steed, Giant Insect, Summon Dragon, Animate Objects) with the commander's pick
  of its creature's attack; Wild Shape's Beast forms in play.

## Verification (merged branch)

- Unit 4058 passed (486 files); integration 370 (71); build, lint, typecheck, format and the
  context budget clean — on the merged branch.
- The browser suite on every part's commit, Chromium and iPad WebKit: 284 → 295 journeys green,
  each new screen audited at 1440, 768, 390 and 320 px, light and dark, in English and in Russian
  (0 findings). Two defects found by the suite were fixed before the commit: the commander's card
  that grew over the board, and a Wild Shape form the sheet's view dropped.
- After merging main: see the PR's checks and the record below.

## What stays the DM's

Spelled out in each ADR's notes: among them Legendary Resistance and non-attack legendary actions,
fear, weather and the like; a summoned steed's bonus actions and Life Bond, a spider's web, the
spirit's Shared Resistances, the Bonus Action that commands animated objects; Wild Shape's known
forms and the one changed at a Long Rest; time in a fight (rounds do not move the world's clock,
so a minute after a fight counts world time).

## Known

- Flakes seen under load and passing on rerun: `session-lifecycle`, `dice.spec`, the accessibility
  pass of the dock's More, the table display's TV, `perspective-choices`, `scene-result-layout`.
- Vite's development server logs "ResizeObserver loop completed with undelivered notifications"
  during the suite (benign, pre-existing).
- Deploy: additive migration 0033; no reset needed by Milestone B itself (Milestone A's reset rule
  still applies to a server that never took A).

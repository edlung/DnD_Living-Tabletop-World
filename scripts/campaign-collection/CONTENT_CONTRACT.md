# Authoring contract

Each agent writes ONLY `campaigns/collection-2026/<slug>/`: `README.md`, `AGENTS.md`, and JSON
under `source/`. Do not edit shared files or generated package/HTML. All prose is original Russian.
Eight fully playable sessions (3 developed scenes each), eight heroes, at least eight NPCs,
nine locations including region, twelve clues, six handouts and three optional encounters.
Keep each authored JSON file below 500 lines. Write conventional multiline JSON, no giant strings
to evade limits. Split sessions as `sessions-1.json` … `sessions-4.json` (two per file).
No agent spawning, no external services, images, dependencies or live activation. Verify JSON
parsing and reference integrity in your own directory; record editorial checks in README.

Use EXACT keys below, required unless expressly optional. Reference keys: lowercase kebab-case,
max 48 chars, unique across all entities (locations, heroes, NPCs, clue features, encounter foes).
Clue feature IDs generated as `e-<clue.key>`; foe IDs as `<encounter.key>-foe-1` etc.

## world.json

Object: `slug`, `title`, `genre`, `audience` (e.g. `14+` or `21+`), `minPlayers` (5 or 6),
`maxPlayers` (8), `defaultPlayers` (6), `sessionCount` (8), `sessionDuration` (string),
`pitch` (player-safe), `setting` (player-safe; explain science-fiction as a fantasy rules reskin),
`tone`, `worldName`, `startLocation`, `opening` (player-safe read-aloud),
`truth` (array of 4–8 DM-only strings), `themes` (array), `boundaries` (array),
`tableGuidance` (array of concrete procedures for large groups, spotlight, split parties, absence),
`scaling` (array `{players:number,guidance:string}` for EVERY supported size),
`endings` (at least 3 objects `{title,requires,outcome,cost}` with conditional, non-predetermined results),
`locations` (array `{key,name,type,parent,description}`; one region with null parent, others
parent region; supported types `region`, `settlement`, `site`, `building`; descriptions player-safe).
Keep statements below 1800 chars. Adult campaigns: all named human characters 21+; mature
conflicts rather than explicit sexual material or gratuitous gore. Give concise theme boundaries.

## cast.json

Object with `heroes` (8) and `npcs` (8 or more).
Hero `{key,name,age:number,role,archetype,look,hook,bond,personalQuestion,spotlight}`;
archetype one of `fighter`, `rogue`, `cleric`, `wizard`; each appears twice. All hero fields are
player-safe; no DM-only truth. First minPlayers heroes form the default smaller-party core;
remaining heroes are optional seats. Avoid any plot requiring an optional hero. Everyone starts
at world.startLocation. Mechanics fixed level 3 supported canonical classes, fiction is a skin.
NPC `{key,name,age:number,location,look,public,want,secret,knows:string[],boundary,reveal,voice?}`;
an optional `voice` (how the NPC talks: public, no secret or plot fact) becomes the package NPC's
one-line `manner`, which NPC dialogue gives the model (ADR 0020 amendment 2026-11-14).
`knows` is ONLY what that NPC knows, not omniscient plot synopsis; `secret` may be their belief,
clearly marked as such. Public appearance must not reveal secret allegiances or solutions.

## clues.json

Array `{key,name,location,appearance,statement,subjects:string[],discovery,fallback}` (12+).
Subjects refer to declared location/NPC/core hero keys. Appearance is public physical description,
statement revealed only on inspect. At least three independent clue routes for the main revelation;
no essential clue behind a mandatory successful roll. Discovery/fallback must say actual actions.

## handouts.json

Array `{key,title,unlock,text}` (6+). Text is exact player-facing content, not instructions for
the DM; unlock is DM-only release condition. Never distribute all unlocked handouts at start.

## sessions-N.json

Arrays of TWO sessions each. Session `{number,key,title,location,participants:string[],clues:string[],
goal,readAloud,scenes,spotlight:string[],consequences,handouts:string[],ending,dmNote}`.
`participants` use NPC keys only (avoid optional hero dependencies).
`scenes` = 3+ objects `{title,minutes:number,readAloud,play,choices:string[],check,failForward}`;
`readAloud` is 60–120 Russian words the DM reads as the scene begins (docs/CAMPAIGN_TEXT_STANDARD.md §5),
shown in the session page and the DM book, never in a package. `source/pocket.json` is the DM's pocket
(rumours, minor places, passers-by; §7), shown in the DM book only.
Scene play: ~100–180 Russian words of runnable action/dialogue/obstacles, distinct choices,
concrete consequences, clue access and callbacks. `check` states supported ability/skill and DC
where appropriate, success/failure and a no-roll alternative; narrative rulings are DM-adjudicated,
not newly implemented automated mechanics. `failForward` is concrete, not generic retry.
Session consequences array `{if,then}` (at least 2), handout refs existing keys. Eight-session arc
must include alternative paths, earned climax and personal epilogue prompts, no scripted wins.
Give meaningful roles for all seats, group parallel action resolution and return points.

## encounters.json

Array of 3 objects `{key,title,location,trigger,objective,foeName,foeDescription,foeCount:number,
tactics,peaceful,scaling,terrain}`. `foeCount` 3 or 4, base foes use same conservative level-3
statblock, additional foes for 7/8 players as documented by shared tooling. `scaling` concrete
guidance by group size, `terrain` description for a 14×12 grid with central difficult area and cover.
Foes start at encounter location, encounters never start automatically. Objective and retreat,
surrender/negotiation path; no real-world operational violence advice. Do not invent unsupported
combat rules, automatic timers, hacking or spaceship combat. Non-fantasy genres use clear reskin.
Printed map coordinates: A–N / 1–12. Only G5:H6 is difficult; I4 and I9 have half cover.
Party slots B3:C6 and foe slots L3:M6 are occupied in order. Describe these exact cells.
Native variants already contain base foes for 5/6 players, +1 for 7, +2 for 8. Each foe has
15/17/19/21 HP for 5/6/7/8 players respectively. State these counts accurately; do not add them
again or claim that HP is unchanged across sizes. Other decorations have no automatic effects.

## README.md

Short premise/format, maturity/themes, list of eight sessions, large-table procedure, authored
limitations (no live playtest), files and import instructions (generated `package.json` defaults
to 6 players; `variants/5-players.json` etc). Model provenance: requested GPT-6 Astra / max,
not an application/provider generation job. No claims of generated illustrations. Agent reports
own count/reference/editorial verification and any unresolved issues to parent.

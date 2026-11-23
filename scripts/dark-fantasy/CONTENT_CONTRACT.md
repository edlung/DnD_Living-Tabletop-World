# Authoring contract

Each agent writes ONLY `campaigns/dark-fantasy-2026/<slug>/`: `README.md`, `AGENTS.md`, and JSON
under `source/`. Do not edit shared files or generated package/HTML. All prose is original Russian.
Eight fully playable sessions (3 developed scenes each), seven heroes, at least eight NPCs,
nine locations including region, twelve clues, six handouts and three optional encounters.
Keep each authored JSON file below 500 lines. Write conventional multiline JSON, no giant strings
to evade limits. Split sessions as `sessions-1.json` … `sessions-4.json` (two per file).
No agent spawning, no external services, images, dependencies or live activation. Verify JSON
parsing and reference integrity in your own directory; record editorial checks in README.

Use EXACT keys below, required unless expressly optional. Reference keys: lowercase kebab-case,
max 48 chars, unique across all entities (locations, heroes, NPCs, clue features, encounter foes).
Clue feature IDs generated as `e-<clue.key>`; foe IDs as `<encounter.key>-foe-1` etc.

## world.json

Object: `slug`, `title`, `genre`, `audience` (e.g. `14+` or `18+`), `minPlayers` (3),
`maxPlayers` (7), `defaultPlayers` (4), `sessionCount` (8), `sessionDuration` (string),
`pitch` (player-safe), `setting` (player-safe; explain science-fiction as a fantasy rules reskin),
`tone`, `worldName`, `startLocation`, `opening` (player-safe read-aloud),
optional `startsAt` (seconds from midnight, 0–86399; default 64800 = 18:00),
`truth` (array of 4–8 DM-only strings), `themes` (array), `boundaries` (array),
`tableGuidance` (array of concrete procedures for groups of 3–7, spotlight, split parties, absence),
`scaling` (array `{players:number,guidance:string}` for EVERY supported size),
`endings` (at least 3 objects `{title,requires,outcome,cost}` with conditional, non-predetermined results),
`locations` (array `{key,name,type,parent,description}`; one region with null parent, others
parent region; supported types `region`, `settlement`, `site`, `building`; descriptions player-safe).
Keep statements below 1800 chars. Adult campaigns (18+): all named human characters 18+; mature
conflicts rather than explicit sexual material or gratuitous gore. Give concise theme boundaries.

## cast.json

Object with `heroes` (7) and `npcs` (8 or more).
Hero `{key,name,age:number,role,archetype,look,hook,bond,personalQuestion,spotlight}`;
archetype one of `fighter`, `rogue`, `cleric`, `wizard`; each appears at least once. All hero fields are
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
tactics,peaceful,scaling,terrain}`. `foeCount` always 3 (base at 4/5 players). Native counts at 3/4/5/6/7 players are 2/3/3/4/5;
HP is 12/14/16/18/20 respectively, AC 12, one +3 melee attack for 1d4+1. `scaling` concrete
guidance by group size, `terrain` description for a 14×12 grid with central difficult area and cover.
Foes start at encounter location, encounters never start automatically. Objective and retreat,
surrender/negotiation path; no real-world operational violence advice. Do not invent unsupported
combat rules, automatic timers, hacking or spaceship combat. Non-fantasy genres use clear reskin.

Terrain must match the actual adapter: columns A–N left-to-right, rows 1–12 top-to-bottom.
Difficult cells are exactly G5, H5, G6, H6; half-cover cells exactly I4 and I9.
Use those coordinates or omit coordinates; never describe additional mechanically difficult/cover
cells. Rivers, doors and exits beyond this geometry are narrative terrain adjudicated by DM,
not extra automatically enforced tiles. Heroes occupy B3–B6 then C3–C5, ordered by name.

## README.md

Short premise/format, maturity/themes, list of eight sessions, 3–7-player and mixed-age procedures, authored
limitations (no live playtest), files and import instructions (generated `package.json` defaults
to 4 players; `variants/3-players.json` through `variants/7-players.json`). Model provenance: requested GPT-6 Astra / max,
not an application/provider generation job. No claims of generated illustrations. Agent reports
own count/reference/editorial verification and any unresolved issues to parent.

## This collection: mandatory audience and playability rules

All campaigns support EVERY size 3, 4, 5, 6 and 7, plus one DM (DM not counted).
First three heroes must make a viable story core; any role, clue or decision must remain available
without heroes 4–7. No plot requires a particular class or spell. At least three independent
routes to the main revelation, actually used by scenes. No NPC may know future outcomes as fact.
For mixed audiences use 12+ or 14+ as assigned, with explicit teen + adult guidance: rotate first
speaker, no automatic adult leader, age does not choose character/class, written or spoken choices,
optional pass, equivalent accessible and deeper questions, agency for everyone and no infantilizing.
State duration including opening/recap, 3 scenes, break and closing; scene minutes must fit it.
Sessions should contain choices with different costs and callbacks, not eight repetitive gates.
All names/descriptions and handouts are original. No external research or services are needed.
Do not read other campaign sources. Read root docs only narrowly, then this contract and own scope.
Run `node --input-type=module -e "import('./scripts/dark-fantasy/source.ts').then(async m => { const s=await m.loadSource('YOUR-SLUG'); const e=await import('./scripts/dark-fantasy/editorial.ts'); e.verifySource(s); console.log('source OK'); })"` when done.

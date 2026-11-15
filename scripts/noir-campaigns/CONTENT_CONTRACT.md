# Authoring contract

Each agent writes ONLY `campaigns/noir-2026/<slug>/`: `README.md`, `AGENTS.md`, and JSON
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

Object: `slug`, `title`, `genre`, `audience` (e.g. `18+` or `21+`), `minPlayers` (3),
`maxPlayers` (8), `defaultPlayers` (4), `sessionCount` (8), `sessionDuration` (string),
`pitch` (player-safe), `setting` (player-safe; explain supported sheets as abstract noir game profiles),
`tone`, `worldName`, `startLocation`, `opening` (player-safe read-aloud),
optional `startHour` (integer0–23, defaults9) and `weather` (`clear`, `overcast`, `rain`, `storm`, `fog`, `snow`, defaults overcast); match opening text,
`truth` (array of 4–8 DM-only strings), `themes` (array), `boundaries` (array),
`tableGuidance` (array of concrete procedures for groups of 3–8, spotlight, split parties, absence),
`scaling` (array `{players:number,guidance:string}` for EVERY supported size),
`endings` (at least 3 objects `{title,requires,outcome,cost}` with conditional, non-predetermined results),
`locations` (array `{key,name,type,parent,description}`; one region with null parent, others
parent region; supported types `region`, `settlement`, `site`, `building`; descriptions player-safe).
Keep statements below 1800 chars. Use original detective noir with mature conflicts, no explicit sexual material or gratuitous gore. Give concise theme boundaries.

## cast.json

Object with `heroes` (8) and `npcs` (8 or more).
Hero `{key,name,age:number,role,archetype,look,hook,bond,personalQuestion,spotlight}`;
archetype one of `fighter`, `rogue`, `cleric`, `wizard`; each appears at least once. All hero fields are
player-safe; no DM-only truth. First minPlayers heroes form the default smaller-party core;
remaining heroes are optional seats. Avoid any plot requiring an optional hero. Everyone starts
at world.startLocation. Mechanics fixed level 3 supported canonical classes, fiction is a skin.
NPC `{key,name,age:number,location,look,public,want,secret,knows:string[],boundary,reveal,voice?}`;
an optional `voice` (how the NPC talks: public, no secret or plot fact) becomes the package NPC's
one-line `manner`, which NPC dialogue gives the model (ADR 0020 amendment 2026-11-14).
Optional `status` is `active` (default) or `dead`; MUST set `dead` for historical victims if included as NPCs. Their knowledge is historical, never a present dialogue.
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
`scenes` = 3+ objects `{title,minutes:number,play,choices:string[],check,failForward}`.
Scene play: ~100–180 Russian words of runnable action/dialogue/obstacles, distinct choices,
concrete consequences, clue access and callbacks. `check` states supported ability/skill and DC
where appropriate, success/failure and a no-roll alternative; narrative rulings are DM-adjudicated,
not newly implemented automated mechanics. `failForward` is concrete, not generic retry.
Session consequences array `{if,then}` (at least 2), handout refs existing keys. Eight-session arc
must include alternative paths, earned climax and personal epilogue prompts, no scripted wins.
Give meaningful roles for all seats, group parallel action resolution and return points.

## encounters.json

Array of 3 objects `{key,title,location,trigger,objective,foeName,foeDescription,foeCount:number,
tactics,peaceful,scaling,terrain}`. `foeCount` always 3 (base at 4/5 players). Native counts at 3/4/5/6/7/8 players are 2/3/3/4/5/6;
HP is 12/14/16/18/20/22 respectively, AC 12, one +3 melee attack for 1d4+1. `scaling` concrete
guidance by group size, `terrain` description for a 14×12 grid with central difficult area and cover.
Foes start at encounter location, encounters never start automatically. Objective and retreat,
surrender/negotiation path; no real-world operational violence advice. Do not invent unsupported
combat rules, automatic timers, hacking or spaceship combat. Non-fantasy genres use clear reskin.

## README.md

Short premise/format, maturity/themes, list of eight sessions, 3–8-player and adult-table procedures, authored
limitations (no live playtest), files and import instructions (generated `package.json` defaults
to 4 players; `variants/3-players.json` through `variants/8-players.json`). Model provenance: requested GPT-6 Astra / max,
not an application/provider generation job. No claims of generated illustrations. Agent reports
own count/reference/editorial verification and any unresolved issues to parent.

## This collection: mandatory audience and playability rules

All campaigns support EVERY size 3, 4, 5, 6, 7 and 8, plus one DM (DM not counted).
First three heroes must make a viable story core; any role, clue or decision must remain available
without heroes 4–8. No plot requires a particular class or spell. At least three independent
routes to the main revelation, actually used by scenes. No NPC may know future outcomes as fact.
All characters (heroes and NPCs) are adults aged 21+. Audience is assigned 18+ or 21+.
Adult themes mean complicity, unequal power, shame, grief, responsibility and difficult choices;
no explicit sexual scenes, sexual violence or gratuitous gore. Do not stereotype gender or identity.
Rotate the first speaker, support written choices and passing, never require player autobiography.
State duration including opening/recap, 3 scenes, break and closing; scene minutes must fit it.
Sessions should contain choices with different costs and callbacks, not eight repetitive gates.
All names/descriptions and handouts are original. No external research or services are needed.
Do not read other campaign sources. Read root docs only narrowly, then this contract and own scope.
Run `node --input-type=module -e "import('./scripts/noir-campaigns/source.ts').then(async m => { const s=await m.loadSource('YOUR-SLUG'); const e=await import('./scripts/noir-campaigns/editorial.ts'); e.verifySource(s); console.log('source OK'); })"` when done.

## Detective noir and originality

All settings are fictional, human-scale noir cities with period-inspired technology. No supernatural
solution, time loop, sentient city mechanism, magic debt, stolen musical archive, returning dead,
war crimes escort, coup, tournament, casino heist or world-saving machinery. At least three
independent evidence routes to the main conclusion, with evidence distinct from testimony and
inference. Crime truth is fixed in DM notes; never change the culprit to fit a player theory.
Wrong accusations must be possible and costly but recoverable. No essential clue roll-gated.
Do not use an omniscient NPC or a compulsory confession. Endings need actual player decisions.
Canonical fighter/rogue/cleric/wizard sheets are only a clearly stated mechanical abstraction:
all supernatural effects are OFF by default unless the table explicitly agrees a fiction change;
no essential scene requires a spell. Do not pretend guns, hacking, law or medicine are simulated.
Checks are game procedures, not real professional advice. Optional combat is close-quarters
abstract play and never required; include viable retreat, negotiation and nonlethal intent.
README must include six-part fingerprint: inciting event, culprit motive, investigation activity,
midpoint change, climax action and costs. Explain three independent routes with actual clue keys.
Create world.json first to reserve your premise for other sessions. Do not read others' prose.

## case.json — DM-only detective logic

Also author source/case.json (under 500 lines), exact keys:
`centralQuestion:string`, `culprit:string` (NPC key), `motive:string`, `method:string`
(non-operational fictional synopsis), `timeline: {when,event,witnesses:string[]}[]` (6+ past
facts; witness NPC keys only), `routes: {key,label,clues:string[],reasoning:string}[]` (3+, each
at least 2 distinct clue keys; routes must not all depend on the same clue or one confession),
`suspects: {npc:string,apparentMotive:string,against:string,exoneration:string}[]` (3+ including
culprit; for culprit exoneration states what would be insufficient and why, not false innocence),
`redHerrings: {claim,refutation,clues:string[]}[]` (2+ fair disprovable hypotheses),
`failureRecovery:string[]` (3+: false accusation, lost evidence, uncooperative witness).
Clearly distinguish known facts, witness claims, inferences and uncertainty. All route clues must
appear in session clue arrays and be used in runnable scenes; no future outcome as historical fact.
This file will be rendered only in the DM book; no player export or public package knowledge.

Use Russian titles/names in all rendered prose (scene.play, checks, notes, case explanations).
Machine kebab-case keys belong only to structured reference fields and README route maps.
Do not make the reader decode raw IDs during play.

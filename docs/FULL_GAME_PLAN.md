# Full game plan: table and online play (Stages 600–699)

Owner request 2026-11-01: «построишь план того что не доделано для полноценной игры в DnD … Мне нужен
целый, готовый продукт. У него должно быть два режима игры: 1. оффлайн режим — … ДМ руковожу процессом,
стоя с ноутбуком или iPad, вывожу происходящее на телевизор … игроки … залогинившись в свои учетки … 2. онлайн режим — со всеми соответствующими функциями.» Status: approved by the owner on 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`).
Two independent reviews read it (Claude Opus 5.5, and GPT 6.1 Sol at high effort through the Codex
CLI); their findings were checked against the code and the SRD text and folded in.
It follows the product completion program (Stages 500–540, `docs/PRODUCT_COMPLETION_PLAN.md`).

## When the product is done (the owner's checklist)

**Table mode, one room.**

1. The DM signs in on a laptop or an iPad, opens a campaign and shows a QR code. Each player scans it,
   signs in to their own account (or creates one) and takes or creates a character.
2. The TV shows the table display, paired by a short code: the scene's picture with the place, time and
   weather; the battlefield with the turn order and whose turn it is; every public roll, big; handouts;
   the Chronicle. It shows only what the party knows.
3. The DM runs the game from one screen: what the TV shows; the party at a glance; checks and saves asked
   of anyone; damage, healing and conditions; encounters from a monster catalog; maps with fog; rests,
   levels, loot and shops; notes.
4. Each player's phone holds their character: the sheet, spells and slots, inventory, journal and
   quests, the map, their actions on the battlefield and their dice, and a clear alert when it is their
   turn or the DM asks for a roll.

**Online mode, everyone remote.** The same game; the table display shows on every screen and follows the
DM; text chat (the table, whispers to the DM, in character); voice built in.

**Rules.** The SRD 5.2.1 (CC-BY-4.0) for levels 1–20: 12 classes with their SRD subclass, 9 species,
4 backgrounds and their feats, the SRD spells, all conditions and actions, the SRD monsters, equipment
and magic items. Every number from the server, in English and Russian.

**Content.** A campaign starts from a ready adventure (Ravenford grown into a whole adventure for levels
1–5), from the AI workshop, or by hand with editors that need no AI.

**The SRD 5.2.1's scope, checked against its text (2026-11-01).** Classes and their subclasses:
Barbarian (Path of the Berserker), Bard (College of Lore), Cleric (Life Domain), Druid (Circle of the
Land), Fighter (Champion), Monk (Warrior of the Open Hand), Paladin (Oath of Devotion), Ranger (Hunter),
Rogue (Thief), Sorcerer (Draconic Sorcery), Warlock (Fiend Patron), Wizard (Evoker). Species: Dragonborn,
Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling. Backgrounds: Acolyte, Criminal, Sage,
Soldier. Conditions: Blinded, Charmed, Deafened, Exhaustion, Frightened, Grappled, Incapacitated,
Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious. Actions: Attack,
Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize. Weapon masteries:
Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex.

## Where it stands (main plus PR 23, 2026-11-01)

| Area        | Done                                                                                                                                                  | Missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Stage    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Accounts    | DM invitation links; a cookie session bound to one seat in one campaign; workshop owner accounts                                                      | a personal account across campaigns, a home with my campaigns and characters, joining by QR or code, display devices                                                                                                                                                                                                                                                                                                                                                         | 600, 610 |
| Screens     | one responsive world screen per perspective (DM, player)                                                                                              | the table display (TV), the DM's control screen, the player's companion layout, iPad and Safari (WebKit) verification                                                                                                                                                                                                                                                                                                                                                        | 610–630  |
| Characters  | the sheet with derived numbers, 18 skills, Ranger and Wizard, rests, Hit Point Dice, milestone levels; Ravenford has one character (Elowen, level 15) | a party for a family table, character creation, 10 more classes, subclasses, species, backgrounds, feats, class features to level 20, level-up choices, temporary hit points, several characters for one account                                                                                                                                                                                                                                                             | 605, 660 |
| Rules       | weapon attacks, 6 player spells and 2 monster spells, Counterspell, cover, difficult terrain, death saves, 3 of 15 conditions, Slow mastery           | 12 conditions (exhaustion included); the actions Dash, Disengage, Dodge, Help, Hide, Influence, Ready, Search, Study, Utilize; opportunity attacks and other reactions (Shield, Hellish Rebuke, Feather Fall, Uncanny Dodge, a readied action); grapple and shove; two weapons; 7 masteries; weapon properties (versatile, thrown, reach, loading, heavy), unarmed strikes; creature size and space; flying, swimming, climbing, jumping, height; vision and light; surprise | 640      |
| Magic       | the 6 spells above, slots, free casts, concentration, upcasting for Healing Word and Fireball                                                         | the SRD spell list (levels 0–9) with its mechanics, upcasting for the rest, rituals, preparation, Pact Magic                                                                                                                                                                                                                                                                                                                                                                 | 650, 660 |
| Monsters    | stat blocks per campaign (Ravenford: 4), Multiattack as repeated attacks, the DM's suggested monster turns                                            | the SRD catalog; Multiattack mixing attacks, Recharge and per-day uses, bonus actions and reactions, traits, legendary actions, resistances, condition immunities, senses; size; CR and XP, encounter difficulty; fights larger than 16 combatants, 40×40 squares or 20 damage dice                                                                                                                                                                                          | 650, 670 |
| Items       | a 47-entry catalog (14 weapons, coins), possession, equip, give, drop, use                                                                            | SRD equipment and magic items (ADR 0039 keeps the catalog original today), attunement, charges, unidentified and cursed items, shops and prices, loot from foes, a party stash                                                                                                                                                                                                                                                                                               | 650, 670 |
| Exploration | places, travel, scenes with pictures, objects, examination, clues, hypotheses, contradictions, memories, time and weather                             | the world map with pins, fog of war on battle maps, handouts                                                                                                                                                                                                                                                                                                                                                                                                                 | 670, 680 |
| Social      | NPC talk (AI when configured), asking, showing evidence, Insight, attitudes                                                                           | the Influence action                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 640      |
| Dice        | rolled by the server, 3D dice with sound, the roll log, the DM's check requests to one character                                                      | a player's alert for a request; a request to the whole group; physical dice entered by hand; big dice on the TV                                                                                                                                                                                                                                                                                                                                                              | 610–630  |
| Story       | the quest log with completion, the Chronicle book, flashbacks                                                                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —        |
| DM tools    | authoring by AI intents, starting encounters, suggested monster turns, time and weather, history and undo, images, players, acting for a player       | the control screen; damage, healing and conditions by hand; a session's start and end; changing a running fight (combatants in and out, delay, initiative); the encounter builder; map tools; notes; random tables; editors without AI                                                                                                                                                                                                                                       | 620–680  |
| Online      | live updates and presence                                                                                                                             | chat, voice, the shared view on every screen                                                                                                                                                                                                                                                                                                                                                                                                                                 | 630, 695 |
| Atmosphere  | GPT art, synthesized dice sounds                                                                                                                      | ambience, the DM's music, scene transitions and title cards                                                                                                                                                                                                                                                                                                                                                                                                                  | 690      |
| Content     | the Ravenford slice (one quest), the AI workshop                                                                                                      | a whole starter adventure, Russian SRD data                                                                                                                                                                                                                                                                                                                                                                                                                                  | 650, 680 |
| Operations  | the VPS deployment, backups, readiness                                                                                                                | AI keys and ceilings on the VPS (the owner's), a local mode on the DM's laptop                                                                                                                                                                                                                                                                                                                                                                                               | 690, 697 |

## Decisions (owner-delegated unless marked)

1. **"Offline" is one room.** It runs on the same server over the internet. Stage 697 adds a local mode:
   the server on the DM's laptop, devices on the home Wi-Fi, no internet needed (AI off).
2. **Accounts**: a login and a password per person, no e-mail; the DM or the operator resets a forgotten
   password. An invitation link, a QR code or a short code adds an account to a campaign (ADR 0036's
   invitations stay for joining). This supersedes owner decision Q4 ("no passwords") at the owner's
   request of 2026-11-01 for accounts.
3. **Display devices** pair by a short code the DM confirms, hold the PARTY perspective, read only, and
   need no account.
4. **One product, two modes.** A session is Table or Online; they differ only in where the shared view
   shows (the TV, or every screen) and in chat and voice.
5. **Rules source**: the SRD 5.2.1 under CC-BY-4.0, credited on an About page. Ravenford's names stay;
   no content outside the SRD.
6. **Data-driven rules**: spells, monsters, items and features are validated data over a small effect
   vocabulary (attack, save, damage, healing, condition, area, duration, concentration, resource);
   what the vocabulary cannot say is code with its own tests. The vocabulary also carries bonuses and
   advantage from a source (Bless, Shield, Rage), temporary hit points, lasting zones (Web, Spirit
   Guardians), pushes and pulls, and creature size. The server computes every number.
7. **Russian**: the SRD data translated with the Codex CLI on the owner's ChatGPT subscription (as the
   art), against a glossary of the Russian 5e terms; a test holds every entry translated.
8. **Voice** is built in (WebRTC audio, a TURN relay on the VPS) at Stage 695. **The owner's OK is
   needed then for the relay's ports on the shared VPS.** Until then an online group uses any voice app.
9. **Music**: the DM uploads their own tracks (private to the campaign) and plays them on the display;
   the product adds synthesized ambience (rain, wind, fire, crowd, night). No third-party audio.
10. **Alerts** in the open app with sound, and vibration where the device has it (not iPhone); an alert
    stays until it is answered; the TV and the DM screen show whom the table waits for; a background
    tab shows a count in its title; the screen kept awake during a session. No background push: no
    service worker may hold world data (`apps/web/AGENTS.md`).
11. **AI stays optional.** Everything works without AI keys. With the owner's keys and ceilings (asked at
    Stage 690) NPCs speak, chronicles are written in prose and the workshop generates.
12. **Delivery**: one pull request per milestone (A–D). Each ends with a demo and one question — merge and
    deploy — since a merge needs the owner's word each time.
13. **Physical dice**: a campaign may let players roll their own dice and enter the result. The log
    marks such a roll as entered, and the server still computes every outcome from it. The app's dice
    stay the default.
14. **One account, several characters**: the DM may give one account several characters (a child on a
    shared tablet); the companion switches between them and each keeps its own knowledge. The rule
    "one character per player" (`packages/domain/src/knowledge/decide.ts`) changes with an ADR.
15. **A character in another campaign** is copied as a sheet only, never with what it knew.
16. **Campaign options**: hit points at a new level fixed or rolled; levels by milestone or by
    experience; carrying weight shown or enforced.
17. **The TV needs its own browser**: a laptop window on HDMI, a TV stick or the TV's browser, or a
    computer's cast tab. Mirroring the DM's iPad (AirPlay) would show the DM's secrets; the DM screen
    warns against it.
18. **SRD items**: ADR 0039 keeps the item catalog original to Ravenford and a test forbids SRD names;
    Stage 650 amends it so SRD equipment and magic items enter with their attribution.
19. **Out of scope**: content outside the SRD, video, native store apps (the web app installs to a home
    screen), custom classes (custom items and monsters are in through the editors), dynamic lighting with
    walls (the DM reveals the fog instead).

## Stages

### Milestone A — two modes at one table

- **600 Accounts and the hub.** Sign-up and sign-in (Argon2id, limits), my campaigns, my characters,
  joining by link, QR or code, roles; today's seats move to accounts; the DM's invitation as a QR code.
- **605 A party for the table.** Ravenford has one character (Elowen, level 15): three companions join
  her, with sheets built from the rules that exist then, and the ambush is balanced for four, so a
  family can sit down at Milestone A's end.
- **610 Table display.** Pairing by code; layouts for the scene, the battlefield, dice, a handout, a title
  card and the Chronicle; follows what the DM casts; read only, PARTY perspective; full screen; a light
  mode for weak TV browsers (no WebGL needed); a split party (the DM picks whose place the TV shows); the
  join QR code and a "last time" recap; whom the table waits for; the DM pans, zooms and recentres
  what the TV shows; the DM lists, replaces, disconnects or blanks paired displays at once; a TV that
  restarts comes back to what was cast.
- **620 DM screen.** A control layout for a laptop or an iPad: the party panel (hit points, AC,
  conditions, passive scores, slots, inspiration); quick actions — ask one character or the whole group
  for a check, apply damage, healing or a condition with a reason, all through the World Engine; what the
  display shows; the turn order, with combatants added or removed mid-fight, a delayed turn and an
  edited initiative, and larger fights (more than 16 combatants, 40×40 squares, 20 damage dice); a
  session's lobby (who is here and ready, Table or Online, absent characters), start, pause, resume
  and end (rewards, the chapter, the TV unpaired, guests signed out); a ruling — the outcome of an
  improvised action recorded through the World Engine with its reason, and a physical roll the DM
  confirms; notes. An iPad that sleeps or a reload comes back to the same screen and its open
  prompts.
  WebKit (iPad) journeys join the suite (the Playwright WebKit browser is added locally and in CI).
- **630 Player companion and online play.** A phone-first companion: my turn, my sheet, dice, inventory,
  spells, journal, map; alerts for a turn, a requested roll, a rest, a handout, a reaction; the screen
  kept awake; a private note, handout or roll between the DM and one player at the table too; player
  notes and backstory; switching between an account's characters; physical dice entered by hand; a
  player runs the creatures they summon or command (their turns and actions); a reload or a locked
  phone comes back to the open prompt.
  Online sessions: the shared view on every screen, text chat (the table, whispers to the DM, in
  character) with the rolls in its log. A first-session guide for new players (what the screens
  are, how a turn goes, how to roll).

### Milestone B — the rules

- **640 Conditions and actions.** The 15 conditions with exhaustion's levels, durations and saves to end;
  Dash, Disengage, Dodge, Help, Hide, Influence, Ready, Search, Study, Utilize; opportunity attacks;
  reactions beyond Counterspell (Shield, Hellish Rebuke, Feather Fall, Uncanny Dodge, a readied action);
  grapple and shove; two-weapon fighting; the 8 weapon masteries; the weapon properties (versatile,
  thrown, reach, loading, heavy), unarmed strikes and improvised weapons; ammunition (spent, half
  recovered); creature size and space, squeezing; flying, swimming, climbing, jumping, burrowing,
  height and falling; temporary hit points, a lowered hit point maximum, and resistance, vulnerability
  and immunity for characters as for monsters; attacking objects (a door, a rope); knocking a creature
  out instead of killing it; rests by the full rules (one long rest in 24 hours, a rest interrupted,
  its partial benefits); armor's Strength and Stealth rules; mounted and underwater combat;
  vision, light and obscurement; surprise; Heroic Inspiration; hazards, traps, poisons and the
  environment (falling, suffocation, cold, heat).
- **650 SRD data.** Equipment and magic items (attunement, charges); the spell list with its mechanics
  (levels 0–9, upcasting for every spell, rituals, concentration, material components with a cost);
  the monsters (actions, legendary actions, resistances, senses, CR and XP), which also give summons,
  companions and Wild Shape forms their stat blocks; the in-app rules reference (the SRD glossary,
  tooltips on conditions, spells and actions); GPT art for the new monsters, items and spells; the
  Russian translation pipeline. Monsters get Recharge and per-day uses, bonus actions and reactions,
  traits (Pack Tactics, Magic and Legendary Resistance), condition immunities and a Multiattack that
  mixes attacks; magic items can be unidentified or cursed; diseases, curses, fear and mental stress
  (the Gameplay Toolbox). ADR 0039 is amended first (decision 18).
- **660 Characters.** The creation wizard (species, class, background, abilities by standard array, point
  buy or rolls, skills, equipment or gold, spells); the 12 classes with their SRD subclass and features to
  level 20; level-up choices (subclass, ability increase or feat, spells); multiclassing; tool
  proficiencies and languages; a portrait made by GPT (the image key); death, resurrection and a new
  character joining mid-campaign; a printable sheet; the campaign options of decision 16, with
  experience awarded and divided, its totals and the level it brings; a character
  copied from another campaign (decision 15). The workshop and the DM's editors use the same
  builder.

### Milestone C — adventures and the DM's toolkit

- **670 Encounters, maps, loot.** The encounter builder from the catalog with its difficulty; monsters
  placed and moved on the grid, the DM's drag and drop; fog of war; measuring and area templates; battle
  maps uploaded or made by GPT, the grid lined up on them with their scale and origin, tokens saved per
  scene; pings, a pointer and drawing; the world map
  with pins, travel pace and terrain; traps and hazards the
  DM places; loot from foes and treasure, a party stash and coins split; merchants who buy and sell;
  crafting by the SRD rules.
- **680 Campaign content.** Editors that need no AI (places, people, monsters, items, clues, quests,
  encounters); a handout library; random tables; a whole starter adventure for levels 1–5 in the
  Ravenford setting, a new campaign of its own (characters from the wizard or ready-made; the level-15
  slice stays a one-shot); the workshop generates with the full SRD.

### Milestone D — atmosphere, voice, local play, release

- **690 Atmosphere.** Synthesized ambience per scene and sound effects for hits, misses and spells; the
  DM's tracks; scene transitions and title cards on the display; big dice on the display; AI keys and
  ceilings on the VPS (the owner's call then).
- **695 Voice.** WebRTC audio for up to 8, TURN on the VPS (the owner's OK for ports), push to talk and
  mute, the DM's controls; microphone choice, a refused microphone explained, reconnection, echo
  cancellation when several devices share a room.
- **697 Local mode.** One command starts the server on the DM's laptop; devices join on the home Wi-Fi;
  backups stay on the laptop; a campaign moves between the VPS and the laptop with its history and
  accounts; the laptop's address shown as a QR code to join, HTTPS that phones trust, the firewall
  set.
- **699 Release 1.0.** A-to-Z journeys of both modes on Chromium and WebKit (the DM, a display, three
  players); audits; a security review; account privacy (deleting an account, exporting its data, a
  privacy notice); the owner's family playtest (the owner's acceptance); deploy; the
  v1.0 tag (the owner's).

## Order and size

Milestone A first: it makes Table and Online play work with today's rules and Ravenford's party of four
(605), so the family can play early. B and C make it full D&D; D finishes the experience. Rough sizes: 600 M, 605 S, 610 M,
620 L, 630 L, 640 L, 650 XL, 660 XL, 670 L, 680 L, 690 M, 695 M, 697 S, 699 M.

## Risks

- **Scope.** The SRD is large; data-driven effects keep it tractable, and a feature the data cannot say is
  coded against its SRD text with tests.
- **TV browsers** are weak: the display has a light mode; the recommended set-up is a laptop or a stick on
  HDMI, or casting a browser tab.
- **Voice** depends on the VPS's network; without the relay's ports it works only where direct
  connections do.
- **AI costs money**: AI features stay off until the owner sets keys and ceilings.
- **Russian rules text**: the glossary and a completeness test; the owner's playtest reads it.

# Player session notes (AI stand-in, not a human; notes written after the run from my action log)

## OBSERVATIONS

### Phase A - ui-session-player (~35 actions)

- Sign-in: Campaign field prefilled "ravenford"; replaced with ui-session-player, token dev-player-elowen, Enter. Screenshot taken right after Enter showed stale sign-in page; page text already showed the world (screenshots lag ~1-2s).
- Landing: "The Missing Caravan", Location dropdown (Golden Stag Inn, Market Square, Merchant Guild, North Gate, Old Trade Road, Orin's Alchemy, Ravenford), scene "Market Square", Day 1 - 10:00, tokens: Elowen Starwhisper (CHARACTER), Mira Vale (NPC). Text "Choose a person or object to look closer."
- Clicked Mira token: panel "A CLOSER LOOK" with buttons: Ask about Merchant Guild / Merchant Guild caravan / Recall memories / Talk / Ask about Market Square / Old Trade Road / Ravenford / Inspect; collapsibles "More conversation options", "Form a hypothesis", "All contextual options"; "Follow a lead" chips; "Full knowledge".
- "Ask about Merchant Guild caravan" -> banner "New testimony recorded." TESTIMONY "The caravan carried goods for the Merchant Guild along the Old Trade Road." Attributed to Mira Vale.
- "Talk" -> banner "No spoken reply is available. You can still ask about a subject." (dead end, no dialogue)
- "Ask about Old Trade Road" -> testimony "A similar caravan vanished on the Old Trade Road last spring."
- Clicked lead chip "Explore Old Trade Road": it only changed the side panel to Old Trade Road, "LOCATION / Known, but not here", with button "Enter Old Trade Road" (disabled "already here" once there). Did not travel. Then "Enter Old Trade Road" -> "You arrived. Your surroundings have been refreshed." Scene Old Trade Road, only Elowen visible.
- "Inspect" on the road -> "Resolving your action..." then "No new evidence was discovered."
- Under "Beyond this place" the only button was "Explore Unidentified location". Clicked it, then "Enter Unidentified location" -> scene named "Unidentified location" with 3 "Unidentified item", 2 "Unidentified feature", Elowen.
- Clicked first Unidentified item -> Inspect, Investigate, Perception check, Detect magic (Level 1 slot). Inspect -> "Evidence discovered." EVIDENCE "A wagon wheel lies broken beside the road."; location renamed "Abandoned Caravan Site", item "Broken Wagon Wheel".
- Investigate on wheel -> "Check: 15 + 8 = 23", evidence "The spokes were sawn through cleanly, not smashed." Investigate then greyed "already attempted".
- Second item Inspect -> "Some cargo was burned where it stood." (Burned Cargo). Two items/features left unidentified; I did not examine them.
- "Form a hypothesis" textbox ("Record your interpretation. A hypothesis does not establish a fact."), "Share with: Party", "Record hypothesis". Typed my hypothesis -> "Hypothesis recorded as HYPOTHESIS." card shown.
- Chronicle section said "No chapter has been written for this view yet." Remembered events list showed raw timestamps like "DECISION - 35400" and "OBSERVATION - -17366400".
- Never found a person or place about North Gate (Mira's nervous glance); did not visit other locations.
- Used world objects (clicking Mira/items) for all main goals; location change and "Explore X" chips were the only list/menu hunting. Page is long; results banners appear at top and are off-screen after scrolling down to act.

### Phase B - ui-session-turn (~8 actions)

- Opened directly into combat: "Round 1 Turn: Elowen Starwhisper You: 78 / 78 HP [End turn]" and a 15x10 grid with ES (me), GR1, GR2, GR3, GS tokens. Legend: "Shaded squares are difficult terrain; outlined squares give cover. Select a square to move or a combatant to act."
- Clicked GR2: enemies highlighted orange; panel at bottom of grid (below fold) "goblin-raider-2, Distance: 40 ft" with: Cast Healing Word on goblin-raider-2 (Free cast); Cast Hunter's Mark on goblin-raider-2 (Free cast); Attack goblin-raider-2 with longbow; Cast Fireball at goblin-raider-2 (Level 3 slot, "Would affect: goblin-raider-1, goblin-raider-2, goblin-raider-3, goblin-shaman").
- Healing Word offered on an enemy. Cast Hunter's Mark: banner "The spell resolved without new evidence." (no sign of what it did). After, Healing Word and Hunter's Mark showed disabled "no bonus action".
- Cast Fireball: banner "fireball resolved on 4 targets." Three raiders faded; later World view lists them as "Dead", shaman "Active - Wounded". No damage numbers shown.
- Clicked End turn: "Turn ended. Round 1." Header "Turn: goblin-shaman". Nothing further happened over ~10s and after Refresh world. Left session. No obvious message that I was waiting for someone.
- Enemy names on the grid were "GR1/GS" and in the panel "goblin-raider-2"; world view called them "Unidentified creature".

### Phase C - ui-session-window (~2 actions)

- On entry a yellow card above the grid: "goblin-shaman is casting a spell / Components: V, S. The spell waits until you answer. [Cast Counterspell] [Ignore] / Uses a level 3 slot." It did not say what spell or the consequences of Ignore.
- Clicked Cast Counterspell -> "Counterspell stopped the spell." Combat still "Turn: goblin-shaman".

## INTERPRETATION (opinion)

- Phase A was followable: talking to Mira then entering the road then inspecting gave a coherent clue chain. Weak points: "Explore X" chips look like travel but only open details; "Unidentified location" as the only onward button is confusing/leaks a placeholder; I had to guess to enter it.
- The renaming of "Unidentified" things after inspecting was satisfying but items left "Unidentified" gave no hint of what to do.
- Talk gives nothing; a newcomer might expect dialogue.
- Action results are shown in a banner at the top while actions are far below; easy to miss. Combat feedback is thin: no damage/rolls, Hunter's Mark effect not visible.
- Offering Healing Word on an enemy is odd. Counterspell prompt lacks spell name; I chose it by guess.
- After End turn the game seems to wait for a DM with no message.
- Raw numeric timestamps in event list look broken.

## OUTCOME TABLE

| Phase | Result                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Reached unaided, with some difficulty (travel/Explore confusion, Unidentified location)                                                                                   |
| B     | Reached with difficulty: took actions and ended turn, but unsure whether Hunter's Mark applied and why Healing Word was offered on an enemy; stuck waiting after end turn |
| C     | Reached unaided, but chose blind (spell unnamed)                                                                                                                          |

## TOP 5 PROBLEMS

1. Result banners appear at top of a long page, off-screen from where actions are taken; combat results lack damage/roll detail.
2. "Explore <place>" chips do not travel; only open details; "Explore Unidentified location" as sole onward path.
3. Counterspell/reaction prompt omits which spell and what Ignore does.
4. After End turn, "Turn: goblin-shaman" with no waiting indicator; nothing progresses.
5. Odd options/text: Healing Word offered on enemies, "Talk" gives no reply, raw timestamps "-17366400", Hunter's Mark "resolved without new evidence".

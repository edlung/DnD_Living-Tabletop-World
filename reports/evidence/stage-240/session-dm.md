# DM usability session (AI stand-in, not a human)

## Phase 1 OBSERVATIONS

- Sign-in: campaign field prefilled "ravenford" after load/leave. My first attempts failed (tooling: form_input on token did not take effect; screenshots lag a step). Got "This information is not available in the current view." + Try again / Leave session, then "Your access token was not accepted. Leave the session to reconnect." Succeeded on typing campaign via triple-click+type and token via click+type, then clicking "Enter world". Unclear whether failures were my tooling or app; the generic error text gave no hint (about 4 failed attempts).
- Main screen: header "The Missing Caravan", badge "DM view . all knowledge", collapsed sections "Add to the world (DM)", "Start an encounter (DM)", "Time and weather (DM)", Location select, Perspective select (Dungeon Master/Party/Public/Elowen Starwhisper).
- Opened "Add to the world (DM)": textarea "Describe what to add" (placeholder example = exactly my task), button Propose.
- Typed "A young guard named Tomas standing near the North Gate, who saw the caravan leave." -> Propose -> "The assistant could not turn that into a proposal. Try describing it differently." (no further hint)
- Typed "Add a young guard near North Gate who saw the caravan leave." -> Propose -> draft card "Draft . revision 1": 1. Create npc Tomas Reed at North Gate - A young guard. 2. Tomas Reed holds testimony: "Tomas Reed saw the caravan leave." Risk: L2 - Adds a new NPC to the world; Gives an NPC knowledge. Sections "Edit proposal", "What will change in the world" (lists EntityCreated, EntityPlaced, KnowledgeAssigned, AssetRequested - jargon). Buttons "Confirm and add to the world", "Cancel proposal".
- Edit proposal fields: Name, Description, Where they stand (select), What they saw or know, a checkbox with label "Willing to tell this when asked" (label is placed under/beside oddly; checkbox is large and detached from label), "Apply changes".
- I selected-all (cmd+a) then typed a new description: result was concatenated "A young guard.A nervous young guard..." (select-all did not replace; may be my tool). Fixed via triple-click+type. Checked willing box; Apply changes -> "Updated. The preview and confirmation were recomputed." revision 2, risk line gained "Lets an NPC share a record when asked", item 3 "This account is willing to be shared when asked" (wording "account" odd).
- Revision 3 after second edit; Confirm -> "Added to the world." card "Added to the world . revision 3" with "Undo this addition" and "Start another".
- No way I found to preview what the player would see BEFORE confirming (the card only lists changes). Checked player visibility after.
- Checked after: Location=North Gate as DM shows Captain Thorne and Tomas Reed (2 visible). Clicking Tomas shows "Follow a lead", "Perform Tomas Reed (DM)", "Full knowledge" (TESTIMONY: Tomas Reed saw the caravan leave through the North Gate before dawn. Attributed to Tomas Reed), "Full character sheet".
- Perspective Elowen Starwhisper (Scoped perspective), Location North Gate: "0 visible - This location is known, but it is not observed in this perspective." Known people & places list: Captain Thorne, Elowen, Golden Stag Inn, ... no Tomas (find "Tomas" no match). Public perspective: Market Square, 0 visible; no Tomas. Did not check Party separately.
- Switching perspective back to DM: the add-proposal card (with Undo this addition) was gone; Add panel shows only empty form.
- Perform Tomas Reed (DM): "Speaking with" select has only Elowen Starwhisper; textarea "What the character says (optional)"; "Speak as Tomas Reed"; "Ask about" subject select + "Answer the question". Typed a line, clicked Speak -> "Tomas Reed cannot speak with this character now. Spoken, not a recorded fact." Asking about North Gate -> same message. No stated reason. (Elowen is at Market Square, Tomas at North Gate; I guess that is why, but UI does not say so.)
- Elowen perspective has no movement controls (only look, Explore Ravenford). Could not find any way to put the player's character at North Gate.
- "Full character sheet" on Tomas (NPC) -> after wait: "This information is not available in the current view." + Try again (no reason).
- UNDO LOST: the "Undo this addition" button for Tomas lived only in the proposal card. After I switched Perspective (DM->Elowen->Public->DM), the card was gone and no Undo/History appears anywhere (searched page; Refresh world did not bring it back). Browser reload (navigate) logs you out (session cleared); after re-login also no undo. So Tomas Reed still exists in the world; I could not undo him.
- Workaround to test speak+undo: proposed "Add a young guard near Market Square who saw the caravan leave." -> blocked card: "This cannot be added until fixed: ID "tomas-reed" was already used" button "Use the ID tomas-reed-2"; warnings (checkbox, must accept): "Tomas Reed was at North Gate before recorded history, not at Market Square" with buttons "Place Tomas Reed at Market Square from before recorded history" / "Make it a rumor they heard"; "Tomas Reed would know about Tomas Reed, which neither the public nor the party knows". Used the ID fix -> warning "Tomas Reed" is also the name of tomas-reed. I renamed to Pip Marsh via Edit (checked willing box), Apply changes, warnings vanished, Confirm. Pip Marsh at Market Square with Elowen.
- Perform Pip Marsh (DM): typed line, "Speak as Pip Marsh" -> "Pip Marsh has nothing to say. Spoken, not a recorded fact." Unclear if my line was delivered; free text apparently not used / not shown anywhere. The "Ask about" subject list did NOT include Pip Marsh (stale; it contained Tomas Reed). Chose subject "Merchant Guild caravan" + "Answer the question" -> same "has nothing to say".
- Undo this addition on Pip: red "Other parts of the story now depend on this. Undo them first, newest first." + box "Undo is blocked by later steps that depend on this: . AskAbout [Undo AskAbout first]" (jargon "AskAbout"). Clicked "Undo AskAbout first" -> "That step was undone. You can try the undo again." Clicked "Undo this addition" -> "Undone. The world no longer holds this." badge "Undone . revision 3". 3 extra clicks.
- So: Phase 1 speaking as the original guard: NOT reached with the original guard (cannot speak: not co-located; no explanation). Undo of Tomas: NOT reached (button disappeared). Undo of a second guard: reached, with dependency guard working.

## Phase 2 OBSERVATIONS (ui-session-player)

- Signed in (Leave session, typed campaign + token, Return). DM view at Market Square, "Day 1 . 10:00", Mira Vale only visible; remembered events show first-session events at time 36000 (header clock still said Day 1 . 10:00).
- Opened "Time and weather (DM)": button "Advance to Day 2, 10:00", number field "Or advance by (hours)" (value 8), "Advance time", "Weather at Market Square" select (clear/overcast/rain/storm/fog/snow) + "Set weather".
- Clicked "Advance to Day 2, 10:00" -> banner "Action resolved. Your view has been refreshed." World view header "Day 2 . 10:00". The button still reads "Advance to Day 2, 10:00" afterwards (stale label).
- Weather select pre-showed "rain" though the scene showed no weather tag. Selected fog, clicked "Set weather" -> header shows "Fog". The select still displays "rain" afterwards (misleading). Weather is per location ("Weather at Market Square"); I only set Market Square; did not set others. I did not know what the previous weather was (no label before).
- Chronicle section: "Write a chapter (DM)" with prefilled Title "Chapter I - Shadows on the Trade Road", "Told from" select (Party / Public / Elowen Starwhisper; default Party), "Write chapter". Clicked -> "Chapter written." Chapter shows range "Day 1 . 00:00 - Day 2 . 10:00" and 8 entries. Each entry's text appears twice (summary line then same line + TESTIMONY/EVIDENCE tag + "Open flashback"). One entry reads "Mira told us ... According to that account: Mira Vale says the caravan left before dawn." Did not edit the title or text (no way seen to edit the prose). Party perspective shows the same chapter. Did not click Open flashback.
- Party perspective at Market Square: "0 visible - not observed"; weather/Fog not visible there.
- Actions: time 1 click (+1 to open panel), weather 3 interactions, chapter ~3.

## Phase 3 OBSERVATIONS (ui-session-window)

- On entry (DM view, Location select = Market Square though fight is on Old Trade Road): "Encounter controls (DM)" opened: "Suggested turn: Goblin Shaman moves toward Elowen Starwhisper, the nearest hostile (50 ft away)." Buttons "Run suggested move", "End encounter". Header "Round 1 Turn: Goblin Shaman", 16x12 grid with tokens GR/GR/ES/GS/GR. I saw NO text anywhere about a spell or something awaiting the player (searched page for spell/reaction/pending/waiting: no match), in DM or Elowen perspective.
- Clicked "Run suggested move" -> banner "You moved to 6, 2." (first person, though DM acted for the goblin). New suggestion "Goblin Shaman ends its turn: nothing it may do reaches a hostile." -> "Run suggested end turn" -> "Turn ended. Round 2." Now "Turn: Elowen Starwhisper" and the only DM control left is "End encounter". No "skip turn"/"act for player" control found.
- Clicking Elowen's token (or Goblin Shaman's token) in DM view opens a panel with "This perspective is not available to your account." + Try again (retry same).
- Elowen perspective: Round 2, Turn Elowen, "You: 78 / 78 HP", 5 visible, goblins shown as "Unidentified creature". No pending prompt/option visible to me there either. I did not find where a pending spell answer would appear; it is possible my two DM clicks resolved/hid it, I cannot tell.
- Clicked "End encounter" (no confirmation dialog) -> "Action resolved. Your view has been refreshed." Encounter gone; section back to "Start an encounter (DM)". The game is no longer stuck, but the whole fight was abandoned rather than the pending spell resolved.
- Elowen's HP unknown change; I did not check what happened to the pending spell.

## INTERPRETATION (opinion, AI stand-in, not a human)

- Propose/edit/confirm flow is clear and good (editable fields, risk label, change list). Weak spots: jargon ("EntityCreated", "AskAbout", "L2/L3"), "account is willing to be shared" wording, no "what players will see" preview before confirm, concatenating text on edit (possibly my tool).
- Undo living only inside the transient proposal card is a serious trap: any perspective switch or reload loses it.
- Speaking as an NPC: refusal messages give no reason; free text seems to have no visible effect; subject list stale.
- Combat: the DM has no visible way to deal with an absent player's pending decision or turn; "End encounter" is the only exit and is destructive with no confirm.
- Sign-in errors were generic.

## OUTCOME TABLE

| Phase | Goal | Result |
| 1 | Bring guard in, refine, confirm | reached with some difficulty |
| 1 | Check what player sees/doesn't | reached (switch Perspective; no pre-confirm preview) |
| 1 | Undo original guard | not reached (button vanished); undone only a second test guard, with difficulty |
| 1 | Speak as guard to a player's character | not reached for original (refused); test guard: "nothing to say", unclear if delivered |
| 2 | Next day + different weather | reached unaided |
| 2 | Written account for players | reached unaided (duplicated lines in text) |
| 3 | Unstick game | reached with difficulty, only by ending the whole encounter; the pending spell was never seen |

## TOP 5 PROBLEMS

1. Undo for an added NPC disappears after switching perspective/reloading; no history or undo elsewhere.
2. Speaking as NPC fails with no reason ("cannot speak with this character now" / "has nothing to say"); no way to bring the character to the NPC; free text not shown; Ask-about list stale.
3. Absent-player combat: no pending-spell indicator for DM, DM cannot act/skip for the player; token panels error "This perspective is not available to your account"; only destructive End encounter without confirmation.
4. Jargon/generic errors ("AskAbout", "EntityCreated", "This information is not available in the current view", sign-in failures).
5. Stale/misleading UI: weather select keeps showing "rain" after setting fog; advance button label stays "Day 2"; Location defaults to Market Square while fight is elsewhere; chapter text duplicated; no pre-confirm player-view preview.

# The book interface: the acceptance map

Stage 1000 (`work-orders/STAGE_1000.md`, ADR 0075 §1.3). Every control and view the product has on
2026-11-23 (`main` 5b4961b1), read from `apps/web/src` into three inventories, with the book, part
and page it goes to. A stage that rebuilds a screen proves each of its rows; nothing the product
can do today is lost (the plan's checklist, item 2).

| File                                                                           | What it covers                                                                                                                                                                                                                       | Rows      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| [`book-interface-map/dm-tools.md`](book-interface-map/dm-tools.md)             | The DM's tool sheets: Party, Encounter, Session, Table screen, Notes, Time and weather, Add to the world, Images, History, Players, and the DM's parts of Journal, Places, Chat, Dice, Rules                                         | 368       |
| [`book-interface-map/play.md`](book-interface-map/play.md)                     | The play screen for the DM and a player: top bar, dock, scene, details, conversation, combat, dice, the character dialog, the builder, the Chronicle, rituals, comforts, native-only pieces, the table's screen and its eleven casts | 410       |
| [`book-interface-map/entry-workshop.md`](book-interface-map/entry-workshop.md) | The way in (sign-in states, invitations, the table's code, the hub, the account, privacy, broken page) and the workshop (access, drafts, scenario, editing, AI edit, locks, comparison, generation, preview, pictures, activation)   | 240       |
| **All**                                                                        |                                                                                                                                                                                                                                      | **1,018** |

Where the rows go: the DM's book 364, both the DM's and the hero's books 232, the manuscript 125, a
piece of every book (running head, bookmarks, the foot's dice, slips, opening a book) 101, the
hero's book 98, the shelf 82, the open book on the table 16.

## How it was made, and its limits

- Read from the code by three read-only passes on 2026-11-23 (the session's subagents), one a
  file; the English words are the `t('…')` keys, the Russian ones from `apps/web/src/i18n/`.
  Nobody opened the running app for it. A row is a control a user can see or use; trivially
  repeated controls are grouped.
- "Goes to" is the section's destination unless a rule on the row's words names another (a
  handout tool on the Party sheet goes to Journal › handouts, a fight-time control to the fight
  fold-out, a trap or a ruling to Rules › toolbox, and so on). The rules are mechanical; Stage
  1030 and later check each row by hand as they rebuild it.
- Found while reading, for the stages that rebuild them: the library appears twice (the hub's
  "Campaigns from the library" and the workshop's "Ready campaigns"); the workshop has no way in
  from the hub in a browser (only the LTW DM app links to it); handouts, the toolbox and "ask for a
  check" live on the Party sheet; sound and music on the Session sheet; "Replace", "Line up the
  grid", "Request a picture" and "Upload a battle map" only in the details panel; a column of
  table asks under the top bar holds a player's checks, handouts, pause asks and the break; no
  confirmation before "Unpair every screen", "Revoke the invitation", deleting a note or undoing.

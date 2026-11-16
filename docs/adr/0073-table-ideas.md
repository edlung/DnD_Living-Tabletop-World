# 0073. Ideas from other tables: ten small things around play

- Status: Accepted for §1 (the owner's word of 2026-11-16, «приступай к реализации этих
  улучшений…», quoted as relayed in `reviews/OWNER_TABLE_IDEAS_2026-11-16.json`; every point of §1
  is the session's and is marked in the plan, `docs/TABLE_IDEAS_PLAN.md` decisions 3–4, and stays
  the owner's to overrule). Later sections are added by their stages and are not in force until
  then. §1 amends ADR 0062 §1 (the notice names error reports), ADR 0042 §2 (a table display's one
  write), ADR 0033 (one more read in the DM's live inventory) and ADR 0061 §5 (a table that names
  a campaign and stays behind).
- Context: The program after «Память и ритуал» borrows ten things other tools for the same hobby
  do well. This ADR holds their contracts, one section a stage. The first: the client reported
  nothing. A game's screen that failed while drawing fell back to a line about a "world response"
  and one button, which signed the person out; the list of campaigns, signing in, the table's
  display and the privacy notice had no fallback at all and went blank. Nobody but the person
  holding the phone knew — and a child does not say "the page threw a TypeError", a child says "it
  does not work" or nothing.

## Decision

### 1. Client error reports (Stage 800)

1. **What a report is.** Fixed fields, each an enumeration, a number or one strict pattern:
   - how it surfaced — while drawing (`render`), as an uncaught error (`error`), as an unhandled
     rejection (`rejection`);
   - the error's class — one of a fixed list of names (`TypeError`, `RangeError`, the DOM's
     `NotAllowedError`…), `Other` for any name not on it;
   - the screen — the page (the game, the list of campaigns, signing in, the table's display, the
     workshop, the privacy notice) and, in the game, the part that was open (a sheet of the dock,
     the Chronicle, a hero's sheet, the fight);
   - the browser's family and major version, the device's system, the native shell if any — each
     worked out in the browser from its own description of itself, which is not sent;
   - the place in the program's own code: up to three frames, each a script's file name of this
     application and two numbers (line, column).

   The server adds what it knows without being told: its build (`LTW_REVISION`), the time, and —
   from the sender's own credential — whether the sender is a player, the DM or a table display
   of the campaign the report names (or, for a session or a display, of the one it is signed in
   to).

2. **What a report never is.** No message text (an error's message can quote what it failed on),
   no address or query of the page, no name, login, account, character or perspective, no stack
   beyond the three frames, no words anyone typed, nothing read from the world. The client builds
   the report from the error's class and stack alone and drops a frame that is not one of the
   application's own scripts. A report does not say who: at a family table the browser and the
   device say enough to find the phone, and a person's copy of their data (ADR 0062 §2) has
   nothing to list.
3. **What is not reported.** A request the server refused or the network dropped (the screen says
   so already), a cancelled request, the browser's "ResizeObserver loop" notice, an error from a
   script that is not the application's (an extension). At most five reports from one page load,
   and never the same one twice.
4. **Where it goes.** `POST /client-errors` on the family's own server: no third party, no SDK
   (ADR 0070, `FULL_GAME_PLAN.md` decision 10). Anyone who can load the page may send one — a
   page can break before sign-in — so the route is limited by the sender's address group and as a
   whole, and its body is two kilobytes at most. A body that claims a campaign is believed only
   for a member of it; anyone else's report is kept without a campaign. A table display sends
   one too: the one write a display makes (ADR 0042 §2 otherwise stands — the route is not a
   campaign's and changes nothing a table reads).
5. **Where it is kept.** `ltw_client_errors` (migration 0044), operations data beside the world:
   one row for each distinct report of a campaign (or of none), with a count and its first and
   last time. A row is removed thirty days after it was last seen, and a campaign holds a hundred
   at most (the longest unseen give way). The server's log says that a report came and from what
   kind of sender, not what it held: the table is the one copy, so the thirty days are true. The
   table stays with its server when a campaign moves (ADR 0061 §5): it describes this server's
   client.
6. **Who reads.** The DM reads their campaign's list (`GET /campaigns/:id/client-errors`) at the
   top of the Session sheet, and clears it. While the list holds something the DM has not looked
   at, a line among the table's questions over the stage says so, with "What broke" (the list)
   and "Not now"; what the DM has looked at is remembered in the DM's browser, as a time.
   Reports of no campaign are the operator's, in the database (`deploy/RUNBOOK.md` §9). Nobody
   else reads any: not a player, not a display.
7. **What a person sees when the page breaks.** A plain screen in place of a blank one —
   "Something went wrong", that the game itself is safe, and "Load the game again" (a session's
   screen keeps "Sign out" beside it and adds "If that does not help, tell your DM"). It says
   that a note was sent, and what the note holds, only when one did leave. The table's display,
   which nobody holds, says it will load itself again and does, three times in ten minutes at
   most. The page-wide fallback is drawn without the game's own components or providers, so it
   cannot break the way they did; a session's fallback speaks the campaign's language.
8. **The notice.** The privacy notice says what a report holds, who reads it and for how long.

## Consequences

- The DM's list can be written to by anyone at the table, and — without a campaign — the
  operator's by anyone who can reach the server. Every field is an enumeration or a number but the
  three frames' file names (letters, digits, dot, dash, underscore, ending in a script's
  extension): a forged report can put a made-up file name before the DM, under "For whoever looks
  after the server", and nothing else. The limits bound how many.
- A campaign that plays on another server (ADR 0061 §5) still takes a report here and lets its DM
  read the list, but refuses "Clear the list" as it refuses every write.
- The server's build is the server's, not the page's: a tab left open across a deployment reports
  under the new build. The script's hashed file name in the place tells them apart.
- A minified place is only useful with the build at hand; no source map is served or uploaded.
- An error before the page's script runs at all (a script that failed to load, a browser too old
  to parse it) is never reported: the reporter is that script.
- The count of a row can be driven up by one broken screen in a loop only as far as five a page
  load and the address's limit allow.

## Alternatives considered

- **A hosted error service.** It would send a family's devices' details to a third party and add
  an SDK; refused by the product's rules.
- **The whole message and stack.** More useful to whoever fixes it, and a path for a typed word or
  a character's secret to reach a log; refused.
- **Naming the person.** The DM would know whose phone at once; it would make an error report
  personal data with a place in the person's copy and its deletion. The browser and device are
  enough at a table of five.

## Invariants affected

None. The World Engine neither reads nor writes a report; a report carries nothing of the world,
so no perspective can learn anything through one.

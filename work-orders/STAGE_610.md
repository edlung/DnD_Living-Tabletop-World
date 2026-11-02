# Work Order — Stage 610: The table display

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone A, decisions 2–4 and 17); ADR 0042 (amends ADR 0015 §6, ADR 0036
and ADR 0041).

## Deliver

1. **Pairing a TV by code**: `/display` on any browser shows an eight-symbol code; the DM types it on a
   Table screen sheet; the device holds its own read-only credential for one campaign (four at most);
   the DM lists, renames and unpairs one or every screen; the device can unpair itself.
2. **What the TV shows, as the DM casts it**, in the PARTY perspective: a place's scene (picked, or
   where the party is), the battlefield with the turn order (the DM's zoom and whom to keep in view),
   the table's rolls large with whom the table waits for, a title card, the Chronicle's newest
   chapter, an approved picture, the join QR code with "last time", or nothing. Full screen, no
   WebGL, following the live signal; a TV that restarts comes back to the cast.
3. **The table's join link**: the DM opens it for a few hours on the Players sheet (shown once with
   its QR code); a person scans it or types its code on `/table`, picks a free character and takes the
   seat through the usual join page (a new login, a login, or this browser only); the DM sees the
   seats taken and closes it.
4. **The party's view of a fight** (ADR 0015 §6 amended): the battlefield for the PARTY perspective
   while a party member takes part, without initiative rolls or a reaction window.
5. Russian for every new word; tests at every layer (domain, routes, PostgreSQL, browser).

## Boundaries

No new world authority: a display never writes; the cast is presentation state, not canonical. No
account for the TV. Online sharing of the screen is Stage 630; the DM's control screen is Stage 620.
Migration 0028 is additive; an older build ignores its tables.

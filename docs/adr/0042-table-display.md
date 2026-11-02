# 0042. The table display and the table's join link

- Status: Accepted (owner-delegated product decision 2026-11-02; `docs/FULL_GAME_PLAN.md` decisions 2–4
  and 17, owner approval `reviews/OWNER_FULL_GAME_2026-11-02.json`). Amends ADR 0015 §6, ADR 0036 and
  ADR 0041.
- Context: at a table the DM shows the game on a TV (a laptop on HDMI, a stick or the TV's browser),
  and players join by scanning a QR code with their phones. ADR 0036 seats a person only through a
  single-use invitation for one character; ADR 0041 gave people logins. Mirroring the DM's own
  screen would show the DM's secrets, so the TV needs a view of its own.

## Decision

1. **A display is a device, not a person.** The TV opens `/display`; the server answers a pairing
   request with a short code (eight symbols of an alphabet without look-alikes, valid ten minutes)
   and sets the device's own credential, `ltw_display`: a 256-bit token stored by SHA-256 hash, an
   HttpOnly cookie on `/api`, SameSite=Strict, Secure except on http loopback, for 30 days. The code
   (also stored by hash) names the pending pairing for the DM and opens nothing by itself. The DM
   types it on the Table screen sheet; the pairing binds the device to that one campaign, once, under
   a per-campaign lock, so a campaign never holds more than four displays. A device that never pairs
   is pruned a day after its code expired; a paired one is never deleted, only revoked.
2. **A paired display reads, never writes.** Its actor (`display:<id>`, kind `display`) has the
   campaign role `DISPLAY`: the PUBLIC and PARTY perspectives only; the World Engine's
   authorization refuses its every command, and before any route the request context refuses any
   method but GET and HEAD from it (403). On another campaign it is the same nobody as a non-member
   (ADR 0009 order). It is not a person: `/auth/session` answers it as signed out. A browser that
   also holds a person's session uses the person's (ADR 0036) credential first; the TV page reads
   the PARTY perspective either way.
3. **What the TV shows is the DM's cast**, presentation state outside the world (like the table's
   rolls, ADR 0040), one per campaign with a growing revision: a place's scene (one the DM picks, or
   by default where the party is: the first party character with a place, else the active scene's
   place), the battlefield with the turn order (at a zoom the DM picks, keeping in view whom the DM
   picks or else whoever acts, with the fight's place's approved portraits, figures and battle map
   when the party knows the place), the table's rolls large
   with the checks the table waits for, a title card the DM writes, the Chronicle's newest chapter,
   an approved picture of something the party knows, the QR code to join with "last time", or
   nothing. Everything is read through the PARTY perspective, so a place, a picture or a chapter the
   party does not know shows nothing; the cast itself names a place, a picture or a combatant to
   anyone but the DM only when the party knows it (otherwise a scene without a place, a dark
   screen, or whoever acts), so not even its ID leaves the server. A place without an approved picture shows the mist and says so,
   as the world screen does; the UI kit's key art appears only behind title cards. The cast follows
   the live signal; a display that restarts reads it again. The page has no world controls and no
   WebGL; the board is a picture there (inert: nothing on it is pressed); a quiet corner (the screen's name, full screen, unpair after a question) shows while the
   pointer moves or a key is pressed and fades after four seconds; focus inside keeps it.
   _Amendment to ADR 0015 §6:_ the PARTY perspective sees an encounter while one of its members
   takes part: what such a member sees (battlefield, turn order, squares, sides, conditions, up,
   down or dead; names the party knows; hit points of party characters), without initiative rolls
   and without anything of one character's own (no reaction window). The public, NPCs and a
   character not in the fight still see none.
4. **The DM manages displays**: list (name, when paired, last seen, coarse to a minute), rename,
   unpair one, or unpair all at once; the device can unpair itself too (its cookie is cleared).
   Unpairing revokes the credential; the device's next read or its live stream answers 401 and the
   TV shows a new code.
5. **The table's join link** (`/table#<token>`, with an eight-symbol code to type on `/table`
   instead) lets a person take a free seat: the characters nobody plays are offered, one is chosen,
   and the server mints an ordinary single-use invitation for that seat (one hour, created by
   `table:<linkId>`); the person continues on ADR 0036's join page — a new login, a login, or this
   browser only (ADR 0041) — and is seated by its redeem, its checks and its transaction. Two people
   who pick the same seat at once both get an invitation; the first redeem wins and the second
   fails like any spent seat, and the offer lists the free seats again. The DM opens the link on the
   Players sheet for 2, 4 (default), 8 or 24 hours, sees it once with its QR code, sees which seats
   were offered and taken, and closes it; a new link closes the old one. While it is open the TV's
   join cast shows its QR code and code: the plaintext lives only in the server's memory for that
   (a restart forgets it, and the DM opens a new link); the store keeps hashes. Anyone in the room
   who sees the QR code can join — that is the point at a table — so it is never shown on a shared
   screen online, and it expires.
6. **Limits** (per process, like ADR 0036's): pairing requests 10 a minute per client group; the
   DM's typed codes 10 a minute per campaign and DM; a client group that gave five wrong table keys
   in a minute is refused until the minute has passed; seat invitations 10 a minute per client
   group; every failure the same answer.

## Consequences

- Migration 0028: `ltw_displays` (one-way trigger: identity, pairing and revocation never change
  back; only a never-paired row may be deleted), `ltw_display_casts`, `ltw_table_links`,
  `ltw_table_link_seats` (each seat's invitation, unique). The hourly sign-in pruning also prunes
  never-paired displays (`startCredentialPruning`).
- Domain: actor kind `display`, role `DISPLAY` (PUBLIC and PARTY only), `authorize` and
  `authorizeActingFor` refuse it. Combat: `encounterView` gives the PARTY perspective the party's
  view of a fight its members take part in (`packages/combat/src/view.test.ts`).
- Server: `src/display/` (store, PostgreSQL store, authenticator, routes, table links, limits);
  the live inventory follows the cast, the rolls, the checks asked and the join link for a display;
  the PARTY perspective sees the open checks asked of party members.
- Client: the `/display` page (`src/display/`), the DM's Table screen sheet
  (`src/dm/screen-sheet.tsx`), the Players sheet's table link (`src/dm/table-link.tsx`), the
  `/table` page (`src/session/table-join.tsx`); Russian in `i18n/ru-display.ts`. The board takes a
  larger square on the TV (`BoardView.maxCell`), keeps a square in view (`centreOn`), and fades a
  side edge where it hides more when it scrolls (on phones too).
- Production: the proxy already serves the client on `/display` and `/table`; full screen is not
  restricted by the Permissions-Policy. No new secret or setting.
- Tests: `display-routes.test.ts` (pairing, refusals, unpairing, the cast and what it names, the
  join link), `display-store.integration.test.ts` (PostgreSQL: the limit under two DMs at once, the
  one-way trigger, pruning, casts, seats), the domain's display tests, and the browser journey
  `tests/e2e/table-display.spec.ts` (pairing, casts, a secret place, two seats through the link and
  its code, the PARTY boundary markers on everything the TV received, no write, unpairing).

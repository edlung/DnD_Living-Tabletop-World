# Stage 610 completion — the table display

Work order `work-orders/STAGE_610.md`; program `docs/FULL_GAME_PLAN.md` (Milestone A), owner approval
`reviews/OWNER_FULL_GAME_2026-11-02.json`; ADR 0042 (amends ADR 0015 §6, ADR 0036 and ADR 0041);
2026-11-02.

## What changed

- **A TV pairs by code.** `/display` on any browser shows an eight-symbol code (no look-alikes, ten
  minutes); the DM types it on a new Table screen sheet (dock: "Table screen"). The device gets its
  own credential, `ltw_display` (hashed, HttpOnly, 30 days), bound to one campaign, four at most;
  the DM lists, renames and unpairs one screen or all; the screen can unpair itself (asked first).
  A screen that never pairs is pruned a day after its code expired (hourly, beside the sign-in
  records); a paired one is only ever revoked (migration 0028's one-way trigger).
- **A screen only reads.** Its actor is of kind `display`, role `DISPLAY`: the PUBLIC and PARTY
  perspectives only. The request context refuses any method but GET and HEAD from it before any
  route; the World Engine's authorization refuses its commands too; `/auth/session` treats it as
  signed out; another campaign is the usual 404.
- **What the TV shows is the DM's cast**, in the PARTY perspective: a place's scene (picked, or
  where the party is), the battlefield (zoom, and whom to keep in view — else whoever acts — with
  the fight's place's approved portraits, figures and battle map), the table's rolls with whom the
  table waits for, a title card, the Chronicle's newest chapter, an approved picture, the join QR
  code with "last time", or nothing. Big type for a room, no WebGL, the board shown as a picture
  (inert), full screen and unpairing in a corner that fades after four idle seconds. A TV that
  restarts reads the cast again; one that is unpaired shows a new code.
- **The cast names nothing the party does not know.** Found while testing: the cast answered every
  reader with the DM's place ID (a PARTY forbidden marker of the knowledge boundary). Now a place, a
  picture or a combatant is named below the DM only when the party knows it (`castForParty`).
- **The party's view of a fight** (ADR 0015 §6 amended). Found by the browser journey: the
  battlefield cast could never show anything, as the PARTY perspective saw no encounter. The party
  now sees a fight one of its members takes part in — what such a member sees with the party's
  knowledge, no initiative rolls, no reaction window.
- **The table's join link**: the DM opens it on the Players sheet for 2, 4, 8 or 24 hours (shown
  once with its QR code); a person scans it, or types its code on `/table`, chooses one of the free
  characters and continues on the usual join page (a new login, a login, or this browser only); the
  DM sees each seat offered and taken and closes the link. Under the hood the link mints an ordinary
  single-use invitation for the chosen seat; its plaintext lives only in the server's memory, for
  the TV's QR code.
- **The board elsewhere.** A scrolling board (a phone's zoom) fades the side edge where it hides
  more; it can keep a square in view (`centreOn`) and take larger squares (`maxCell`).
- **Russian** for every new word (`i18n/ru-display.ts`); a screen's default name follows the
  campaign's language ("Экран 1").

## Verification

- Unit 3546 passed (new: the display's perspective and authorization in the domain; pairing, the
  refusals, the limit of four, unpairing, the cast and what it names below the DM, the battlefield's
  focus, the join link and its seat, the five-wrong-keys rest over HTTP; the party's view of a fight
  in `packages/combat/src/view.test.ts`).
- Integration 363 passed, including `display-store.integration.test.ts` on PostgreSQL: a code pairs
  once and only while live, two DMs typing at once cannot pass the limit, identity, pairing and
  revocation change one way, only a never-paired display is pruned, casts, table links and their
  seats through real invitations.
- Browser: `table-display.spec.ts` — the TV pairs (a wrong code first), shows the party's place, a
  title card, a place the party does not know as nothing, the QR code to join; one person takes a
  seat from the link, another by typing the TV's code; the DM sees both seats taken; nothing the TV
  received carries a PARTY forbidden marker; a write from the TV is 403; unpairing brings a new code.
  axe on the pairing screen, the Table screen sheet, a title card, the QR code and the free seats.
- Layout audit (temporary journey, not kept) of the TV at 1920, 1440, 768, 390 and 320 px in every
  cast, the Table screen sheet, the Players sheet with the link, `/table` with its code and its
  seats, and the Russian TV, sheet and join card. Fixed from it: the radio "A title card" had no
  name (its id collided with the section heading's — axe passed; the audit skill now checks label
  and ARIA references); the TV's corner at opacity 0.35 failed contrast (it is solid now and fades
  when idle); a place without an approved picture showed the brand's key art as if it were the
  place (now the mist and "No approved image yet"); the battlefield on the TV sat small in a corner
  under the turn order (the world screen's battle layout is unscoped; the TV's own grid now places
  them); the cast's options were a long list (a compact grid); the join card did not say which page
  takes the code. Remaining: none.
- Lint, typecheck, Prettier and the context budget clean.

## Adversarial notes

- A display cannot write anything: refused by method before any route, by role in the World Engine,
  and its cookie authenticates nothing but reads of its own campaign; a person's session keeps
  precedence in a browser that holds both, and the TV page reads the PARTY perspective either way.
- The pairing code opens nothing; only a DM of the campaign can use it, ten a minute; the limit of
  four holds under concurrent pairing (advisory lock, tested on PostgreSQL).
- The table link seats only through ADR 0036's redeem: two people choosing one seat both get an
  invitation, the first redeem wins, the second fails as a spent seat and the offer lists what is
  free. Five wrong keys rest a client group for a minute.
- What the TV received in the journey was scanned for every PARTY forbidden marker of the
  knowledge boundary; the cast route has its own test for a secret place, picture and combatant.
- Not done here (Stage 620 and 630): the DM's control screen around the cast, a handout as its own
  kind, sharing the screen online.

# Work order: the campaign library in the hub (2026-11-19)

Owner request, 2026-11-19, in the session: the owner, signed in on ltw.vardahei.tech with a login,
saw only the ready adventures (Ravenford, Hollowmere) and asked why; the fifteen library campaigns
were reachable only through the workshop, which needs an operator's invitation. Owner: «Да, сделай»
— show the library in the hub.

## Scope

- Server: list the library and its covers to a signed-in account; start a library campaign for it
  through the workshop's existing activation, with the account seated as DM (ADR 0058, notes of
  2026-11-19). No migration; no change to the workshop's own routes, drafts, generation or grants.
- Client: a "Campaigns from the library" section in the hub (cover, genre, age, pitch, number of
  players, Start), with Russian words.
- Tests: unit (client retries, IDs), PostgreSQL integration (start, seat, replay, every variant of
  every campaign begins), browser journey (`tests/e2e/hub-library.spec.ts`), the layout audit at
  1440/768/390/320.

## Out of scope

Merging and deploying stay the owner's. The workshop invitation flow is unchanged.

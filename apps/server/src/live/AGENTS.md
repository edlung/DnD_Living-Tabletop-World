# Live session (`src/live/`)

Stage 310 part A: the change signal, presence and their composition (ADR 0033; contract
`docs/STAGE_310_DESIGN.md` §A). A security boundary for Gate 06: a signal must never reveal a
change the perspective cannot read.

| File                         | Role                                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `live-app.ts`                | `buildLiveApp`: the application plus a silent twin built from the same dependencies (lazily, on the first subscription), the registry, the hub, `GET …/live`, and `preClose`/`onClose` hooks. Both compositions use it (`main.ts`, `testing/ravenford-app.ts`). |
| `live-routes.ts`             | `GET /campaigns/:campaignId/live`: the ADR 0009 check order through `withPerspective`, then a hijacked event stream.                                                                                                                                            |
| `hub.ts`                     | Subscriptions and the one comparison loop: baseline before `ready`, cycles never overlap, signals written at the end of a cycle, caps, slow consumers, heartbeats, shutdown.                                                                                    |
| `inventory.ts`               | The coverage inventory: which views a subscription's fingerprint covers.                                                                                                                                                                                        |
| `fingerprint.ts`             | Injects the inventory's GETs with the subscriber's credential into the twin and hashes the bodies; 401/403/404 and failures close, never signal.                                                                                                                |
| `presence.ts`, `registry.ts` | `GET …/presence` (registered by `buildApp` for both instances) and the per-process caps and presence with its grace.                                                                                                                                            |

- Nothing here decides visibility: every view is answered by the existing routes and projections.
  Never hash raw state, history, event metadata or anything a route does not return.
- Add a view to the inventory only if the client reads it for that perspective; a view the
  route refuses for a perspective (403) must not be in its inventory, or the stream closes.
- The DM's identity view lists hidden characters: it is not covered while the DM holds a lower
  perspective (`LiveTarget.identity`).
- An acting character also covers `undone-actions` (the requester's own actions the DM undid,
  ADR 0033 amendment of 2026-10-28, `http/routes/undone-routes.ts`): built from the requester's
  own commands only, so it signals nothing the player may not read.
- The DM perspective also covers `dm/history?perspective=DM` (Stage 310 part C, `src/dm/`) and
  the asset lineage `assets` (Stage 330 part B: the DM's image controls follow the asset worker;
  the route takes no perspective and answers the campaign's DM only); no lower perspective covers
  either, the DM's own included.
- An acting character, the DM and a paired display also cover `marks` (the table's shared marks,
  ADR 0057 §5, `src/marks/`): the route answers every member and the display, and a mark is the
  table's, so it signals nothing a perspective may not read. A ping's end changes the view, so the
  screens drop it on the server's clock as well as their own.
- An acting character and the DM also cover `crafting` (ADR 0057 §9, `src/items/crafting-routes.ts`):
  the DM's every project; a character's own, what it can make, and the party here it knows that
  could help, so a hidden character never shows there.
- With a focus, an acting character and the DM also cover `merchants/<focus>` (a merchant's shop,
  ADR 0057 §8, `src/items/merchant-routes.ts`): its wares, prices and the character's purse change
  in no other view. The route answers the DM and a character at the merchant's place that knows
  it; anything else, a non-merchant included, is a 404 fingerprinted as its status.
- Messages are the fixed `ready`/`changed`/`closed` frames and a comment heartbeat
  (`stream.ts`); never put world content, a credential, an event position or a version in them.
- Tests: `live-isolation.test.ts` (every non-DM perspective and the hidden sentinel stay silent on
  DM-only commits), `asset-live.test.ts` (an image job signals the DM at each step and a player
  only when a picture it sees is approved, with no hash in its stream), `live-stream.test.ts` (check order, recheck, disconnect, shutdown, caps),
  `live-socket.test.ts` (a real local connection: unbuffered frames, a client that leaves),
  `hub.test.ts` (loop and bounds with fakes), `fingerprint.test.ts` (answers to verdicts),
  `presence.test.ts`, `inventory.test.ts`. Support:
  `testing/live.ts` (manual timers, a flippable authenticator, a stream reader).

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
- Messages are the fixed `ready`/`changed`/`closed` frames and a comment heartbeat
  (`stream.ts`); never put world content, a credential, an event position or a version in them.
- Tests: `live-isolation.test.ts` (every non-DM perspective and the hidden sentinel stay silent on
  DM-only commits), `live-stream.test.ts` (check order, recheck, disconnect, shutdown, caps),
  `live-socket.test.ts` (a real local connection: unbuffered frames, a client that leaves),
  `hub.test.ts` (loop and bounds with fakes), `fingerprint.test.ts` (answers to verdicts),
  `presence.test.ts`, `inventory.test.ts`. Support:
  `testing/live.ts` (manual timers, a flippable authenticator, a stream reader).

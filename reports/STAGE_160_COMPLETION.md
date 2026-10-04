# Stage 160 Completion Report — World Visual State

- Work order: `work-orders/OPUS_STAGE_160.md`
- Builder: Claude Opus 5.5 (matrix: HIGH)
- Implementation revision: `492ca1614964aaa00df4200d5bdd4fcd9eb08f4c` (branch `main`)
- Formal gate: none at this stage. Gate 05, after Stage 180, reviews this surface (`docs/GATE_COVERAGE.md`, row 150–160).
- Status: **COMPLETE**. Stage 170 is not started and needs explicit authorization.

## Decisions

| ADR                                            | Content                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [0023](../docs/adr/0023-world-visual-state.md) | Owner decisions of 2026-10-04: (1) Ravenford Day 1 → Day 2 shows weather and the day phase; (2) weather is a DM-set world fact, in history, undoable, and inherited; (3) a view of time T uses the facts at T and the current approved images, with variants only if their condition held at T; (4) players see what they know now plus what they perceived at T, with details only for what they perceived. |
| Amendments                                     | [0006](../docs/adr/0006-temporal-model-and-undo.md) (weather is a world fact; visual state on the world timeline), [0007](../docs/adr/0007-world-kernel-model-and-event-store.md) (`SetWeather`, `WeatherSet`, fact key, restore), [0022](../docs/adr/0022-asset-identity.md) (image choice by tags; content `at`)                                                                                           |

## Delivered

- **Weather** (`packages/domain/src/weather/weather.ts`):
  - `SetWeather` (DM or system) records `WeatherSet { locationId, from, to }` from the current world time; child locations inherit it.
  - It refuses things that are not usable locations, and no change (`INVALID_WEATHER`).
  - Footprint: reads the clock and the location; writes `weather:<id>`. Undo restores the value before.
  - Integrity requires that every weather key is a location.
- **Timeline** (`visual/timeline.ts`): `visualTimelineAt(history, T)` reads effective events only. It gives:
  - existence, placement, and status (`worldViewAt`);
  - inherited weather at T;
  - the day phase;
  - vitals from sheets, stat blocks, damage, healing, and conditions.
- **Presentation** (`visual/presentation.ts`, `views.ts`):
  - Visible means known now or perceived at T. Status, vitals, conditions, equipment, and weather appear only for what was perceived at T; scenes list only perceived occupants. Interiors keep the weather off what is inside them.
  - The image is the best fitting current approved variant (every label part among the tags), else the reference.
- **Server:**
  - `GET …/entities/:entityId/presentation?perspective=&at=` and `GET …/locations/:locationId/scene?perspective=&at=`. A time after the clock is 400; anything unseen is a 404, the same as nothing.
  - The content route takes `at`.
  - The request context now carries the history.
- **Fixture:** `fixtures/ravenford/day-two.json` (clear Day 1 at 10:00, then the clock to Day 2 at 10:00, then rain). Not seeded.

## Validation gate evidence — "Ravenford Day 1 vs Day 2 resolves deterministically from state"

| Item                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Day 1 vs Day 2          | `ravenford-day-two.test.ts`:<br>• the Market Square is clear on Day 1 (phase day), clear at Day 1 22:00 (night), and raining on Day 2;<br>• Mira stands in the rain;<br>• there is no weather before it was set;<br>• the default time is now.<br>`visual-routes.test.ts` shows the same over HTTP, for the DM and for Elowen.                                                                                                                                     |
| Determinism and history | The same views come back after Day 60 (snow, Mira moved), from stored JSON replay, and with integrity, the oracle, and replay checks. `visual.property.test.ts`: 6 seeds × 25 random steps of weather, walks, and time; every past view taken as the clock left it is identical at the end and from stored JSON (ADVERSARIAL_TESTS.md K.3).                                                                                                                        |
| Images by state         | `rain` on Day 2; `night-rain` only when both hold; the reference otherwise. A `greatsword` variant never gives Orin equipment (K.2).                                                                                                                                                                                                                                                                                                                               |
| Perspective             | `presentation.test.ts` and `visual-routes.test.ts`:<br>• the Gate 04 hooded watcher is visible only while Elowen stood beside it, with no `neverSaid` marker; its bytes are served for that time and are a 404 now;<br>• Orin's death while Elowen was away shows the DM a `dead` variant and shows her only his portrait;<br>• known people are not placed in scenes seen only from around;<br>• the secret faction and entities that did not exist yet are null. |
| Vitals                  | `packages/combat/src/visual-state.test.ts`: a wounded raider and a dead one after the ambush, healthy before it; an undone hit never shows. `timeline.test.ts`: sheet hit points and conditions by time.                                                                                                                                                                                                                                                           |
| Weather                 | `weather.test.ts`: permissions, validation, and undo newest first; a weathered location cannot be undone beneath its weather.                                                                                                                                                                                                                                                                                                                                      |

**Mutation checks:** 14 of 14 injected defects detected, one at a time. The scene-occupant check survived its first run and is detected after the added test.

- later weather shown in the past;
- no inheritance;
- rain indoors;
- undone events counted;
- a phase boundary shifted;
- known treated as observed;
- known occupants listed;
- perception using today's placement;
- DM-only images for players;
- a partial variant match;
- an unchanged weather accepted;
- weather undo forgetting the value before;
- content ignoring the time;
- players allowed to set weather.

## Validation

`pnpm validate:ci-local` exited 0 on `492ca16` (`NODE_ENV=test`, docker-compose PostgreSQL). It ran:

- frozen install, format, lint, typecheck;
- context budget: 426 files, none over the limits;
- unit tests: 133 files, 1366 tests passed;
- clean build;
- migrate twice;
- seed twice;
- integration tests: 16 files, 65 tests passed.

## Residual risks and notes

- **No seasons:** there is no calendar. Day phases use fixed hours.
- **Each view replays the full history.** There is no cache yet.
- **Weather is never retroactive.** A forgotten change can only be set now, or the later history undone.
- **No new PostgreSQL-specific path:** weather uses the existing event store. The integration suite passed unchanged.
- **The UI is not built yet** (Stages 200–230).

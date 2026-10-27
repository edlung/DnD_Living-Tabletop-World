# World visual state (`src/visual/`, `src/weather/`)

How entities and places looked at a world time, for a perspective. Authority: `docs/adr/0023-world-visual-state.md` (owner-approved Day 2 change, weather, history, and visibility), with ADR 0022 for images and ADR 0006 §2–3 for the world timeline. Gate 05 reviews this surface (`docs/GATE_COVERAGE.md`, Stages 150–160).

| Concern                                                                                                                 | File                    |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `SetWeather`: payload, decision, fold, undo restore (a world fact)                                                      | `../weather/weather.ts` |
| The world at T: existence, placement, status, weather, day phase, vitals                                                | `timeline.ts`           |
| Who sees what at T; tags; image choice; figure and battle map; scenes; what a player may be given (`presentableAssets`) | `presentation.ts`       |
| Entry points: entity, scene, a player's asset list, and image content at a time                                         | `views.ts`              |
| Timelines and a perspective's servable pictures, remembered per history version (bounded)                               | `memo.ts`               |
| Test support: asset world, Day 2 script, perspectives, snapshots                                                        | `testing/world.ts`      |

Rules:

- Presentation is derived, never stored, and writes nothing. Images never add tags, equipment, or any fact (invariant 14; ADVERSARIAL_TESTS.md K.2).
- The image is chosen among `image` assets only. `figure` (a character, NPC, or creature) and `battleMap` (a location) are the approved asset of that purpose, under the same visibility as images, and null for any other kind (`docs/adr/0035-images.md` §4; `figures.test.ts`). An approval supersedes its kind (ADR 0035 amendment), so each kind has one approved picture; of an earlier writer's several, the higher version of an image and the figure or battle map made last are shown — keep these tie-breaks, which read earlier histories as their writers showed them.
- A perspective other than the DM is listed and served only what presentation could choose for it (Gate 06, ADR 0023 amendment): `presentableAssets` applies the same tags and label rule as `imageFor` (one predicate, `fits`). Never give a player an asset route a second, looser rule; `purposes.property.test.ts` checks list, content and presentation agree after every step, `apps/server/src/http/image-exposure.test.ts` over HTTP. The DM's pool (`../assets/views.ts` `dmEntityAssets`, `dmAssetContent`) takes no perspective and is not exported from the package.
- Views are remembered per frozen history array (`memo.ts`: a `WeakMap`, at most `MEMO_LIMIT` entries per version, least recently used dropped; an unfrozen history is never remembered). Anything remembered must depend only on the history, its state, the perspective and the time (`memo.test.ts`).
- Read only effective events (`effectiveEvents`), by their world time. A new in-world fact that changes how something looks needs its own timeline entry here, by world time.
- Visible at T = known now ∪ perceived at T; details (status, vitals, conditions, equipment, weather) only for what was perceived at T. A scene lists only occupants perceived there. Everything else is `null`, the same as nothing.
- Day phases and the indoor rule are fixed in ADR 0023 §2; changing them changes every past view, so it needs an ADR amendment.
- Tests: `ravenford-day-two.test.ts` (the validation gate), `presentation.test.ts` (isolation), `timeline.test.ts`, `visual.property.test.ts` (the past stays as it was, also from stored JSON), `../weather/weather.test.ts`; combat-derived vitals in `packages/combat/src/visual-state.test.ts`.

# World visual state (`src/visual/`, `src/weather/`)

How entities and places looked at a world time, for a perspective. Authority: `docs/adr/0023-world-visual-state.md` (owner-approved Day 2 change, weather, history, and visibility), with ADR 0022 for images and ADR 0006 §2–3 for the world timeline. Gate 05 reviews this surface (`docs/GATE_COVERAGE.md`, Stages 150–160).

| Concern                                                                  | File                    |
| ------------------------------------------------------------------------ | ----------------------- |
| `SetWeather`: payload, decision, fold, undo restore (a world fact)       | `../weather/weather.ts` |
| The world at T: existence, placement, status, weather, day phase, vitals | `timeline.ts`           |
| Who sees what at T; tags; image choice; entity and scene presentation    | `presentation.ts`       |
| Entry points: entity, scene, and image content at a time                 | `views.ts`              |
| Test support: asset world, Day 2 script, perspectives, snapshots         | `testing/world.ts`      |

Rules:

- Presentation is derived, never stored, and writes nothing. Images never add tags, equipment, or any fact (invariant 14; ADVERSARIAL_TESTS.md K.2).
- Read only effective events (`effectiveEvents`), by their world time. A new in-world fact that changes how something looks needs its own timeline entry here, by world time.
- Visible at T = known now ∪ perceived at T; details (status, vitals, conditions, equipment, weather) only for what was perceived at T. A scene lists only occupants perceived there. Everything else is `null`, the same as nothing.
- Day phases and the indoor rule are fixed in ADR 0023 §2; changing them changes every past view, so it needs an ADR amendment.
- Tests: `ravenford-day-two.test.ts` (the validation gate), `presentation.test.ts` (isolation), `timeline.test.ts`, `visual.property.test.ts` (the past stays as it was, also from stored JSON), `../weather/weather.test.ts`; combat-derived vitals in `packages/combat/src/visual-state.test.ts`.

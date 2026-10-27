# 0023. World visual state: weather, day phases, and how things looked

- Status: Accepted
- Date: 2026-10-04
- Stage: 160; reviewed at Astra Gate 05 with the integrated backend
- Decision type: product (owner-approved Day 2 change, weather, history, and visibility) and technical
- Owner approval: on 2026-10-04, before implementation, the owner chose:
  1. Ravenford's Day 1 → Day 2 change is the weather and the time of day: clear on Day 1, rain on Day 2, with the day phase from the world clock (§1, §2);
  2. weather is a world fact the DM sets by command, recorded in history, undoable, and inherited by child locations. This amends ADR 0006 §2, which called weather presentation (§1);
  3. a view of a past time T uses the facts at T and the entity's current approved images; a variant applies only if its condition held at T (§2, §4);
  4. a player's view of T shows what the character knows now plus what it perceived at T, with safe fields only (§3).

## Context

`EXECUTION_PLAN.md` (Stage 160): resolve presentation from canonical identity, time, weather or season, events and damage, equipment and conditions, and perspective, and demonstrate Ravenford Day 1 vs Day 2. Validation gate: Ravenford Day 1 vs Day 2 resolves deterministically from state.

Other inputs:

- `RAVENFORD_SPEC.md` (Return / Time): demonstrate a world or presentation change such as the weather.
- `ADVERSARIAL_TESTS.md` K:
  - K.2: an image cannot give Orin equipment;
  - K.3: Day 1 after Day 60 is reconstructed from the correct state and time.
- Invariant 14: visual state is not world state. Weather is world state; how things look is derived from it.

## Options considered

1. **Weather as presentation, outside history**, as ADR 0006 §2 had it. The owner declined: Day 2's rain would not be reconstructable.
2. **A deterministic weather calendar.** The owner declined: the DM could not decide the weather.
3. **Weather as a DM-set world fact; presentation as a pure function of history, time, perspective, and images.** Chosen.

## Decision

### 1. Weather (owner decisions 1–2)

- **`SetWeather { locationId, weather }`** (DM or system) records `WeatherSet { locationId, from, to }` at the current world time. The weathers are `clear`, `overcast`, `rain`, `storm`, `fog`, and `snow`.
- **Who can be given weather.** The location must exist, be a location, and not be destroyed. Setting the weather a location already has is refused (`INVALID_WEATHER`).
- **Inheritance.** A location's weather is its own, or else its nearest ancestor's; none is set by default. Ravenford's rain falls on the square and the North Gate, and not on the Old Trade Road outside it.
- **Footprint.** The event reads the clock and the location (existence and status), and writes `weather:<locationId>`. Undo restores the weather before. A later change of the same location blocks the undo, as any later writer does. A location cannot be undone beneath its weather.
- **Undo is the only way back.** Weather is never retroactive: a change applies from the world time it was set (ADR 0006 §3).
- **The Ravenford Day 2 script** (`fixtures/ravenford/day-two.json`) sets clear skies over Ravenford on Day 1 at 10:00, advances to Day 2 at 10:00, and sets rain.

### 2. The world at a time T

`visualTimelineAt(history, T)` reads the effective history only, as `worldViewAt` does (ADR 0006 §2–3): undone commands and their compensations never show. It gives:

- what existed at T, where it was, and its status (`worldViewAt`);
- each location's weather at T: the last effective `WeatherSet` at or before T, then inherited;
- the **day phase** of T: night until 05:00, dawn until 07:00, day until 18:00, dusk until 20:00, then night;
- **vitals** at T, per creature: its sheet or stat block (`CharacterSheetSet`, `StatBlockSet`), then damage, healing, and conditions (`DamageApplied`, `HealingApplied`, `ConditionApplied`), each by world time. Equipment is the sheet's weapons or the stat block's attacks.
  - **Wounded** is at most half of maximum hit points but above 0.
  - **Unconscious** is 0 hit points or the condition.

There is no calendar, so there are no seasons; a season would need its own decision. Interiors (`building`, `room`) keep the weather off what is inside them; the building itself shows its weather.

### 3. Who sees what (owner decision 4)

- **Visible at T:** what the perspective knows now (ADR 0008), plus what it perceived at T.
  - Perception at T applies the Context Engine's rule (ADR 0012) to placements at T: the place where the holder stood, its parent and children, and what stood there.
  - The party counts every member; a public view counts nothing perceived.
  - Something that did not exist at T is never visible at T, to anyone.
- **Observed at T:** perceived then. Status, vitals, conditions, equipment, and weather are shown only for observed things; knowing someone says nothing about how or where they were.
- **A scene** of a place lists only the occupants the perspective perceived there at T. A place seen from inside or around it can therefore show no one, even when the perspective knows who stood there.
- **Errors.** Anything else is a 404, identical to an entity that does not exist. A time after the world clock is a 400.
- **The DM** sees everything that existed at T.

### 4. Images (owner decision 3)

- **Tags.** A presentation carries tags:
  1. the day phase;
  2. then, if observed: the weather, a status other than active, `wounded` or `unconscious`, and conditions.
- **Choosing the image.** It is chosen from the entity's **current** approved images (ADR 0022) that the perspective may see. A derived variant applies when every dash-separated part of its label is among the tags; for example, `night-rain` needs both. The variant with the most parts wins, then the higher version, then the label in order. Otherwise the image is the canonical reference, or none.
- **Images never change state.** An image never adds a tag or equipment (K.2): a `greatsword` variant of Orin is never chosen, and Orin carries nothing he was not given.
- **Content for a past view.** `GET …/assets/content/:hash?perspective=…&at=T` serves the bytes of what the perspective could see at T. Without `at`, it serves what it may see now, as before.

### 5. Routes

- `GET /campaigns/:campaignId/entities/:entityId/presentation?perspective=…&at=…` returns an `EntityPresentationResponse`.
- `GET /campaigns/:campaignId/locations/:locationId/scene?perspective=…&at=…` returns a `ScenePresentationResponse`.
- `at` is optional (default: now), and is a world time in seconds.

## Consequences

- **The Chronicle and flashbacks (Stage 170)** can show a scene as it looked at a remembered world time.
- **Gate 05** reviews this surface (`docs/GATE_COVERAGE.md`, row 150–160).
- **Cost.** Each view replays the campaign's history; caching is a later concern.

## Amendments

- 2026-10-27 (Gate 06 remediation, G06-images-01): **the image rule bounds the asset routes too** (§3–§4; ADR 0022 amendment). A perspective other than the DM is listed and served (`…/assets`, `…/assets/content/:hash`, with or without `at`) only what presentation could choose for it then: the canonical reference, derived images whose label parts are all among the tags it sees, the figure and the battle map, by the same code (`presentableAssets`). A state picture of an entity not observed in that state is a 404 like nothing. Without `at`, content is what presentation could choose now (no longer "what it may see now"); the client passes `at` for a picture it was given for a past time. Every picture an entity or scene presentation returns at T is served at T.
- 2026-10-27 (Gate 06 review of the remediation): **the live screens fetch for their presentation's time too**, and views are remembered. The client records each presentation, scene or flashback response's `worldTime` for its pictures and fetches their bytes with it as `at`, so a picture chosen just before the world moved on is not a 404 (bytes already held are shown for any time). The server remembers each timeline and each perspective's servable pictures per history version, perspective and time (bounded, `packages/domain/src/visual/memo.ts`), so a scene's pictures cost one replay. The DM's broad asset pool takes no perspective and is not exported.

## Invariants affected

Implements:

- 12 (world history is reconstructable) for weather and visual state;
- 14 (visual state is not world state: presentation is derived and writes nothing).

Preserves:

- 5 (scoped visibility);
- 13 (stable identity);
- 3 (only the DM sets the weather).

ADR 0006 §2 is amended: weather is now a world fact. No invariant is weakened.

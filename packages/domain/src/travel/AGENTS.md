# The world map and travel (`src/travel/`)

A region's pins and the routes between places (docs/adr/0057-encounters-maps-loot.md §10). The
journey itself is decided by the combat engine (`packages/combat/src/travel.ts`), which rolls
extended travel's saves; this folder holds the facts it reads and the record it leaves.

| Concern                                                           | File          |
| ----------------------------------------------------------------- | ------------- |
| Pins and routes: records, events, fold, restores, footprints      | `map.ts`      |
| `SetMapPins`, `SetRoute`                                          | `map.ts`      |
| The map as a perspective sees it: known places, routes, the party | `map-view.ts` |

Rules:

- A route is keyed by its pair (`routeKey` in `@ltw/contracts`): one route whichever way it is named.
- `PartyTravelled` changes no fact: the clock, the places and Exhaustion are their own events beside
  it, so undo puts each back as any change; it is the DM's history's record of the journey.
- A perspective sees a pin or a route only for places it knows (`knownEntityIds`), never a hidden
  place's name or road.

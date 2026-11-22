# Campaign library tools

Scope: `work-orders/CAMPAIGN_EDITORIAL_2026-11-22.md` and the original library release; product notes in
`docs/adr/0058-campaign-content.md` (2026-11-14).

- `catalog.ts` keeps the original shelf order and adds the other authored books through `other-books.ts`. It builds each
  one's packages and picture bindings from `campaigns/`, through the series registry
  (`scripts/campaign-shared/series.ts`) or the three family books’ variants.
- `build.ts` writes `fixtures/campaign-library/` (`library.json`, `packages/`); the server reads the
  pictures from the campaigns' own `assets/` and checks their SHA-256. Rebuild after any change to a
  library campaign; `library.test.ts` fails when the fixture is stale.
- `book/` builds each campaign's DM book (ADR 0074 §2) from its `source/`: `book.ts` assembles it,
  `check-line.ts` reads a check line as fields, `people.ts` finds the cast named in a page,
  `voice.ts` says whom a text speaks to, `encounters.ts` ties a fight to a chapter. `build.ts`
  writes it as `book.json` beside the packages. A first-layer page is the source's scene word for
  word: add fields read from the text, never text.
- `battle-maps.ts` cuts the GPT battle maps of an art workspace (each drawn over its fight's grid)
  into each campaign's `assets/battle-maps/` with a manifest. Originals stay outside the repository.
- `world-maps.ts` turns the GPT world maps of an art workspace (`maps.json`, `out/<id>.png`,
  `prompt-<id>.txt`) into each campaign's `assets/world-map/` with a manifest. The pins and routes
  are authored in the campaign's `source/world-map.json`; `../campaign-shared/world-map.ts` adds
  the map place, its pins and routes to every library variant (ADR 0058 notes of 2026-11-17).
- `library.test.ts` activates every library campaign in memory and checks its pictures, figures,
  battle maps and world map (pins and routes) arrive once, and that an edited package gets none.

- `table-pictures.ts` binds the individual portraits, props, location paintings and transparent figures to entities in each edition. `prepare-table-art.mjs` processes the original art sheets and records the source hashes.
- The library build also writes each playable edition under the book's `assets/table-editions/`.
  The interface build adds a portable GM gallery there. All its links stay inside the book.

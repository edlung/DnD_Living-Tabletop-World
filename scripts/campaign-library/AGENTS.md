# Campaign library tools

Scope: `work-orders/CAMPAIGN_LIBRARY_RELEASE_2026-11-14.md`; product notes in
`docs/adr/0058-campaign-content.md` (2026-11-14).

- `catalog.ts` lists the library (only campaigns reworked to the owner's standard) and builds each
  one's packages and picture bindings from `campaigns/`, through the series registry
  (`scripts/campaign-shared/series.ts`) or Moon Pearl's own variants.
- `build.ts` writes `fixtures/campaign-library/` (`library.json`, `packages/`); the server reads the
  pictures from the campaigns' own `assets/` and checks their SHA-256. Rebuild after any change to a
  library campaign; `library.test.ts` fails when the fixture is stale.
- `battle-maps.ts` cuts the GPT battle maps of an art workspace (each drawn over its fight's grid)
  into each campaign's `assets/battle-maps/` with a manifest. Originals stay outside the repository.
- `library.test.ts` activates every library campaign in memory and checks its pictures, figures and
  battle maps arrive once, and that an edited package gets none.

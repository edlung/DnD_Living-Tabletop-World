# Campaign package test specimens

These fixtures are noncanonical and excluded from production builds. Start with
the campaign package contracts and current Stage 390 work order.

- `bell.ts` builds the Russian, non-Ravenford bell-under-ice specimen.
- `sheets.ts` contains original supported-slice character and creature mechanics.
- `identities.ts` assigns deterministic opaque UUIDs for tests only. A real revision
  store must retain its identity registry rather than call this helper again.
- Import these files directly in tests. Never export them through a runtime package
  index or seed them into a live campaign without the real confirmed startup flow.
- Scenario possibilities are preparation notes; fixtures contain no played memory,
  actor assignments, started combat or claimed player decisions.

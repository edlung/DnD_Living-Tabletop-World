# Work Order — Stage 470: Items in AI campaign packages

Authority: owner «Берем реализацию всего» (2026-10-31) after ADR 0039 / Stage 460. Base: `claude/stage-460-items`.

## Deliver

1. Package field `possessions` (optional, additive: stored revisions stay valid and keep their digests): rows
   `{ item, holder, catalog?, quantity }` linking an `item` entity key to its starting holder and, optionally, a catalog
   entry (ADR 0039). Carried items have no placement; ground items stay placed entities.
2. Compiler validation (unknown keys, non-item or non-carrier kinds, unknown catalog IDs, quantity vs stackability,
   one row per item, carried-and-placed conflict, dead holder) and plan: one `GrantItem` per row, allowed in bootstrap.
3. Generation: the cast step may return `possessions`; prompt direction and rules guide updated; merge keeps the field.
4. Editing: `possessions` is an edit section (scope integrity: no silent change); preview shows what a character carries
   (own view only, owner view for all).
5. Tests: contracts, domain, server materialization/bootstrap on PostgreSQL, browser journey; adversarial pass; report.

## Out of scope

Worn-at-start (items start carried, the player wears them), ground items linked to catalog entries, shops, currency.

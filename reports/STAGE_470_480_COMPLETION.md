# Stages 470–480 completion — items in AI campaigns, starting gear, catalog pictures

Branch `claude/stage-470-campaign-items` (on `claude/stage-460-items`). Scope: `work-orders/STAGE_470.md`, `STAGE_480.md`.

## Stage 470 — delivered

- **Package field `possessions`** (`{ item, holder, catalog?, quantity }`), optional and additive: stored revisions stay valid and
  keep their digests. Items start carried, never worn.
- **Compiler**: unknown/non-item/non-carrier references, unknown catalog IDs, quantity vs stackability, duplicate holders,
  placed-and-carried, inactive item/holder are errors (`possessions.ts`); the plan emits one `GrantItem` per row, allowed in the
  atomic bootstrap (`bootstrap-operations.ts`), refused as a whole when a row fails.
- **Generation**: the cast step may return `possessions` (it owns the field on merge); the prompt and the rules guide list the
  catalog and the rules for starting items.
- **Editing**: `possessions` is an edit section (no silent change; absent equals empty).
- **Preview**: the scenario graph and inspector show "Starting items" (RU/EN, finding labels); a character's preview shows what
  they carry at the start (`…/preview/entities/:id/inventory`, own character or owner view only).
- **Ravenford starting gear**: Elowen carries a cloak, two balms, gloves and a lantern (`fixtures/ravenford*/items-seed.json`,
  seeded last, opaque IDs, so an already seeded database only appends the new commands).

## Stage 480 — partly delivered

Client support (Items sheet thumbnail with glyph fallback, `itemArtUrl`) and generation recipes are done. **No picture exists:**
all Codex image requests were refused with a ChatGPT usage limit until 2026-11-04 07:36. No other provider was used. See
`work-orders/STAGE_480.md` for the exact steps to finish.

## Verification (this machine, 2026-10-31)

| Check                                   | Result                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| typecheck, lint, format, context budget | clean                                                                                                                   |
| unit                                    | all pass (see below)                                                                                                    |
| integration (PostgreSQL)                | 350 pass                                                                                                                |
| browser (full suite, system Chrome)     | 190 of 192; the two failures were test data colliding with the new seeded gear (fixed); the 8 item journeys then passed |
| old test databases                      | 157 `ltw_it_*` throwaway databases (1.2 GB, no connections) dropped; `ltw` and `postgres` untouched                     |

Not run: GitHub CI (nothing pushed), a human playtest, a live-provider generation that returns `possessions` (only scripted and
schema-level checks), item pictures.

## Open

- Pictures (above). Worn-at-start and ground items linked to catalog entries are not supported.
- Existing stored revisions cannot gain `possessions` unless saved again (they stay valid without).

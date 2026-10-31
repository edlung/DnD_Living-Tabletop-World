# Campaign-generation design specimens

Start with `docs/STAGE_370_DESIGN.md` and the current authorized work order.
This directory contains product examples, not live campaign fixtures or canonical
world data. Never import it in runtime code or seed it into a database.

- `EXAMPLE.md` is an owner-review specimen of scenario and visual preview content.
- Human-readable example labels are not runtime entity IDs; the server must assign
  opaque stable IDs when Stage 390 implements the package format.
- Secrets are deliberately visible to the owner reading this example. A player
  preview must receive server-projected content, never this whole document.
- Add executable fixtures in an appropriately scoped testing directory only in
  the stage that implements the corresponding contract.

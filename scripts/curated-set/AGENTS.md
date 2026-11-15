# Curated-set processing

`cli.ts` turns the GPT originals of the curated Ravenford set into WebP files in
`fixtures/ravenford-ru/assets/` with `manifest.json` (provenance). Mechanical only: resize, crop the
battle map to the grid's 4:3 (or, for an item with `grid: [columns, rows]`, to that fight's grid
rectangle drawn in the middle of the canvas), black to alpha for figures (`../ui-kit/pixels.ts`).
It never draws. The same CLI builds Hollowmere's set (`fixtures/hollowmere/assets`, set name
`Hollowmere`). Style, references and checks: `docs/design/ravenford-art-bible.md`.

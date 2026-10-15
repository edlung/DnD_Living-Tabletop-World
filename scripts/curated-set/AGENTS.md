# Curated-set processing

`cli.ts` turns the GPT originals of the curated Ravenford set into WebP files in
`fixtures/ravenford-ru/assets/` with `manifest.json` (provenance). Mechanical only: resize, crop the
battle map to the grid's 4:3, black to alpha for figures (`../ui-kit/pixels.ts`). It never draws.

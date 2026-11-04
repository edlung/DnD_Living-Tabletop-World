# The SRD's words in Russian (`packages/rules/src/srd/ru/`)

Generated data (docs/adr/0055-rules-reference-and-toolbox.md §5). Each `<dataset>.json` maps an
entry's key to `{ hash, ru }`: the Russian of its strings (the unit `../russian.ts` and
`../russian-catalogs.ts` make of it) and the hash of the English it was made from. A Russian whose
English has changed since is stale: the server shows the English until it is made again.

- Make or refresh it with `node scripts/srd/translate.ts <dataset>` (the Codex CLI on the owner's
  ChatGPT subscription; datasets in `scripts/srd/translation-units.ts`). Only units whose English
  has no current Russian are asked; a Russian is kept only when `translationProblem` finds its
  shape, numbers and dice the English's.
- `terms.json` is the one hand-kept file: the Russian of the 5e terms, the app's own words where it
  has them (conditions, abilities, skills, damage). Change a term, then re-make the units that use
  it (delete their keys and run the pass again).
- Never edit a translation by hand; never load these files whole into context (`rg` a key).
- `../russian.test.ts` holds every dataset complete and current.

# Campaign combat balance

Run `pnpm campaigns:balance --out /tmp/ltw-balance` from the project root. Append campaign slugs for a focused run. The runner opens isolated in-memory tables and uses the shipped library and built-in books. Each output directory receives dice batches, a per-edition JSONL file and a Markdown encounter index.

- `scenes.mjs` builds the published parties and their equipment. `arena.mjs` calls the combat engine and folds its events. `tactics.mjs` chooses actions for both sides.
- `objectives.mjs` dispatches the book's goals to the scene modules. Keep scenario conditions, nonlethal play and the two sides' choices explicit. Six multi-board finales also use their existing specialist models through `finales.py`.
- `run.mjs --seeds N --start S --encounter KEY --out DIR SLUG` runs a focused series under Node with `--conditions=@ltw/source`. `--mode pressure` compares open combat. Prepared reinforcements follow the server's party-size rule. `--full-opposition` also includes the reserves at a short table.
- `LTW_BALANCE_FIXTURES` can point at previously exported prepared books for paired checks. The rule engine and objective choices stay identical on both sides. `rechecks.py` joins the dated paired and independent passes.
- `starts.mjs` exercises the real preview and start routes for three and four heroes. `collate.py` checks missing or duplicate encounters, unresolved outcomes and dice counts against each shipped variant.

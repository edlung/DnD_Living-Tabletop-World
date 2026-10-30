# Stage 370 verification evidence

This directory records the documentation-only campaign-contract checkpoint.
Start with `reports/STAGE_370_COMPLETION.md` and `handoffs/STAGE_370_REQUEST.md`.

- `validation.txt` is the local offline `pnpm validate` transcript; query summary
  lines or a failing command narrowly rather than loading the full build log.
- `validation-runner.txt` records how a throwaway PostgreSQL database and local
  provider overrides isolated the check. It is evidence, not application code.
- `package.sha256` identifies all changed checkpoint documents and evidence except
  itself and the handoff, avoiding a self-referential hash. The handoff identifies
  this manifest; `shasum -a 256 -c` from the repository root verifies its entries.
- No future Stage 380–450 runtime surface is covered by these regression results.
- Never place credentials, environment-file contents or live AI output here.

# Stage410 evidence index

- `validation.txt`: final full isolated offline check.
- `initial-validation.txt`: original full run and browser failures before repairs.
- `workshop-regressions.txt`:24old/new workshop browser tests after repairs.
- `validation-runner.txt`: copy to `/private/tmp/ltw-stage410-validate.mjs`, then
  run `node --conditions=@ltw/source /private/tmp/ltw-stage410-validate.mjs` from
  this checkout with local PostgreSQL available. It creates/drops a throwaway DB.
- `layout/results.json`:24state/width measurements, zero errors/warnings.
- `layout/<state>-<width>.png`: full-page screenshots;
  `layout/<state>-<width>-viewport.png`: focused screenshots. States:opening,
  inspector,correction,generation,job-completed,preparation-step.
- `layout-runner.txt`, `layout-server.txt`: reproduce by copying to their named
  `/private/tmp/workshop-stage410-audit{,-server}.mjs` paths and running the audit
  from this checkout. Ports4322/4323, test-only sign-in and scripted generation;
  no default DB or real credential is used. The copied runner creates a fresh
  per-run fixture seed. Local project/skill paths must match this installation.
- `package.sha256`: checkpoint file identity before the next stage.

The screenshot audit uses the only supported dark theme and1440/768/390/320widths.
Reviewed inherited spacing information remains; no horizontal overflow or clipped
controls was found. Generated fixtures and artwork do not attest live AI quality.

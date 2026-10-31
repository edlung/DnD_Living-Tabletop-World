# Stage420 evidence index

- `validation.txt`: final full isolated offline validation.
- `initial-format.txt`: first full run, stopped on historical generated audit JSON.
- `cookie-race-red.txt`, `cookie-race-green.txt`: reproduced stale-cookie response
  problem and repaired workshop/private HTTP regressions. No credentials printed.
- `root-focused.txt`: overlapping focused projection/HTTP/worker/domain cases.
- `validation-runner.txt`: copy to `/private/tmp/ltw-stage420-validate.mjs`, run
  `node --conditions=@ltw/source /private/tmp/ltw-stage420-validate.mjs` from the
  checkout with local PostgreSQL available. The database is created and dropped.
- `layout/results.json`:36layout and axe measurements, zero errors/warnings or
  accessibility violations. Nine states ×1440/768/390/320, sole dark theme.
- `layout/<state>-<width>.png`: full-page captures;
  `layout/<state>-<width>-viewport.png`: focused captures. States:owner-empty,
  owner-scene,owner-detail,owner-layout,character-scene,character-sheet,
  picture-candidate,picture-selected,picture-stale.
- `layout/receipt.md`: inspection receipt and fixed findings.
- `layout-runner.txt`, `layout-server.txt`: copy to the named
  `/private/tmp/workshop-stage420-audit{,-server}.mjs` paths and run the audit from
  the checkout. Ports4322/4323, per-run random fixture seed, in-memory private
  storage and explicit scripted image provider. Adjust installation paths if needed.
- `package.sha256`: exact checkpoint files before later stages.

The production-adapter PG/HTTP integration is an ordinary integration test in
`apps/server/src/workshop/images/http-generation.integration.test.ts`; the final
full log includes it. Its transport and reported charge are fixtures, not a live
provider invoice. No real grant/credential/default DB/campaign/deployment changed.

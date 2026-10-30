# Stage430 — Protected revisions and selective AI edits

Date:2026-10-30. Status:**TECHNICALLY_VERIFIED / CONTINUING_BY_OWNER_DIRECTION**.
Base:`b8ea7bb`; branch:`codex/stage-430-selective-revisions`.
Authority:`reviews/OWNER_CAMPAIGN_CONTINUATION_2026-10-30.json`.
Scope/design:`work-orders/STAGE_430.md`, `docs/STAGE_430_DESIGN.md`.

## Result

The owner can edit the complete campaign structure through typed controls,
including numeric statistics, optional/nullable fields, references, tagged variants
and list insertion/removal/reordering. Existing identities stay immutable in the
form; new objects receive fresh local keys. The scenario, local buffer, comparison
and proposals remain inside the mounted owner Scenario boundary. Pending writes
keep their original payload/CAS/nonce after uncertain responses; explicit retry
replays the accepted result.

Content and selected-picture protections are immutable, versioned owner snapshots.
The shared append boundary checks every writer before allocating identities or
committing content, manifest or receipts. Image selection also protects dependent
figures/maps. Unlock is explicit; neither an AI instruction nor a restore releases
protection. Historical revision/nonce fingerprints remain compatible.

Selective AI editing resolves stable targets and incoming structural dependencies
on the server. Reasons are displayed, locked dependencies stay read-only, and
shared prose/names do not enlarge scope. The genuine admitted preparation runtime
uses a separate EDIT repository/worker and one edit stage with the existing bounded
repair/accounting protocol. Full output is schema-, scope-, order- and lock-checked.
Oversized input/output fails without truncation or model substitution. An EDIT
stores a candidate and never appends automatically.

Review includes the full before/after scenario, complete field changes, immutable
instructions/scope, compiler assessment, protection conflicts and prospective
picture staleness. Explicit adoption rechecks the current owner session and every
head/lock/manifest/review binding in one transaction. Changed heads cannot silently
rebase. A historical scenario can be compared and restored as a new revision;
played history is untouched. Actual retained identities, including retired aliases,
are used for review parity and canonical allocation.

Core changed entrypoints:public `campaign/{edits,locks,review}.ts`; pure domain
`campaign/editing/`; server `workshop/revisions/` and mode-qualified
`generation/edit-worker.ts` / `edit-routes.ts`; client `workshop/editing/` /
`comparison/`. Main composition, source-signature parity, test fixtures, bilingual
styles/dictionary, migration0021 and recovery runbook were updated.
The byte manifest enumerates all delivered files.

## Verification

Full isolated `pnpm validate`:PASS, exit0. 3,267unit tests /351files;331PostgreSQL
tests /56files;172browser tests. Formatting, lint, typecheck, build, migrations and
Ravenford seed all passed. Context budget:1,381activefiles,0over target/hardlimit.
The throwaway database was dropped; default DB was unchanged.
Focused browser journeys:8passed across the final root and image/RU runs.
Four-width layout/axe:44state-width combinations at1440/768/390/320,88PNG
screenshots;0errors,0warnings,0violations. Allstates visually inspected; root
also inspected representative desktop/tablet/phone views. Focusedwebunit:42PASS.
Evidence:`reports/evidence/stage-430/index.md`; delivered bytes:`package.sha256`.
The handoff carries the manifest digest without introducing a self-reference.

The PostgreSQL HTTP pipeline uses real invitations/cookies, preparation grants,
UNLIMITED policy, durable dispatch, request journal, settled accounting, actual
worker, immutable candidate, review and explicit adoption with injected transport.
It verifies that the dispatch marker is visible from another connection before
fetch, the workshop subject has no campaign ID, no canonical event is created,
and lost-ACK adoption replays after subsequent head/lock changes.

## Own adversarial findings and repairs

- Review initially inferred identities only from current/historical package maps.
  Retired aliases could therefore appear to acquire a fresh identity during review.
  The bounded owner/draft registry read now preserves their real UUID/kind; a kind
  conflict blocks review, and same-kind resurrection predicts actual art state.
- The server initially omitted the EDIT discriminator from public job DTOs, while
  the browser defaulted old DTOs to GENERATE. Browser checks exposed the wrong
  seven-step label and missing review action. EDIT now emits its mode explicitly;
  GENERATE retains its exact legacy keys. Memory/PG/HTTP tests cover both.
- Public JSON Schema encodes primitive nullability as a type array. The initial
  typed form did not expose that presence choice. Genuine RED model/SSR tests led
  to explicit branch normalization, preserving scalar constraints; they are GREEN.
- Switching a milestone variant initially replaced its hidden stage key. The new
  variant helper preserves supported existing identity fields; two additional
  regressions verify preservation and new-row freshness (22modeltestsGREEN).
- A newly queued edit initially appeared beside an empty history message. The list
  now merges authoritative selected progress and sorts/deduplicates it.
- Reordered keyed rows need distinct before/after paths in linked comparisons.
  The comparison model and structured renderer now retain both and keep complete
  changed values, additions/removals and null-versus-absence differences.

Browser harness corrections preserve the behavioral assertions: compare values
are scoped to the visible diff side, catalog labels use their actual full names,
revision polling reads lightweight history metadata instead of repeatedly charging
full editing-context admission, and an unused browser422 response body is checked
through status plus a fresh availability read and kept-form/no-job assertions.
No production operational limit was raised.

Packaging verification caught a manifest command with `-z` after the path separator,
which omitted tracked modifications from the initial local checkpoint. The corrected
manifest is computed against base`b8ea7bb`, includes both tracked and new files, and
asserts critical composition/export paths. Full validation had checked the complete
working tree; only the unpublished local packaging was repaired.

## Boundaries and continuation

No monetary AI ceiling was introduced; actual/unknown accounting, explicit grants,
operational stops, concurrency, timeout and bounded repair remain. No default DB,
real credential/operator/model, dependency, deployment or publishing change occurred.
All transport here is injected/scripted; live provider quality, paid cost/latency
and human play acceptance are not represented by these tests.

Migration0021 requires an aware application/operator recovery build: older writers
skip protections and older workers can treat EDIT as seven-stage generation.
`deploy/RUNBOOK.md`§3 records the restriction. Existing reviewed evidence bytes stay
unchanged. Continue to440 after full technical verification under the owner's
instruction; activation and live-world bootstrap remain outside430.

Vite reports a1,212.94kB entry bundle (327.66kB gzip). Workshop code-splitting
remains due in the450 integration/polish pass; the warning was not suppressed.

# A11/A12 revision handoff

- Type: RETEST / focused content revision; no new product stage.
- Authority: `work-orders/MOON_PEARL_A11_REVISION_2026-11-08.md`.
- Baseline: prior delivered identity in `reports/evidence/moon-pearl-2026-11-08/file-identity.json`.
- Report: `reports/MOON_PEARL_A11_REVISION_2026-11-08.md`.
- Current identity: `reports/evidence/moon-pearl-a11-2026-11-08/delta.json` and `verification.json`.
- Status: AWAITING_OWNER_DISPOSITION for play acceptance; scoped revision implemented and checked.

Open chapter 10.2 and its light-observation handout, then chapter 11's festival scene. Players
independently observe a changing tide-light pattern, compare viewpoints and one variable at a time,
then decide whether to record or share the experience. The cargo replacement was rejected under
A12 and remains archived. The old third encounter, its two enemies and unused map have been
removed from all new native variants and the book.

Reproduce with `pnpm pearl:build`, `pnpm pearl:art`, `pnpm pearl:book`, `pnpm pearl:check`, then
`pnpm exec playwright test tests/e2e/pearl-package-import.spec.ts`. The prepared-encounter test
also attempts the removed `scenario-3` start and checks that rejection does not mutate the world.
The retained encounter, clue, secret-art and exact-version import boundaries are still exercised.

Architecture authority, prior-history isolation and explicit DM activation remain governed by
`ARCHITECTURE_INVARIANTS.md`. No application engine contract or actual saved campaign was changed.
Existing campaign imports are not upgraded automatically. Earlier full-suite results remain
historical; this revision's check ledger identifies only the runs actually repeated.

Art bytes, both earlier campaigns and initial delivery evidence remain unchanged. Human playtest
acceptance and any independent auditor retest are separate from these implementation checks.

# Campaign delivery handoff

- Scope: third original family campaign; no numbered stage.
- Type: INITIAL, plus separately authorized Acorn content revision.
- Baseline commit: `e69c3290ca34cbde4a837591bfb477b899581142` with pre-existing dirty work.
- Implementation: the session's selected model; no delegated writing or implementation.
- Owner authority: «Давай еще кампанию» and the earlier adult-DM / three-player preferences.
- Report: `reports/MOON_PEARL_2026-11-08.md`.
- Acorn addendum: `reports/ACORN_ORIGINALITY_REVISION_2026-11-08.md`.
- Identity: `reports/evidence/moon-pearl-2026-11-08/file-identity.json`;
  source/package counts and check ledger in `verification.json` in the same directory.
- Status: AWAITING_OWNER_DISPOSITION for family play acceptance; scoped implementation delivered.

## Start here

Open `campaigns/moon-pearl/index.html`, then `guide.html` and `sessions/01.html`.
Give players `players.html` and only the handouts actually revealed. Read the README before
importing a native package or transferring art. The complete local directory contains DM secrets;
player navigation is not a public-hosting access-control system.

```sh
pnpm pearl:build
pnpm pearl:book
pnpm pearl:check
pnpm acorn:check
pnpm lighthouse:check
pnpm exec playwright test tests/e2e/pearl-package-import.spec.ts
pnpm exec playwright test tests/e2e/acorn-package-import.spec.ts
```

`pearl:import-art --campaign <id>` is read-only by default. Its `--confirm` mode transfers
local prepared art through the existing authorized commands only after exact-package matching.
Real application import and activation were not performed for the user's saved games.

## Boundaries and attack surfaces

Authoritative documents: the two current work orders, `ARCHITECTURE_INVARIANTS.md`,
`AGENT_WORKFLOW.md`, `docs/PROJECT_WORKFLOW.md` and the campaign/tooling AGENTS files.

The isolated fixture uses a test workshop owner, real upload/revision endpoints and an in-memory
world. Tests cover party variants, actual compiler readiness, activation, all clue inspections,
prepared encounters, hidden art metadata/raw-byte access, exact art bindings and idempotency.
No fixture credentials or future DM outline should become player knowledge.

The narrative attack pass covers early recovery, skipped scenes, failed checks, peaceful entry,
late auction, audio evidence limits, unwilling forgiveness and incomplete endings. Acorn's
revision separately covers early disclosure, uncertain ecological inference, practical station
support and the creature's reversible choice. See reports for each outcome.

## Validation disposition

Campaign-specific checks passed. Full browser regression passed 247 tests. PostgreSQL migration
and seed retries were idempotent; a full integration run had one timeout, and both tests in that
file passed in an isolated retest with unchanged time limits. The dedicated database was removed.

The whole shared checkout is not green: the final recorded unit run has 126 failures in concurrent
collection work and its architecture checks; global lint has two errors in the noir author's new
file; formatting flags 124 concurrent files. These scopes were preserved. Their logs and earlier
failure snapshots are retained. No architecture rule was waived to obtain a campaign PASS.

The book was measured and visually inspected at four widths; selected screenshots and browser
audit harnesses are included as evidence. No physical print test or live family session was held.
Timing, emotional response and final encounter balance need real play. No deployment, provider
spend, credential change, external message or production activation is implied by this handoff.

## Review boundary

This delivery is ready for the owner's use and play feedback. Do not begin a later product stage,
publish the DM directory or replace an active campaign automatically. Keep the earlier Lighthouse
and Acorn delivery evidence immutable; any later content edit gets a new identity and addendum.

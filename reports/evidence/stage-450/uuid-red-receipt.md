# Stage450 bootstrap JSON boundary regression receipt

This is a reconstructed receipt from the actual tool result, not a preserved raw
stdout log. The original `/private/tmp/ltw-stage450-play-tests.log` was reused for
the next focused run.

- Command: `pnpm exec vitest run apps/server/src/scenario/campaign-play.test.ts`
- Run started: 2026-10-30 17:41:55 local session clock.
- Result: 1 failed, 1 passed (2 tests).
- Failing case: `plays investigation, eligible social disclosure and the actual
  prepared encounter through normal invited-player HTTP`.
- Failure: `parseRecordedEvent` rejected `eventId` with Zod `invalid_format`,
  `format: uuid`, after investigation, social disclosure, combat, undo, journals
  and the re-decision oracle had completed.
- Cause: test-only `activationMemoryFixture` used `SequentialIds(91000)` and
  `SequentialIds(92000)` despite its documented 0–65535 namespace bound. The
  namespace field therefore contained five hexadecimal digits.
- Correction: fixture owner changed those namespaces to `0x9100` and `0x9200`.
- No general ID-generator API or production provider changed in this slice.

The final raw focused GREEN output is in
`/private/tmp/ltw-stage450-play-tests.log`.

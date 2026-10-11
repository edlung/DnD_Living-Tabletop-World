**Verdict: PASS**

All four earlier findings are resolved: three are fixed at the root, and the fourth was deferred with owner approval, as the brief records. The repair introduced no new Critical, High or Medium defects, and all ten required checks pass on the repaired artifact.

## 1. Artifact identity verified

- **Manifest:** all 113 entries match the snapshot, and the listing hash is `589b980e…b20e`, as stated. I re-checked this after all my runs, so nothing changed while I worked.
- **Design draft 7:** SHA256 `23e53e4d…aab2`, which matches.
- **Stop-scope delta:** SHA256 `6bba0030…b485`, which matches.
- **Handoff:** SHA256 `0049a4d3…e990` (recorded for reference).
- **Repair delta against the initial artifact:** I compared the new listing with the 106-file listing I verified in the first review. Exactly the 26 files the handoff names have changed:
  - 19 changed;
  - 5 new: migration 0008, `attempt-responses.ts`, `suspect-records.integration.test.ts`, `admitted-provider-holds.test.ts`, `fallback-deadline.test.ts`;
  - 2 checkpoint-A files are now modified: `settlement.ts` and `types.ts`.
- **Other checkpoint-A modules:** `money.ts`, `lock-keys.ts`, `pg-transaction.ts`, `deadline.ts`, `recovery.ts` and migrations 0005/0006 are still byte-identical to the A accepted manifest.
- **Environment files:** only `.env.example` exists.

## 2. Findings

### Earlier findings

**F1 (Medium): dispatch or local switch after the deadline. Fixed.**
- **Fix:** every decision to dispatch or invoke a provider now treats the caller as gone when the abort signal has fired *or* the clock has reached the deadline:
  - the fallback (`packages/ai/src/fallback.ts:167`, applied at lines 193, 204, 213, 259, 273 and 317);
  - the admission wrapper, both before admission and after it (`apps/server/src/ai/admitted-provider.ts:100-106`, `146-151`);
  - every raw-adapter check before the start boundary (`raw-provider.ts:89-97`).
- An admission that commits after the deadline is now released live, with no key read, no `onStart` and no `fetch`.
- The per-attempt timeout is clamped to the time left (`raw-provider.ts:101-106`), which design §1 asks for.
- **Regressions:** `admitted-provider-holds.test.ts:96-139`, `fallback-deadline.test.ts`, `request-lifecycle.test.ts:176` (all four capabilities) and `raw-adapter-hardening.test.ts:188-260` (both adapters). Each would fail on the old code, which revealed the key, fetched, or ran the local provider in these cases.
- **My reproductions now pass:** R-P1, R-P2 and R-P7 (below).

**F2 (Low): the automatic stop was not retried. Fixed.**
- `holdWithStop` is now idempotent per attempt and reason, checked under the attempt's account lock (`accounting/settlement.ts:146-161`).
- The write is retried after 100, 500 and 2,000 ms, and the route is refused in-process from the suspect response until the stop commits (`accounting-tasks.ts:88-110`; checked before admission at `admitted-provider.ts:108`).
- **Regressions:** `admitted-provider-holds.test.ts:142-221` and `suspect-records.integration.test.ts`. The latter covers a stop write held up past its 5 s bound, ambiguous COMMIT answers that never duplicate the stop, and no new stop after an operator clears it.
- **My reproduction (R-P6B, real stack) now passes:** described below.

**F3 (Low): provider request IDs were not stored for unsettled attempts. Fixed.**
- The new append-only table (migration `0008_ai_attempt_responses.sql`) has a foreign key to the attempt, identifier checks matching the code's `safeIdentifier`, and update/delete/truncate triggers.
- The write is idempotent, retried, and made for every response that carries an ID (`attempt-responses.ts`; `admitted-provider.ts:179-181`).
- The DM diagnostic reads it per attempt, still filtered to the request and campaign (`diagnostics.ts:71-78`).

**F4 (Low): a COMMIT-unknown admission keeps its hold.** Owner-approved deferral, recorded in the handoff and ADR. Not counted against B2.

**Informational notes from the first review:**
- Fixed: the stale `accounting/types.ts` header and the `docs/AI_CONTEXT_MAP.md` design-status row.
- Deferred with owner approval: B1 carry-over 10 (Sonnet 5.5 usage/model allowlists).

### New in the repair delta: no Critical, High, Medium or Low defects

- **I1 (informational):** `packages/ai/AGENTS.md:42` still states the cancellation rule only in terms of the signal. The ADR and `GATE_COVERAGE.md` describe the clock-based rule correctly.
- **I2 (informational):** the 100/500/2,000 ms retries now also apply to the stop write and the response record, not only settlement. Design §1 says "retry only settlement …, not admission after caller expiry". I read that as forbidding admission retries, so retrying these idempotent writes outside the caller's lifetime is within its intent and only makes the system fail closed more often. The ADR B2 repair 1 amendment documents it.
- **I3 (informational):** if every retry of a stop write fails, the in-process refusal lasts until restart, even after the operator records or clears the stop. This is conservative and documented.

### Re-verified, no regression

- The in-process refusal only ever adds denials. Its scope matches the stop: provider and canonical model for an unexpected model, the whole provider for unverified billing. One instance is shared across capabilities.
- A refused attempt follows the outcome table: an initial attempt switches to local, a refused repair ends as invalid output, and relevance falls back to its deterministic actions.
- The existing tests' call-sequence expectations were extended with the new `response` step; none were weakened.
- The stop-scope, catalog and composition files are unchanged since my first review.

## 3. Checks (run from the snapshot root)

| Check | Result |
|---|---|
| `pnpm run format:check` | Pass |
| `pnpm run lint` (zero warnings allowed) | Pass |
| `pnpm run typecheck` | Pass |
| `pnpm run context-budget` | Pass: 686 files, 0 over target, 0 over the hard limit |
| `pnpm run test` | Pass: 197 files, 2,170 tests |
| `pnpm run build` | Pass |
| `pnpm run db:migrate` | Pass: 8 already applied, 0 new, no checksum drift |
| `pnpm run seed:ravenford` | Pass: 0 accepted, 91 duplicates, version 113 |
| `pnpm run test:integration` | Pass: 31 files, 173 tests |
| `pnpm run test:e2e` | Pass: 45 tests (ports 4310 and 4311 were free) |

## 4. Probes

My first-review probes were re-run with unchanged code. All ran inline; PostgreSQL probes used the project's throwaway databases.

- **R-P1 (fake store, admission answered 5 ms after the deadline):** no key reveal, no `onStart`, no `fetch`. The hold was released and the attempt ended "transport not started". On the initial artifact this probe dispatched.
- **R-P2 (late denial; intent, dialogue, Chronicle, relevance):** no local call after the deadline in any of the four. Each public result is the cancellation row: intent and dialogue unavailable, Chronicle the template, relevance a timeout. Previously there was one local call in each.
- **R-P7 (real stack, admission COMMIT answered at 1,540 ms against a 1,500 ms deadline):** no key reveal and no `fetch`. The attempt is `released_pre_dispatch` with an effective charge of 0, where previously it dispatched and left an open hold of 332,160 µ$.
- **R-P6B (real stack, stop write blocked past its 5 s bound by the exclusive policy lock):**
  - While the stop was pending, a second intent and a Chronicle request on the same model were refused in-process; the admission count stayed at 1 and both switched to local.
  - The stop was retried and committed exactly once, with the canonical model and the observed model, and no issue was reported. The refusal was then lifted.
  - The next request reached admission and was denied by the committed stop.
  - The suspect attempt's request ID and returned model were recorded.
- **P5 recheck (keys present, approval selected and stored, accounting store, `.env.example` routes, throwing secrets, trapped `fetch`):** 0 fetches, 0 key reveals and 0 budget-store calls. Every remote entry was refused with `UNVERIFIED_MODEL`, and all four capabilities answered locally or deterministically.

## 5. Residual risks and what I could not verify

- **Stop write fails on every retry:** no stop row exists until the operator acts on `STOP_FAILED`. Other processes, and this one after a restart, are not refused in the meantime (documented).
- **Response record fails on every retry:** the request ID then exists only in the provider's logs; reported as `RESPONSE_NOT_RECORDED` (documented).
- **Settlement of a known overrun exhausts its retries:** the hold stays at the reservation, below the known charge, and no stop is written. The design accepts this and the code is unchanged.
- **Owner-approved deferrals:** the COMMIT-unknown hold (F4) and the Sonnet 5.5 allowlists.
- **Live behaviour:** nothing about live providers was verified; the verified catalog is empty and no network was allowed.
- **Timing probes:** I modelled event-loop lag with synchronous spins. The checks now read the clock directly, so they no longer depend on when the abort timer runs.
- **Unlisted changes:** without git metadata I cannot rule out changes outside the manifest. I did verify the manifest and the A files claimed unchanged.
- **Reviewer independence:** both acceptance reviewers are from the same model family, a risk the owner has already noted.

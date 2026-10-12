**Verdict: PASS**

The repair fixes all eight of my earlier findings at the root, each with regressions or negative controls that would fail without the fix. I found no new Critical, High or Medium defect in the repair. All ten required checks pass, with one honest caveat: the first full integration run had one timing failure, described in sections 2 and 3.

## 1. Artifact identity verified

- **Manifest:** all 82 listed files match their SHA256. The listing hashes to `7f4c4eb4…08dc`, as claimed. I re-checked at the end of the review: 82/82 unchanged, and no non-build file changed during my session.
- **Hashes:** design draft 7 (`23e53e4d…aab2`), stop-scope delta (`6bba0030…b485`), catalog record (`5c26853b…c416`), owner decisions 5 (`fe9639b0…9e9d`) and owner decisions 6 (`80dcf4e7…69c3`) all match.
- **Completeness:**
  - The 82 files are the earlier 67 plus 15 new ones.
  - No other non-build file was modified after my first review, apart from the handoff itself.
  - The new offline evidence records commit `e288678` with 80 dirty files, none deleted. All of them match this artifact except the handoff, which was edited afterwards.
- **Base commit:** not verifiable here (no git metadata).

## 2. Findings

**Earlier findings — all resolved**

- **M1 (oracle accepted extra commands) — fixed.** `intent-cases.ts` now requires the exact command count, types, fields, targets, values and scope.
  - All seven wrong answers from my first review are now rejected, including the fishmonger proposal that also killed Mira.
  - `intent-oracles.test.ts` adds 35 negative controls.
- **M2 (template chapter scored as a model pass) — fixed.** `chronicleModelVerdict` only judges prose the model actually wrote.
  - My earlier probe (narrator unavailable) now reports "not judged / template".
  - A model answer rejected by validation now counts as a model failure, listing its causes; `eval-live.integration.test.ts` covers this for wrong citations and missing hedges.
- **M3 (estimate left out cached input) — fixed.** Each measured sample is now the request's known charge from accounting.
  - Regression: 200 input + 3,000 cache-write + 800 output tokens gives 15,900 µ$, and 5 intents give $0.079500 in the integration test.
  - Requests that were held or never dispatched give no sample.
- **M4 (null/absent labels accepted) — handled by owner decisions 6** (`nullUsageLabels`), now tested explicitly. Explicit other values still fail closed.
- **L1 (partial Gate 04 replay) — fixed.**
  - The replay now has all 5 injection lines, all 5 intents (including insight and show) and the 4 attitude scenarios: 69 requests per run.
  - After each request, the runner rebuilds the NPC context with the route's own domain functions and compares source IDs exactly; phrases are checked lexically.
  - The gate-coverage paragraph and ADR wording are corrected.
- **L2 (guard statement unchecked, loose injection oracle) — fixed** as part of M1.
- **L3 (nested request content unchecked) — fixed.** The new `request-shape.ts` runs before any reservation.
  - Each nested variant I tried was refused: prefill, user content blocks, a server tool, a typed or renamed tool, a missing description, `ttl` (1 h or explicit 5 m), and `cache_control` on the tool, in the schema, or in the message.
  - The adapter's real bodies still pass for all four capabilities.
- **L4 (refusal-order docs, Chronicle panel message) — fixed.** The documented order is corrected, and `chapter-message.ts` now tells an unavailable narrator apart from narrator text that failed the chronicle's checks.

**New findings**

- **N1 (Low, test robustness; predates C): boundary race in one test.**
  - Where: `transaction-bounds.integration.test.ts:71-86` ("cancels at the request deadline while waiting on a lock").
  - In my first full integration run it got `ADMISSION_UNAVAILABLE` instead of `CALLER_CANCELLED`. The database's `lock_timeout` can fire a few ms before the monotonic deadline, which the design classifies as unavailable. In both outcomes admission is denied and nothing is admitted.
  - It passed 3/3 in isolation and in a second full run.
  - C only touched a different test in this file (L-N1). The assertion should tolerate either code at the boundary.
- **N2 (Low): lexical gaps left in the guard oracle.**
  - A negated account ("Караван не ушёл", "the caravan did not leave") still passes.
  - The free-text name and description are only scanned for planted markers.
  - Both fall under the documented "judged lexically" limitation.

## 3. Checks

| Check | Result |
|---|---|
| `format:check` | PASS |
| `lint` | PASS |
| `typecheck` | PASS |
| `context-budget` | PASS: 718 files, 0 over target, 0 over hard limit |
| `test` | PASS: 208 files / 2,348 tests |
| `build` | PASS |
| `db:migrate` | PASS: 8 already applied, none new |
| `seed:ravenford` | PASS: 0 accepted, 91 duplicate |
| `test:integration` | Run 1: 181/182 (the N1 timing failure). Failing file in isolation: 3× PASS (14/14). Run 2: PASS, 33 files / 182 tests |
| `test:e2e` | PASS: 49 (ports were free) |

## 4. Probes and outcomes

- **Composition across all four capabilities:** 8 admissions (initial plus repair attempts) at 2,581,920 / 2,540,960 / 2,520,480 / 2,622,880 µ$. Every body has a single user message and exactly the expected tool keys.
- **Usage classification after the `pricing.ts` change:** unchanged. 6,200 µ$ is priced correctly, nulls read as defaults, and priority tier, US region, fast speed, 1-hour writes, thinking above output, web search, compaction iterations and dated models all fail closed.
- **Full Gate 04 replay in memory, real composition, fake transport:**
  - 69 requests inspected, 0 leaks, 69/69 sources equal to the builder's, nothing missing.
  - 21 requests legitimately carry guarded content the builder unlocked (Mira when trusted).
  - Negative control: judged without the unlocking context, exactly those 21 are flagged, and a spliced planted marker is flagged.
- **Session estimate, recomputed by hand:** runtime $0.317–$2.045, up to $4.090 at twice the high end; Sonnet-relevance alternative $0.25–$1.35. All correct.
- **Preflight regression:** refusals in order (unverified model → no database → no key → database unavailable), with zero connections, key reads, transport calls or run directories before each is needed.
- **Offline evidence:** I reproduced the run inline with a key-free environment and no transport (the permission mode denies `pnpm eval:ai`). Report, results and manifest are identical apart from timings, trace IDs and git state.

## 5. Residual risks and what I could not verify

- **Live behaviour:** nothing ran live, so Sonnet 5.5 latency, effort adequacy, truncation rate and real usage fields are unmeasured.
- **Runtime relevance is configuration, not code:** the default route has no ranker, the documented example has none, and the startup report shows none. The approved design still allows an operator to configure a paid ranker explicitly.
- **Tier and region aren't pinned in the request:** on an account with Priority Tier or a US default region, the first response fails closed and stops the route, possibly after one attempt billed above its hold.
- **Inherent lexical limits:** paraphrased secrets and negated or rephrased statements can't be caught by phrase scans. The rebuilt context is the oracle for what may be disclosed, so the evaluation can't detect the builder itself over-disclosing; that remains the job of the deterministic Gate 04 suites.
- **Unchanged behaviour carried forward:**
  - Evaluation traces live under the real campaign ID `ravenford`.
  - The player's talk notice is world-level and doesn't name the NPC.
  - When the DM switches listener, the reply is discarded, but the previous canonical Ask still runs on the server.
- **Not reproduced:** the implementer's failing-first runs and the `setupFiles` negative control, because both require editing sources.
- **Reviewer independence:** both reviewers are the same model family, as the owner has already noted.

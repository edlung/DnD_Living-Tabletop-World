# FAIL — Stage 300 checkpoint A, repair 1

Fresh independent `gpt-6.1-sol`, `xhigh` (`/root/sol_checkpoint_a_clean`). User exception accepts explicit native configuration for this checkpoint's Sol review; actual response-model attestation is unavailable. No peer content, implementation history or handoff text was read. No checkout writes.

## Artifact

Verified before/after: HEAD `406904343bfe8542640035564d3e044561824125`; all 78 entries of `/tmp/ltw-stage300-checkpoint-a/repair1-frozen.json` matched, SHA256 `d4f97d288afcc69b0d3d9e62a710f0dfb7f90d3fb13dfd659cd1c998d8e8b442`; legacy `budget.ts` absent. Handoff bytes `d5052c2e645a03e471f99186f5675ac0bfe4540f366ad6c8d103db49daa49922`; approved design `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`.

## Required corrections

### High — Finalization does not enforce the stored cutoff throughout persistence

`apps/server/src/ai/accounting/request-journal.ts:102–135`: the local deadline is supplied by the caller, not derived/clamped to the stored request deadline plus 5,000 ms. The DB window is checked once; a delayed response leaves stale `open = true`, followed by unconditional outcome/trace writes and COMMIT beyond the stored window.

Independent throwaway PostgreSQL reproduction: insert a request with 300 ms left in its stored finalizer window; delay only the response to `SELECT … AS open` by 450 ms; call `finalize` with `deadlineIn(5000)`. Result: `recorded`; outcome created 164.086 ms after the stored window; trace present; recovery `not-eligible`.

Required: enforce the stored cutoff across remaining transaction waits/writes/COMMIT. Add a window-closes-after-initial-check regression: no late live outcome or usable trace survives; recovery remains possible. Approved design §2, lines 337–340 pins the finalizer's absolute deadline to stored caller deadline + 5,000 ms.

Scope: B2 could supply matching original monotonic deadline + grace and avoid this particular reproduction, but the A primitive neither enforces that precondition nor provides its advertised stored-window bound. This is not a demand for missing B2 integration.

### Medium — SQLSTATE does not necessarily prove COMMIT rolled back

`apps/server/src/ai/accounting/pg-transaction.ts:64–66,202`: `answeredByServer` treats every five-character SQLSTATE as a known COMMIT failure, including `08007` (transaction resolution unknown).

Independent deterministic driver: complete BEGIN, SHOW and application SQL, then reject sent COMMIT with `{code:'08007'}`. Observed `reason:'failure', commitUnknown:false, destroyed:true, commitSent:true`. Same classification for `08006` and `57P01`. Connection destruction is correct; uncertainty classification is not. No actual overspend or refund was observed; durable holds still count.

Required: preserve `commitUnknown` for connection failures/unknown resolution; clear it only with definite rollback evidence. Add ambiguous SQLSTATE regressions and verify admission returns `COMMIT_UNKNOWN` while any committed hold remains effective.

## Checks and successful repairs

- Focused unit: 60 tests / 9 files PASS; accounting PostgreSQL integration: 50 / 6 PASS.
- TypeScript no-emit, incremental false: PASS. Context budget: 631 active files, zero over target/limit.
- 100 ms settings/BEGIN/SHOW/COMMIT delays under 40 ms deadline return around 41–42 ms; failed connections destroyed, no later application work; delayed COMMIT uncertainty retained.
- Real PostgreSQL delayed settings and committed hold controls PASS.
- TIMEOUT plus pending hold 1,000 rejects batch allocation 10 with `ATTEMPTS_UNRESOLVED`, leaves effective hold 1,000 and no accounting/batch rows.
- Settlement 300 then 900 preserves 900, appends stop, blocks 700, keeps one terminal; duplicate/changed-usage controls PASS.
- Inspected concurrency, revisions, rotation, grant/run binding, stored buckets, append-only schema, max charges, recovery uniqueness, atomic outcome/trace insertion, local-only composition, throwing Secret, live refusal, immutable offline output, effective relevance deadline and removal of defaults.

No full validation/build/dev-database mutation, secrets, paid calls or source writes. Verified pricing and runtime lifecycle remain absent; B1/B2/C and owner product dispositions remain pending. Exact-input digest vs JSONB normalization and lexical historical-path guard remain limitations.

**FAIL — STOP.** No dependent checkpoint work until required fixes and both approvals on the repaired artifact.

Faithfully transcribed by the orchestrator from the fresh reviewer's final report; no peer verdict was supplied.

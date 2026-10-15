# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint A (repair 2)

- Gate: intermediate checkpoint — Stage 300 remediation A (durable admission, trusted metadata,
  accounting journal). Not Gate 06.
- Review type: RETEST of the repaired artifact
- Completed stage: Stage 300 remediation checkpoint A only (B1, B2, C not started)
- Revision/commit: uncommitted working tree on branch `stage-300-live-ai` over HEAD
  `406904343bfe8542640035564d3e044561824125` (source baseline `bc6c116`). No commit or push.
- Required output paths: `reviews/STAGE_300_CHECKPOINT_A_SOL_REVIEW_REPAIR_2_2026-10-11.md` and
  `reviews/STAGE_300_CHECKPOINT_A_OPUS_REVIEW_REPAIR_2_2026-10-11.md` (same artifact and checks)
- Requested reviewers: gpt-6.1-sol / xhigh and claude-opus-5-5 / xhigh, independent clean sessions
- Accepted architecture artifact: `docs/STAGE_300_REMEDIATION_DESIGN.md` SHA256
  `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2` (unchanged; its header still
  says DRAFT to preserve the approved identity). Architecture approval evidence:
  `reviews/STAGE_300_ASTRA_DESIGN_REVIEW_7_2026-10-11.md`,
  `reviews/STAGE_300_FABLE_DESIGN_REVIEW_7_2026-10-11.md`, review 7 receipts.
- Implementation: one writer session, `claude-opus-5-5`, native Anthropic subscription (medium for
  the initial implementation, xhigh for repairs). No paid, network or provider call; no
  `.env.local` read; no other agent; no B1/B2/C work.
- Dirty-file hashes: starting baseline `/tmp/ltw-stage300-checkpoint-a/repair2-baseline.json`
  (81 entries, verified without mismatch before work); final manifest of every dirty file except
  this request: `/tmp/ltw-stage300-checkpoint-a/repair2-final-manifest.txt` (83 lines).
- Status: AWAITING_SOL_AND_OPUS_REVIEW

## Review Objective

Try to break checkpoint A as a whole, and these contracts in particular:

1. No composition path constructs a remote adapter, reveals a provider key or dispatches a request,
   whatever keys, routes or approvals exist. Live evaluation refuses before configuration or
   provider construction; offline evidence is written once to fresh directories.
2. The PostgreSQL store never admits beyond any of the four mandatory positive ceilings (account
   global UTC day, campaign UTC day, cumulative stage grant, play-session/evaluation-run) across
   processes, restarts, approval rotation, revisions, session changes and UTC midnight.
3. Accounting never lowers a charge or double-settles. It never refunds an uncertain hold, never
   discards a differing later charge, and counts evidence on open attempts. A batch closes nothing
   without existing terminal accounting; a caller outcome is never proof that a provider attempt
   finished.
4. Every database wait is bounded by its absolute deadline, and nothing is sent after expiry. The
   stored request deadline never exceeds the caller's remaining time at insert. An unconfirmed or
   ambiguously answered COMMIT is never reported as success or as a confirmed rollback.
5. A live caller outcome and its trace commit only while database time is within the stored caller
   deadline plus 5,000 ms, through every wait, write and COMMIT, regardless of the deadline the
   caller passes. Otherwise nothing usable remains, and recovery stays possible.

## Changes in this repair (against the starting baseline)

```text
A  60d9ff89884b94c386d52c67ab3c1fd8907dfde324c5c9769fdfe3a223e7033a  apps/server/migrations/0006_ai_outcome_window.sql
M  febab48d1873302d6afa9f0656ec36fc944f415452577eaf085c91246aad5ec8  apps/server/src/ai/accounting/pg-transaction.ts
M  e453d6b15461cd6d10feeacc92016554841fade61bd76fa4764dd72828ddaaa5  apps/server/src/ai/accounting/request-journal.ts
M  f76e5d41d408d049ab4de9ea37a1377061428ae13b293d87bbcb5d87066c66ec  apps/server/src/ai/accounting/pg-transaction.test.ts
A  5aa7704e778199589705fcd05faa24282fdd8610490ced0a9c4b4d8e0c14da65  apps/server/src/ai/accounting/finalizer-window.integration.test.ts
M  0a65030824d0ae3ac4cfbf7cd155b865da6e6baf585d5d0a4e9c447c29c33907  apps/server/src/ai/accounting/request-journal.integration.test.ts
M  462a2b86aaa9ebc1dd6a805020f4a3c7b37e7b8e85a0f51b48bf72b44971eb82  apps/server/src/ai/accounting/transaction-bounds.integration.test.ts
M  951474470f5f9b6f6e79324168e8301049e2dbdf26f0239ba64c0936632738d3  apps/server/src/testing/accounting.ts
M  f52c53bf67f0ce8999a5693021ae083858f449eb82027ebc126ae49a77e7aacc  apps/server/src/ai/accounting/AGENTS.md
M  0198722367eb51aacb21e3373ec5642b4e432911ddf435e94a021569b4f7d3a7  apps/server/migrations/AGENTS.md
M  e1340dddd86ba241c849c071a3a369b228e4b26d0b064ceeacd60074abd7f14d  docs/AI_CONTEXT_MAP.md
M  75e46aacfcb13efaeed455be02c88b677e41b328c05baae37b0c56ad75383bc9  docs/adr/0032-live-ai.md
A  d5052c2e645a03e471f99186f5675ac0bfe4540f366ad6c8d103db49daa49922  (previous request version, archived byte-for-byte under handoffs/)
M  (this file)                                                         handoffs/STAGE_300_CHECKPOINT_A_REQUEST.md
```

Every other baseline entry is byte-identical, including migration `0005_ai_accounting.sql`
(`48c3247d…5128`, already applied and never edited), all other accounting modules, composition,
configuration, `main.ts`, the evaluation CLI and all administrative and review files.

### Requirement: the finalizer's stored cutoff

**Counterexample (real PostgreSQL), before this repair:** the request's stored window had 300 ms
left. Only the answer to the finalizer's window check was delayed, by 450 ms, and `finalize` was
called with a 5,000 ms caller deadline. It returned `recorded`; the outcome was created about
164 ms after the stored window, a usable trace existed, and recovery was `not-eligible`.

**Repair:**

- `request-journal.ts` `finalize` reads the remaining window from the database (`clock_timestamp()`
  against the stored deadline plus 5,000 ms) both before and after taking the request lock. Each
  time, it clamps the transaction's deadline to _the read's send time plus that remaining
  duration_, so a delayed answer shortens the time left and never extends it.
- The clamp (`Tx.clamp`, which only ever lowers the deadline) bounds every later wait, write and
  COMMIT. The outcome INSERT itself requires the window. A timeout while the window is the binding
  bound returns `window-closed` with nothing committed. A caller deadline can only shorten the window.
- Forward-only migration `0006_ai_outcome_window.sql` adds a database guard. A trigger function
  checks every `live` outcome against the window on insert, and again while the transaction
  commits (a deferred constraint trigger). It raises SQLSTATE `LT001`, which aborts the outcome
  and trace together. `recovered_incomplete` outcomes are not affected. This enforces the approved
  design §2 cutoff ("never commit a new live outcome after that deadline"); it adds no authority.
- The design's timing remains database-clock based, combined with local monotonic durations; no
  process wall clock is used.

**Controls** (`finalizer-window.integration.test.ts`, real PostgreSQL; 5 of the 6 failed before
the repair, and the in-window writer case is a retained positive control):

- The counterexample above → `window-closed`, no outcome, no trace; recovery `recovered` once the window passes.
- A late answer to the outcome INSERT → `window-closed`, nothing stored, recovery possible.
- A COMMIT executed in the window whose answer arrives 1 s late → thrown `commitUnknown`, never
  `recorded`. Outcome and trace both exist (committed in the window), and recovery defers to them.
- The database guard via raw SQL: a late COMMIT is refused with `LT001` and leaves no outcome or
  trace; a late autocommit insert is refused; recovery then succeeds.
- A live writer holding the request lock past the window cannot commit, and recovery then wins.
- An in-window writer holding the lock commits, and recovery defers to it, also after the window.

### Requirement: commit uncertainty classification

**Counterexample (deterministic driver), before this repair:** BEGIN, `SHOW` and application SQL
completed; the sent COMMIT was answered with `{code: '08007'}`. The result was
`commitUnknown: false`, and the same held for `08006` and `57P01`. Any five-character SQLSTATE was
treated as a known outcome.

**Repair (`pg-transaction.ts`):** an error answered to a sent COMMIT clears the uncertainty only
on definite abort evidence. That means severity `ERROR` and a SQLSTATE from a short positive list:
`40000`, `40001`, `40002`, `40P01`, `23502`, `23503`, `23505`, `23514`, `23P01`, and the window
guard `LT001`. Everything else stays `commitUnknown`, including `08xxx`, `57P0x`, `XXxxx`, `40003`,
FATAL severity, and a missing or localized severity. Admission maps it to detail `COMMIT_UNKNOWN`.

**Controls:**

- `pg-transaction.test.ts` (fake driver):
  - unknown for `08007`, `08006`, `57P01` (FATAL), `XX000`, `40003`, `40001` (FATAL), `40001`
    (no severity) and `22012`;
  - definite for `40001`, `40P01` and `23505` at ERROR;
  - `LT001` maps to a definite window-closed rejection;
  - `Tx.clamp` bounds a later COMMIT and never raises the deadline.
- `transaction-bounds.integration.test.ts` (real PostgreSQL):
  - The server really commits, then the answer is replaced by `08007`/`08006`/`57P01`/`XX000`.
    Admission returns `COMMIT_UNKNOWN`, and the committed hold still blocks the next admission.
  - The server really rolls back, then the answer is `40001` at ERROR. Admission returns
    `STORAGE` and no hold exists.

### Earlier checkpoint A requirements, retained with their controls

- Every database wait (checkout, BEGIN, `SHOW`, timeout settings, application SQL, COMMIT) is
  raced against one absolute deadline. The time is rechecked before each send; a failure destroys
  the connection without awaiting ROLLBACK. Controls: the fake-driver stall tests, and real
  PostgreSQL delayed settings and delayed COMMIT.
- A request start computes the caller's remaining time as its INSERT is sent. Control: a real
  PostgreSQL 250 ms settings delay on a 2,000 ms request stores a window of at most 1,750 ms.
- A batch requires every included attempt to have terminal accounting already, and only appends
  non-reducing evidence. Control: a caller TIMEOUT outcome and a `recovered_incomplete` outcome
  with pending attempts are refused with `ATTEMPTS_UNRESOLVED`, and the hold is unchanged.
- The settlement transition key covers the whole payload. An identical repeat is a duplicate; a
  different one is appended as evidence with its stop. Control: settling 300 then 900 on a 500
  hold (session 1,000) yields evidence, effective 900 and an OVERRUN stop; a further 700 is
  blocked, and there is one terminal row.

## Authoritative Documents

`ARCHITECTURE_INVARIANTS.md` (2, 11, 18, 21, 22); the approved design (hash above): §1, §2, the §4
paragraph on checkpoint A, and "Checkpoints and required evidence" A; `docs/adr/0032-live-ai.md`
amendments (historical-results caveat, operational store, repair notes); `docs/adr/0017-ai-gateway.md`;
`work-orders/OPUS_STAGE_300.md`; `docs/PROJECT_WORKFLOW.md` (current policy);
`apps/server/src/ai/accounting/AGENTS.md`; `apps/server/migrations/AGENTS.md`.

## Surfaces Available to Reviewer

- API/routes: unchanged at A; every AI route runs on the local provider (relevance has none).
- CLI/test harness:
  - `pnpm ai:operator <command>` (after `pnpm build`; use throwaway databases for mutations);
  - `pnpm eval:ai` (refuses) and `pnpm eval:ai --offline [capability] [--out dir]`;
  - unit tests `apps/server/src/ai/accounting/*.test.ts`;
  - integration tests `apps/server/src/ai/accounting/*.integration.test.ts`, with
    `apps/server/src/testing/accounting.ts`: throwaway databases, plus `delayedResponsePool` and
    `answeredCommitPool` for delayed or replaced answers from a real server.
- Logs: startup logs counts-only `AI accounting status`, disabled remote routes, and an ignored
  `LTW_AI_DAILY_BUDGET_USD`.

## Start / Reproduce

```text
pnpm db:up
pnpm exec vitest run --project unit apps/server/src/ai apps/server/src/testing/eval apps/server/src/platform/config
pnpm exec vitest run --project integration apps/server/src/ai apps/server/src/platform/db
pnpm validate
pnpm eval:ai            # expect exit 2, refused
```

## Validation run by the writer

| Command                                                | Result                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New repair-2 controls against the unrepaired code      | 19 FAIL as expected (10 fake-driver, 9 real PostgreSQL); the definite-abort and in-window-writer controls passed before and after                                                                                                                                               |
| Focused unit (`ai`, `testing/eval`, `platform/config`) | PASS 86 tests, twice                                                                                                                                                                                                                                                            |
| Focused integration (`ai`, `platform/db`)              | PASS 9 files / 70 tests, twice                                                                                                                                                                                                                                                  |
| `finalizer-window.integration.test.ts` alone           | PASS 12 of 12 consecutive runs (after a timer-precision fix in the window mapping, below)                                                                                                                                                                                       |
| `pnpm validate`                                        | PASS, exit 0, 93 s: format, lint, typecheck, context budget (633 files, 0 over target), unit 176 files / 1674 tests, build, migrate (applied `0006_ai_outcome_window` to the development database; no operator records written), seed, integration 28 files / 138 tests, e2e 45 |

A note on timing precision: Node timers may fire a fraction of a millisecond before
`performance.now()` reaches a deadline. So `finalize` decides `window-closed` on a timeout by
whether the database window was the binding bound, not by re-reading the clock. Before that change
the late-write control failed intermittently (3 of 14 full-file runs); after it, 0 of 12.

## Known Limitations and remaining risks

- A is a foundation. No use case calls the store, request journal or finalizer yet (B2). No verified
  pricing catalog exists, so nothing can be admitted for real. Billing identity is operator-attested.
- Overrun and discrepancy stops apply to the approval only. A sibling approval on the same account
  and model is still admitted, so an account-level provider/model stop on overrun needs an
  architecture decision before live enablement.
- The campaign UTC-day bucket is shared across approvals, but each approval compares it with its
  own campaign ceiling, so the effective daily cap is the largest ceiling among the approvals used.
- The trace digest covers the caller's exact string, while `ltw_ai_traces.trace` is stored
  normalized as `jsonb`. The worst case is a false `conflict`, never an overwrite; reconcile the
  wording or the digest at B2 without casually switching to canonical JSON.
- Recovery holds the exclusive policy lock while waiting up to 5 s on a busy request lock
  (availability only). Admission does not check that the stored request is still open.
- After client-side abandonment, server work continues until the transaction-local timeouts set
  from the same deadline, or until the backend notices the disconnect.
- The commit guard is a deferred constraint trigger: it is checked during COMMIT processing, and
  the commit record follows in the same server operation. The request lock excludes recovery
  throughout. A session that sets the constraint IMMEDIATE would skip the commit-time recheck (the
  insert-time trigger still checks); application code never does this.
- A `COMMIT_UNKNOWN` admission leaves a possibly committed hold that only an operator
  reconciliation releases at A. The design's single live-process pre-dispatch release keyed by
  attempt ID (a no-op if absent) is B2 wiring.
- Batches cannot close open holds: open attempts are closed by per-attempt operator reconciliation.
  Batch-level closure would need an architecture decision on attempt-completion proof (for example
  provider-attested billed usage per attempt).
- `startRequest` reports any failure as `UNAVAILABLE`, except caller expiry.
- The historical-evidence path guard is lexical (symlinks), but files are never overwritten. The
  architecture scan for remote-adapter imports skips `src/testing/`.
- A COMMIT answered at a localized severity (non-English server `lc_messages`) is conservatively
  treated as unknown.

## Deferred (not implemented)

B1 (adapter outcome classification, prepare/dispatch, fallback transitions, intent decline envelope,
route validation, `AdmittedProvider`, ADR 0017/0032 deltas), B2 (request lifecycle and
whole-request deadlines, admission/finalizer/recovery wiring, nullable trace IDs, accounting
diagnostic route, NPC `accountingSessionId`, cache accounting, removal of the A construction guard,
and verification that Chronicle's frozen representation preserves the returned template/provider
agreement where legacy traces have `paragraphs: null`), C (evaluation admission, semantic oracles,
reporting, client feedback). Pending owner dispositions: ceiling entry through the operator CLI;
local-only preparation and closed-session Chronicle. Gate 06 is not satisfied by this checkpoint.

## Coverage Ledger

Due at A and reproducible: composition offline guarantee; the durable store (admission, settlement,
evidence, stops, locks, deadlines, commit uncertainty); operator records and CLI; the request
journal (start, finalizer cutoff, recovery); evaluation CLI guards. B1/B2/C surfaces are not tested
here. Gate 01–05 boundaries: no context builder, prompt, route, contract or UI change at A.

## Required Output

Return a separate report for each exact output path above, with PASS/FAIL evidence. Reviewers do
not modify implementation or inspect any other reviewer's work or verdict. End with PASS or FAIL
and STOP. Neither approval alone advances B1.

## Checkout ownership

CHECKPOINT_READY. The writer session releases checkout ownership with this request and makes no
further edits unless ownership is explicitly transferred back.

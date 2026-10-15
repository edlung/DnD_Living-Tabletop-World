# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint A (repair 1)

- Gate: intermediate checkpoint — Stage 300 remediation A (durable admission, trusted metadata,
  accounting journal). Not Gate 06.
- Review type: RETEST (bounded re-review of repair 1)
- Completed stage: Stage 300 remediation checkpoint A only (B1, B2, C not started)
- Revision/commit: uncommitted working tree on branch `stage-300-live-ai` over HEAD
  `406904343bfe8542640035564d3e044561824125` (source baseline `bc6c116`). No commit or push.
- Prior reports: `reviews/STAGE_300_CHECKPOINT_A_SOL_INITIAL_2026-10-11.md` (FAIL: P1 deadlines,
  P2 stored deadline, P1 batch) and `reviews/STAGE_300_CHECKPOINT_A_OPUS_INITIAL_2026-10-11.md`
  (FAIL: F1 settlement key). Initial request preserved byte-for-byte as
  `handoffs/STAGE_300_CHECKPOINT_A_INITIAL_REQUEST_2026-10-11.md` (SHA256 `d6cf5a8a…6e82`).
- Required output paths: `reviews/STAGE_300_CHECKPOINT_A_SOL_REREVIEW_1_2026-10-11.md` and
  `reviews/STAGE_300_CHECKPOINT_A_OPUS_REREVIEW_1_2026-10-11.md` (same artifact and checks)
- Requested reviewers: gpt-6.1-sol / xhigh and claude-opus-5-5 / xhigh; the same clean reviewer
  sessions may perform this bounded re-review
- Accepted architecture artifact: `docs/STAGE_300_REMEDIATION_DESIGN.md` SHA256
  `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2` (unchanged); approval evidence
  in `reviews/STAGE_300_{ASTRA,FABLE}_DESIGN_REVIEW_7_2026-10-11.md` and review 7 receipts.
- Repair session: the same implementation session (`7f6a4deb-68d2-4865-a195-f68c65553d07`),
  `claude-opus-5-5`, xhigh (review repairs), native Anthropic subscription. No paid, network or
  provider call; no `.env.local` read; no other agent; no B1/B2/C work.
- Dirty-file hashes: repair baseline `/tmp/ltw-stage300-checkpoint-a/repair1-baseline.json`
  (verified, 76 entries, no mismatch before work); final manifest of every dirty file except this
  request: `/tmp/ltw-stage300-checkpoint-a/repair1-final-manifest.txt` (77 lines).
- Status: AWAITING_SOL_AND_OPUS_REREVIEW

## Repair delta (against `/tmp/ltw-stage300-checkpoint-a/frozen-artifact.json`)

Every other entry of the frozen artifact is byte-identical. `docs/PROJECT_WORKFLOW.md` and the
review reports/receipts changed before this repair (orchestrator) and match the repair baseline.

```text
M  7ccda35d27152d594613c9a922b71fda70b1886b98c170da2db377e3420a2e65  apps/server/src/ai/accounting/pg-transaction.ts
A  3d4e5e67c97af5cbfdb59dc6901677483530cfa914a1ac10a183e8b14381fbcf  apps/server/src/ai/accounting/pg-transaction.test.ts
M  a2b16cb1db2e5f68eb9e037a61527a2e698633e66d0f13290dca5409b5db662b  apps/server/src/ai/accounting/request-journal.ts
M  4c5dd5a2d68976bb589064e21fceeb8715264b6461bb375be9519b6db046c768  apps/server/src/ai/accounting/admission.ts
M  5117a9b0d03f7045c714524e797cff3acdd4ae0c33dcf0e027db8223db474196  apps/server/src/ai/accounting/types.ts
M  11dab15623df003159ab39ed3e0e408baebe4505668bfb50c4919137e759c028  apps/server/src/ai/accounting/operator-store.ts
M  5f2564ccaa79506077c024a206c09dacf063a0e8b07a0dd1eec9e8864fdc857f  apps/server/src/ai/accounting/settlement.ts
M  612d675ef35158610c406c9a1bebabcecf610c969aa71f697bb0f0e0cdcee5ff  apps/server/src/ai/accounting/request-journal.integration.test.ts
M  5a0427cb662491534c688beddca30aabb5b5134cfab3fe0002cb75690e822261  apps/server/src/ai/accounting/transaction-bounds.integration.test.ts
M  6cf2e163716cf5402588a4086884a5f2ed7e31723389a2b5d1a2c132b2e83acf  apps/server/src/ai/accounting/operator.integration.test.ts
M  faa5b758dc25228b39e12763d0b01b0472aa4d02a69a0ba7265e809daf9085a4  apps/server/src/ai/accounting/settlement.integration.test.ts
M  7900f098c6ae87a5318339cb0a935afc7ba1b312623f5152804a8e3def6f607b  apps/server/src/testing/accounting.ts
M  c45af9b334dd94644fb87358030ebc3503df7cd0cc1ad63fbe8e7224b1e09843  apps/server/src/ai/accounting/AGENTS.md
M  06e0012f3199cba775c0adb1b5db60d12db674642ed88c4dbc56cf6ed8980445  docs/adr/0032-live-ai.md
A  d6cf5a8a45ffaf6d2d3d2e639cef2a9bd51a6f527819fecfe3060e48e5056e82  handoffs/STAGE_300_CHECKPOINT_A_INITIAL_REQUEST_2026-10-11.md
M  (this file)                                                         handoffs/STAGE_300_CHECKPOINT_A_REQUEST.md
```

Unchanged since the frozen artifact: migration `0005_ai_accounting.sql` (`48c3247d…5128`), all
other accounting modules, composition, config, `main.ts`, eval CLI, and all pre-existing
administrative files.

## Finding-to-fix mapping

| Finding                                                   | Repair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Regression controls (all failed before the repair)                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sol P1: database waits escape the absolute deadline       | `pg-transaction.ts`: each statement (BEGIN, `SHOW`, timeout settings, application SQL, COMMIT) is raced against the absolute deadline and the time is rechecked immediately before it is sent. A failure destroys the connection at once; ROLLBACK is never awaited (and never needed: COMMIT was not sent). A sent but unconfirmed COMMIT raises `StorageUnavailable` with `commitUnknown: true`; admission maps it to detail `COMMIT_UNKNOWN`. That is not a confirmed rollback and never refunds. | `pg-transaction.test.ts` (fake driver: stalled settings, BEGIN, `SHOW`, COMMIT, cleanup; normal path; late parameter evaluation); `transaction-bounds.integration.test.ts` "never sends application SQL after a delayed settings response" and "reports an unconfirmed COMMIT as unknown and never treats its hold as absent" (real PostgreSQL: COMMIT executes, its answer is delayed; the hold persists and still denies a later admission) |
| Sol P2: request start extends the stored deadline         | `Tx.query` accepts parameters as a function evaluated after every preparatory wait, just before sending; `startRequest` computes positive remaining caller time there (else timeout).                                                                                                                                                                                                                                                                                                                | `request-journal.integration.test.ts` "subtracts delayed timeout settings…" (real PostgreSQL, 250 ms settings delay, 2,000 ms request: stored window ≤ 1,750 ms; before: ≈ 1,990 ms)                                                                                                                                                                                                                                                          |
| Sol P1: batch treats caller outcome as attempt completion | `recordBatchEvidence`: an included attempt is resolved only if it already has terminal accounting (settlement, proven pre-dispatch release, or per-attempt reconciliation). Otherwise the batch is rejected `ATTEMPTS_UNRESOLVED` and the hold is untouched. Caller outcomes are no longer consulted. Batches append only non-reducing evidence and never write a terminal row.                                                                                                                      | `operator.integration.test.ts` "never treats a caller outcome as proof that a provider attempt finished" (live TIMEOUT outcome and a `recovered_incomplete` outcome with pending attempts; allocation 10 against a 500 hold is refused, effective charge stays 500, no batch rows); batch coverage/window/allocation and evidence tests rewritten with terminal attempts                                                                      |
| Opus F1: same settlement key discards a different charge  | `settlementKey` = `settle:<attempt>:<sha256(charge, sorted usage, returned model, provider request ID)>`. An identical payload is `duplicate`; a different one is appended as `evidence` through `stopForCharge`.                                                                                                                                                                                                                                                                                    | `settlement.integration.test.ts`: 300 then 900 on a 500 hold / session 1,000 → `evidence`, effective 900, OVERRUN, 700 blocked (STOPPED; after clearance still BUDGET_DENIED:SESSION), one terminal row; corrected reconcile-then-late-settle (250 is now `evidence` + DISCREPANCY, its repeat `duplicate`); same charge with different usage → non-reducing evidence, usage key order irrelevant                                             |

Design conformance notes for reviewers:

- Batches no longer close open holds. The approved design permits "a terminal reconciliation or
  non-reducing evidence per included attempt", but its only proof of completion the store can check
  without new authority is existing terminal accounting. The repair therefore uses the conservative
  subset. Open crash-held attempts are closed by the per-attempt operator reconciliation the design
  already specifies (`attempt-reconcile`, recorded owner authorization). If batch-level closure of
  open attempts is wanted later, the minimal options for an architecture gate are: (a) a
  provider-attested per-attempt completion record (for example a provider request ID with billed
  usage) accepted as proof; or (b) an explicit operator attestation per attempt inside the batch,
  equivalent to per-attempt reconciliation. Neither is implemented.
- The finalizer window and trace digest behaviour are unchanged and still follow the approved
  design. The digest still covers the caller's exact string; Opus risk 2 is preserved as deferred.

## Validation run by the repair session

| Command                                                                                                               | Result                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New/changed controls against the unrepaired code                                                                      | 14 FAIL as expected (6 unit fake-driver, 8 integration)                                                                                                                                                                 |
| `pnpm exec vitest run --project unit apps/server/src/ai apps/server/src/testing/eval apps/server/src/platform/config` | PASS 73 tests (twice)                                                                                                                                                                                                   |
| `pnpm exec vitest run --project integration apps/server/src/ai`                                                       | PASS 7 files / 55 tests (twice); accounting alone 6 files / 50 tests                                                                                                                                                    |
| `pnpm validate`                                                                                                       | PASS, exit 0, 89 s: format, lint, typecheck, context budget (631 files, 0 over target), unit 176 files / 1661 tests, build, migrate (0005 already applied, nothing new), seed, integration 27 files / 128 tests, e2e 45 |

Timing controls use stalls well beyond their deadlines (for example a 400 ms stall against a
40 ms deadline, asserted under 300 ms) so a loaded parallel run cannot make them pass or fail
spuriously.

## Review Objective

Bounded re-review: confirm each of the four findings is resolved without weakening anything the
initial reviews verified. Try to break: no database wait may outlast its absolute deadline; no
statement is sent after expiry; an unconfirmed COMMIT is never reported as success or as a
confirmed rollback, and its possible hold is never released; a stored request deadline never
exceeds the caller's remaining time at insert; no batch lowers or closes a hold without existing
terminal accounting; no different settlement payload is discarded and no charge is lowered.

## Authoritative Documents

`ARCHITECTURE_INVARIANTS.md`; the approved design (hash above) §1, §2 primitives and checkpoint A;
`docs/adr/0032-live-ai.md` amendments (now including "Deadlines (repair 1)" and the settlement/batch
sentences); `apps/server/src/ai/accounting/AGENTS.md`; both initial reports; the preserved initial
request for the unchanged surfaces.

## Surfaces Available to Reviewer

As in the initial request: integration tests under `apps/server/src/ai/accounting/` with
`apps/server/src/testing/accounting.ts` (throwaway databases; new `delayedResponsePool` helper for
real-PostgreSQL delayed-response controls); `pg-transaction.test.ts` (no database); `pnpm
ai:operator`, `pnpm eval:ai`. No route, contract, UI, composition or migration change.

## Start / Reproduce

```text
pnpm db:up
pnpm exec vitest run --project unit apps/server/src/ai/accounting/pg-transaction.test.ts
pnpm exec vitest run --project integration apps/server/src/ai/accounting
pnpm validate
```

## Known Limitations and remaining risks

Preserved from the initial request (still true): A is a foundation with no use-case callers; no
verified pricing catalog; operator-attested billing identity; startup status is counts only;
`docs/PROJECT_WORKFLOW.md` status is orchestrator-owned.

New with this repair:

- After a client-side abandonment, server work continues until the transaction-local
  `statement_timeout`/`lock_timeout` (set from the same deadline) fires or the backend notices the
  disconnect. A statement already in flight therefore holds its locks until then.
- A COMMIT-unknown admission leaves a possibly committed hold. At A nothing releases it except an
  operator reconciliation. B2 may use the design's one bounded live-process pre-dispatch release
  keyed by attempt ID, which is a no-op if the row is absent.
- Batch evidence cannot close open holds (see the design conformance note).

Opus initial non-blocking risks, preserved as deferred and not changed here:

1. An overrun stops only its approval; an account-level provider/model stop on overrun needs an
   architecture decision before live enablement.
2. The trace digest is over the caller's string, while `ltw_ai_traces.trace` is `jsonb`; reconcile
   the wording or digest at B2 without casually switching to canonical JSON.
3. Recovery holds the exclusive policy lock while waiting on a slow request lock.
4. Admission does not check that the request is still open in the database.
5. Superseded by the batch repair above.
6. Superseded by the deadline repair above (BEGIN/`SHOW`/COMMIT are now client-bounded too).
7. Weaker-than-named tests (lock-order sorting, the architecture scan skipping `testing/`, 3-of-12
   append-only tables).
8. Lexical historical-evidence guard (symlinks); the finalizer's window check precedes its inserts.

## Deferred (unchanged)

B1 (adapter outcomes, prepare/dispatch, fallback transitions, intent envelope, routes,
`AdmittedProvider`, ADR 0017/0032 deltas), B2 (request lifecycle and deadlines, admission/finalizer/
recovery wiring, nullable trace IDs, diagnostic route, NPC `accountingSessionId`, caching, removal of
the A construction guard, and the Chronicle `paragraphs: null` template/provider agreement
verification), C (evaluation admission, oracles, reporting, client feedback). Pending owner
dispositions: ceiling entry via operator CLI; local-only preparation/closed-session Chronicle. Gate
06 is not satisfied by this checkpoint.

## Required Output

Return a separate report for each exact output path above with PASS/FAIL evidence. Reviewers do not
modify implementation or inspect their peer's current verdict. End with PASS or FAIL and STOP.
Neither approval alone advances B1.

## Checkout ownership

CHECKPOINT_READY. The repair session releases checkout ownership with this request and makes no
further edits unless ownership is explicitly transferred back.

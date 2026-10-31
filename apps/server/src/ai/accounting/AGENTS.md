# AI spending accounting

Stage 400 / ADR 0038: `preparation-sessions.ts` implements operator owner→approval
grants and real job-bound preparation sessions (migration 0018 after jobs0017).
Preparation requests/attempts/traces have null campaign IDs and explicit workshop
owner/draft subjects. Never create a fake campaign, play session or evaluation run.
Admission rechecks current grant, enabled account/approval, explicit unlimited
policy, live auth session, RUNNING job, fence and lease. Legacy play/evaluation
capabilities cannot consume a preparation session. Account/stage accounting is
shared; `subjects.ts` and new subject/session buckets retain old campaign lock
identities. Settlement uses persisted subject fields. `preparation-grant` is the
recorded operator path; no request body or environment flag grants authority.

Stage 380 / ADR 0038 (owner disposition 2026-10-30): monetary limits may be
explicitly `UNLIMITED`. `monetary-policy.ts` reads/appends durable policy revisions
in migration 0014; `monetary-policy-set` is the operator path, with recorded owner
authorization. No missing record, numeric sentinel, env setting or route parameter
means unlimited. Historical finite approvals and every accounting row remain.
Unlimited text policy is scoped to a billing account; images have their existing
installation-wide ledger scope. All identity/eligibility/nonmonetary checks remain.
Only valid, source-resolved `OVERRUN` stops are superseded by unlimited policy.
`DISCREPANCY`, suspect billing/model stops and malformed/unknown evidence still deny.

Stage 400 preparation is a real workshop subject/session, not a campaign or play
session. Read `preparation-sessions.ts`, `subjects.ts`, the job-bound journal and
`../preparation-gateway.ts`; migration0018 adds nullable campaign IDs and explicit
workshop owner/draft columns. Admission rechecks the live job/fence/lease/auth
session, enabled owner grant and explicit unlimited policy on every attempt.
Legacy campaign bucket lock identities stay unchanged. Preparation has separate
subject/session buckets; account/global/stage accounting still includes all work.
Campaign trace reads cannot return workshop rows. Never synthesize a play or
evaluation session, reinterpret a campaign cookie or infer a grant from a key.

Durable admission, accounting journal and operator records for live AI
(`docs/adr/0032-live-ai.md`, amendment 2026-10-11; `docs/STAGE_300_REMEDIATION_DESIGN.md` §1–2).
Schema: `apps/server/migrations/0005_ai_accounting.sql` (append-only),
`0006_ai_outcome_window.sql` (live outcomes commit only inside their finalizer window) and
`0007_ai_outcome_code.sql` (the caller outcome's fallback code) and `0008_ai_attempt_responses.sql`
(provider request IDs). Checkpoint B2: every AI request
starts and finalizes through `ai/journal.ts`, and every remote attempt is admitted, settled or held
by `ai/admitted-provider.ts`. Stop scope follows the approved B2 delta
(`docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md`): `stop-scope.ts` is the one admission predicate.

| File                                                          | Responsibility                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `types.ts`                                                    | `BudgetStore` port, session classes, admission/settlement results, rejections                  |
| `monetary-policy.ts`                                          | Explicit finite/unlimited revisions, operator scope/authorization, status; migration 0014      |
| `money.ts`                                                    | Integer microdollars: per-dimension `ceil`, tiers, reservation at highest rate                 |
| `lock-keys.ts`                                                | Policy `-1`, nonnegative bucket/account keys, negative request keys, ordering                  |
| `deadline.ts`                                                 | Monotonic deadlines; storage step = MIN(request, 5 s); fixed 5 s steps                         |
| `pg-transaction.ts`                                           | Every DB wait raced against one deadline; READ COMMITTED; unknown-COMMIT flag                  |
| `spend.ts`                                                    | Effective spend per bucket (max of absolute charges / hold), appending stops                   |
| `stop-scope.ts`                                               | What an uncleared stop forbids: accepted shapes, recorded and source routes                    |
| `stop-diagnostics.ts`                                         | Trusted operator explanation of each uncleared stop (`ai:operator stops`)                      |
| `admission.ts`                                                | The admission transaction (canonical model check, stop scope, ceilings)                        |
| `settlement.ts`                                               | Settle, pre-dispatch release, idempotent suspect hold, retry schedule                          |
| `attempt-responses.ts`                                        | Provider request ID of an attempt, idempotent (migration 0008)                                 |
| `request-journal.ts`                                          | Request start, outcome+trace finalization, per-request recovery                                |
| `recovery.ts`                                                 | `recover-incomplete` sweep (operator CLI only)                                                 |
| `operator-store.ts`                                           | Accounts, approvals, revisions, runs, clearances, reconciliation, batches                      |
| `operator-args.ts`, `operator-commands.ts`, `operator-cli.ts` | `pnpm ai:operator` parsing, dispatch, entry; image ceiling, orphaned reservations (ADR 0035)   |
| `postgres-budget-store.ts`                                    | `PostgresBudgetStore` (with the catalog's identity resolver), startup status, `approvalExists` |
| `spend-report.ts`                                             | `ai:operator spend` (read-only): per account and approval, open holds; the image ledger        |

- PostgreSQL is the only spending authority. Never add an in-memory or environment cap to production.
- One READ COMMITTED transaction per operation on one checked-out client; shared policy lock for
  accounting, exclusive for every operator mutation and recovery; sorted bucket locks before reading
  totals; never nest a bucket lock inside a request lock.
- Charges are absolute; effective charge is a maximum. Never subtract, delete or update history.
- Stops: one immutable row, two effective restrictions (recorded predicate OR, for overruns and
  discrepancies, the source attempt's account/provider/canonical model on every approval and day).
  An unexpected shape, a missing or mismatched source, or an identity the verified registry cannot
  map fails closed for the account. Only an operator clearance lifts a nonmonetary stop; a valid
  monetary overrun may be superseded by explicit unlimited policy without deleting it. Campaign views never
  show stops. Identities resolve through `ai/catalog.ts`; tests use `TEST_RESOLVE` or fixtures.
- A caller outcome never proves a provider attempt finished: only terminal accounting resolves an
  attempt. An unconfirmed COMMIT may have committed: never treat its hold as absent. Only definite
  abort evidence (ERROR severity and a listed SQLSTATE) clears that uncertainty.
- A live outcome commits only inside its stored finalizer window (database clock); `finalize`
  clamps to it and migration 0006 guards the commit. A caller deadline can only shorten it.
- Operator commands need recorded owner authorization; the CLI authorizes nothing by existing. Run
  them only against the intended database; tests use throwaway databases (`src/testing/accounting.ts`).
- The image ceiling is a separate ledger (`src/images/ledger.ts`, migration 0011): `image-budget-set`
  appends a revision, and `status` adds its counters (amounts in microdollars) for the operator
  only; startup logs keep `accountingStatus` counts only. `image-reservations` (read-only) lists
  unsettled image reservations older than the given minutes; `image-reservation-settle` closes an
  orphaned one (older than 15 minutes) whole, or at an explicit amount, with the owner's
  authorization (`src/images/ledger-operator.ts`, migration 0012).
- Integration tests: `*.integration.test.ts` here (two-connection competition, REPEATABLE READ
  negative control, timeouts, stops, recovery races).

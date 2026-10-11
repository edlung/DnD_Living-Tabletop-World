# AI spending accounting

Durable admission, accounting journal and operator records for live AI
(`docs/adr/0032-live-ai.md`, amendment 2026-10-11; `docs/STAGE_300_REMEDIATION_DESIGN.md` §1–2).
Schema: `apps/server/migrations/0005_ai_accounting.sql` (append-only) and
`0006_ai_outcome_window.sql` (live outcomes commit only inside their finalizer window). Stage 300 remediation
checkpoint A: the store exists and is tested, but no use case calls it yet; composition stays local.

| File                                                          | Responsibility                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `types.ts`                                                    | `BudgetStore` port, session classes, admission/settlement results, rejections  |
| `money.ts`                                                    | Integer microdollars: per-dimension `ceil`, tiers, reservation at highest rate |
| `lock-keys.ts`                                                | Policy `-1`, nonnegative bucket/account keys, negative request keys, ordering  |
| `deadline.ts`                                                 | Monotonic deadlines; storage step = MIN(request, 5 s); fixed 5 s steps         |
| `pg-transaction.ts`                                           | Every DB wait raced against one deadline; READ COMMITTED; unknown-COMMIT flag  |
| `spend.ts`                                                    | Effective spend per bucket (max of absolute charges / hold), stops             |
| `admission.ts`                                                | The admission transaction                                                      |
| `settlement.ts`                                               | Settle, pre-dispatch release, suspect hold, retry schedule                     |
| `request-journal.ts`                                          | Request start, outcome+trace finalization, per-request recovery                |
| `recovery.ts`                                                 | `recover-incomplete` sweep (operator CLI only)                                 |
| `operator-store.ts`                                           | Accounts, approvals, revisions, runs, clearances, reconciliation, batches      |
| `operator-args.ts`, `operator-commands.ts`, `operator-cli.ts` | `pnpm ai:operator` parsing, dispatch, entry                                    |
| `postgres-budget-store.ts`                                    | `PostgresBudgetStore` and the counts-only startup status                       |

- PostgreSQL is the only spending authority. Never add an in-memory or environment cap to production.
- One READ COMMITTED transaction per operation on one checked-out client; shared policy lock for
  accounting, exclusive for every operator mutation and recovery; sorted bucket locks before reading
  totals; never nest a bucket lock inside a request lock.
- Charges are absolute; effective charge is a maximum. Never subtract, delete or update history.
- A caller outcome never proves a provider attempt finished: only terminal accounting resolves an
  attempt. An unconfirmed COMMIT may have committed: never treat its hold as absent. Only definite
  abort evidence (ERROR severity and a listed SQLSTATE) clears that uncertainty.
- A live outcome commits only inside its stored finalizer window (database clock); `finalize`
  clamps to it and migration 0006 guards the commit. A caller deadline can only shorten it.
- Operator commands need recorded owner authorization; the CLI authorizes nothing by existing. Run
  them only against the intended database; tests use throwaway databases (`src/testing/accounting.ts`).
- Integration tests: `*.integration.test.ts` here (two-connection competition, REPEATABLE READ
  negative control, timeouts, stops, recovery races).

# Independent Checkpoint Handoff Request — Stage 300 remediation checkpoint A

- Gate: intermediate checkpoint — Stage 300 remediation A (durable admission, trusted metadata, accounting journal). Not Gate 06.
- Review type: INITIAL
- Completed stage: Stage 300 remediation checkpoint A only (B1, B2, C not started)
- Revision/commit: uncommitted working tree on branch `stage-300-live-ai` over HEAD
  `406904343bfe8542640035564d3e044561824125` (source baseline `bc6c116`); manifest below. No commit or push was made.
- Prior report / remediation / retest number: N/A — first acceptance of checkpoint A. Baseline audit:
  `reviews/STAGE_300_AUDIT_DISPOSITION_2026-10-11.md`.
- Required output paths: `reviews/STAGE_300_CHECKPOINT_A_SOL_REVIEW.md` and
  `reviews/STAGE_300_CHECKPOINT_A_OPUS_REVIEW.md` (same frozen artifact and checks)
- Requested reviewers: gpt-6.1-sol / xhigh and claude-opus-5-5 / xhigh, independent clean sessions
- Accepted architecture artifact: `docs/STAGE_300_REMEDIATION_DESIGN.md` SHA256
  `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2` (draft 7; file header still says
  DRAFT to preserve the approved identity). Approval evidence: `reviews/STAGE_300_ASTRA_DESIGN_REVIEW_7_2026-10-11.md`,
  `reviews/STAGE_300_FABLE_DESIGN_REVIEW_7_2026-10-11.md`, `reviews/STAGE_300_DESIGN_REVIEW_7_RECEIPTS_2026-10-11.json`.
  The design file and review snapshots were not edited.
- Implementation: one Claude Code session, `claude-opus-5-5`, medium effort, native Anthropic subscription.
  No paid runtime call, no provider catalog lookup, no `.env.local` read, no other agent invoked.
- Status: AWAITING_SOL_AND_OPUS_REVIEW

## Dirty-file manifest (SHA256)

Pre-existing administrative changes from `/tmp/ltw-stage300-checkpoint-a-baseline.json` are preserved
byte-for-byte, except `docs/AI_CONTEXT_MAP.md`, which checkpoint A had to update (baseline
`1dc6d527…6fbfb`; its earlier dirty content is kept and two rows were edited/added).

Checkpoint A changes (modified `M`, new `A`, deleted `D`):

```text
D  apps/server/src/ai/budget.ts                      (deleted; git shows " D", unstaged)
M  944d444bef6e2305c0d044637bbd58df2c35824673e4df28199cb5490b8c6f63  .env.example
M  ec30c8380bb05c864e9db8a3e6bfc3aac84cd7623ed431a95a13c61ea27c2595  package.json
M  5d1c560850e5c906bc87958365e7d4d609746ddb58b26b016343348b756b1460  apps/server/package.json
M  253e659e15abd2306cdac1eaa8671ced3c81368561f613bc5581790b743a5399  apps/server/AGENTS.md
A  48c3247df1921bc82be4755fe1e64960c096ba883964253dc62dddcee14c5128  apps/server/migrations/0005_ai_accounting.sql
M  bb57850128527f669f2348632d64bf162a445ede5f8cf4fb757e2b1d655b5420  apps/server/migrations/AGENTS.md
A  3a22bd4234ad73abb661557e2cf9c9172a7631dc182fcd85b6909d094fe358ab  apps/server/src/ai/accounting/AGENTS.md
A  3ed7f6d7013397d1bf6d355f9a4386d5004abb62f56d3a83a4dba832246bea8e  apps/server/src/ai/accounting/admission.ts
A  5b0039f813f23c1c2393ef830d26e17b33e8a8d0bd071e87bd3f591be3a543fc  apps/server/src/ai/accounting/admission-ceilings.integration.test.ts
A  17733d96119b2dacec66e7367665068b84f6b995d0158234c7ec1a3088bf894e  apps/server/src/ai/accounting/admission.integration.test.ts
A  e1db10219f2ace2390adcc5bbaac7f5c23445438bf84e578cd61d1f0e39fe5ae  apps/server/src/ai/accounting/deadline.ts
A  ea3d258c600f279749cf8915b7777f1f8cf387db8a2ef5c09ba54af5fadaa9ac  apps/server/src/ai/accounting/lock-keys.ts
A  4fedec7bfed8c75be0337cceadafdc6740e5901a6b23013ecb9b96ce338bda26  apps/server/src/ai/accounting/lock-keys.test.ts
A  6709740c2cdbbd0b90b0b0cd0fdc11360b60f00f3d44250e451b0e353578155a  apps/server/src/ai/accounting/money.ts
A  6cac7a07f154139c08c767544dddaf1c2a9c82dee7acf7090d6c0ba6ec6b475d  apps/server/src/ai/accounting/money.test.ts
A  c8f21267da8341d3022a7ab601b9094b2f1f2cf803182f36eee18e832a36ff62  apps/server/src/ai/accounting/operator-args.ts
A  9f967aa66ae6fb299c8d89377a471ced36632123278e816eed8e48ef220f710a  apps/server/src/ai/accounting/operator-args.test.ts
A  dc702f51970f00d53c8b50d54eb6ba96617e13bdcb686e776f0d5c2da3ceeb0f  apps/server/src/ai/accounting/operator-cli.ts
A  36d8afe0965ff8a4e898852997cba8cd16e4af39d97b97e7f0d77f1129065b42  apps/server/src/ai/accounting/operator-commands.ts
A  baf883b07ab22258d02d170873ab5054d7579343b728b25e718d7853329dd38b  apps/server/src/ai/accounting/operator-store.ts
A  588a4ebe39cbb53d4554f226b11e2163bbfcfb7e8dd018477ee10d1acc415923  apps/server/src/ai/accounting/operator.integration.test.ts
A  983ecb52b039973fe2f5259d5834c7cf0eaef52b93e51844d80c5c6564741039  apps/server/src/ai/accounting/pg-transaction.ts
A  f1017fc480d89e7fe53861d61c874d91858ee75ba285f47b8cb513fd5b7fc09e  apps/server/src/ai/accounting/postgres-budget-store.ts
A  ef25e70a8589dba035ad9f5dcac51dbe9bd55461204920a12145b037bf9b4104  apps/server/src/ai/accounting/recovery.ts
A  852c0102d13c658dfb0a778cf28d92bf0b1d05d3b57258741aa9c3dc21aa2a54  apps/server/src/ai/accounting/request-journal.ts
A  a6adbf571d8ca4b5117507cc9fcb543afc3c40152a77f1df514cca4724816f93  apps/server/src/ai/accounting/request-journal.integration.test.ts
A  a9332d1a9368ebb87ecf9c0df5c617646e7f4b7f6b8039a9cac6c44366ea06d2  apps/server/src/ai/accounting/settlement.ts
A  f4a548ada5602e45a05d44eb14f864e8d3dc211a474845d2dd34eb456a838d5f  apps/server/src/ai/accounting/settlement-retry.test.ts
A  6f3cc52a0092b5f99eb385411c9e634bce2642aacc24871e7a2046135a333dc1  apps/server/src/ai/accounting/settlement.integration.test.ts
A  a3533cfd4f83d1edafb86a82122b0135f4558544b9271f592068649fe2273276  apps/server/src/ai/accounting/spend.ts
A  3b97455a15646d0882eef42be7b0c594bc6a6d2e19891c9271483e2a7b463746  apps/server/src/ai/accounting/transaction-bounds.integration.test.ts
A  a7ebcb75ed7316f679eb7ba16388a45f478709055647a005fbed36793f14cbca  apps/server/src/ai/accounting/types.ts
M  9a1239445bc7c20f4c451798b9406380df78c14ebb53e622d96afc006da8ff6c  apps/server/src/ai/gateway.ts
M  e57439df164bb2b95edf6cfa7e2baf0d5fd2bac73c13d1d26fd5abd7dd5e09dc  apps/server/src/ai/gateway.test.ts
M  70e6d46ca8230e0d869d1853b0ff4052adfe896b074aedab121aa31255831845  apps/server/src/ai/live-ai.test.ts
M  d3ea7dd2bbe5642102693fffdeee4b26183fb727a026eef72691c2c39c9276b3  apps/server/src/main.ts
M  5d0bc01179bc9f7b43065dcec1575c3b36f32a2332d577859840cf56e4aa9d4b  apps/server/src/platform/config/config.ts
M  091880d66c58102f631027536287aadc8b46d52a4bafa3678abdbbe7f4066904  apps/server/src/platform/config/config.test.ts
A  a837e1f444fd87df03d0e93a6ae58d14978e6288f64037747f461512a207cb04  apps/server/src/testing/accounting.ts
M  5f33a41f31d313bfff5643793242c5278f2b8ec449190b0ec202af9474a47162  apps/server/src/testing/eval/eval-cli.ts
A  f7802188293822cea7df7bb4cbb2e278ad85cfa058d82776066adac50cb49f7a  apps/server/src/testing/eval/eval-output.ts
A  30e9192d584ed7d5f7101268dd818d7d6e3b991ba59a8d50d22efaa820460b49  apps/server/src/testing/eval/eval-run.ts
A  d2c5f6cb5eec70766de81cebe5cd6326330b8f62df58fffd156a46c901c4705c  apps/server/src/testing/eval/eval-run.test.ts
A  b5b48bc5aaad02a2e7dffe43ee0f7f2a5b21c85e22e9ccc557aed926e5c9ad66  apps/server/src/testing/eval/eval-runners.ts
M  1ae36fd17d617b32fc3e5350dc337535b946e121d92726bdca1db385a65ce0bc  docs/AI_CONTEXT_MAP.md
M  5033dc9d5f573fab6b05413c5ec59b715ea1fe1611497719e9dc49ac7bbf4bdf  docs/adr/0032-live-ai.md
M  c8ac8174d080d20e41baf39c05c86a031407dd19c054023bbdd150c083299185  packages/ai/AGENTS.md
A  (this file)  handoffs/STAGE_300_CHECKPOINT_A_REQUEST.md
```

Unchanged baseline dirty files (hashes equal the baseline JSON): `AGENTS.md`, `AGENT_WORKFLOW.md`,
`CHECKPOINTS.md`, `EFFORT_MATRIX.md`, `HANDOFF_TEMPLATE.md`, `docs/PROJECT_WORKFLOW.md`,
`docs/STAGE_300_REMEDIATION_DESIGN.md`, `handoffs/AGENTS.md`, `reviews/AGENTS.md`,
`work-orders/AGENTS.md`, and all review 5–7 reports, receipts and draft snapshots.
`docs/PROJECT_WORKFLOW.md` still reads "Checkpoint A: IMPLEMENTING"; updating it is left to the orchestrator.

## Review Objective

Try to break checkpoint A's claims: (1) no build path can construct a remote adapter, reveal a key or
dispatch a request, whatever keys, routes or approvals exist; (2) the PostgreSQL store cannot admit
more than any of the four mandatory positive ceilings across concurrent processes, restarts, approval
rotation, account revisions, session changes and UTC midnight; (3) accounting cannot lower a charge,
double-settle, refund a crash-held attempt, or ignore evidence on an open attempt; (4) locks, isolation
and deadlines behave as the approved design pins (READ COMMITTED only, shared/exclusive policy key
`-1`, sorted bucket/account-control keys, request keys never nested with bucket keys, no zero
timeout, no work after expiry); (5) live evaluation refuses before any configuration or provider
construction and offline evidence never overwrites anything. Check that nothing from B1/B2/C was
prematurely implemented or claimed.

## Authoritative Documents

- `ARCHITECTURE_INVARIANTS.md` (2, 11, 18, 21, 22)
- `docs/STAGE_300_REMEDIATION_DESIGN.md` (exact hash above), §1, §2 primitives, §4 checkpoint-A
  paragraph, "Checkpoints and required evidence" A
- `docs/adr/0032-live-ai.md` — new "Amendments" section (caveat and operational store decision);
  original text preserved
- `docs/adr/0017-ai-gateway.md` (fallback policy unchanged at A)
- `work-orders/OPUS_STAGE_300.md`; `docs/PROJECT_WORKFLOW.md` (current policy)
- `apps/server/src/ai/accounting/AGENTS.md`, `apps/server/migrations/AGENTS.md`

## Surfaces Available to Reviewer

- API/routes: unchanged at A. All AI routes run on the local provider (relevance has none); the
  gateway is `apps/server/src/ai/gateway.ts`.
- CLI/test harness: `pnpm ai:operator <command>` (after `pnpm build`; commands in
  `operator-args.ts`); `pnpm eval:ai` (refuses) / `pnpm eval:ai --offline [capability] [--out dir]`;
  integration tests under `apps/server/src/ai/accounting/*.integration.test.ts` with
  `apps/server/src/testing/accounting.ts` (throwaway databases only).
- UI: none changed.
- Logs/traces: startup logs `AI accounting status` (counts only), disabled remote routes, and ignored
  `LTW_AI_DAILY_BUDGET_USD`. No trace schema change at A.

## Start / Reproduce

```text
pnpm db:up
pnpm validate
pnpm exec vitest run --project integration apps/server/src/ai/accounting
pnpm exec vitest run --project unit apps/server/src/ai apps/server/src/testing/eval apps/server/src/platform/config
pnpm eval:ai            # expect exit 2, "refused"
pnpm build && pnpm ai:operator status
```

Run operator mutations only against a throwaway database; do not create grants in the dev database.

## Test Personas / Scopes

Existing Ravenford personas (DM `dev-dm-ravenford`, player `dev-player-elowen`) for the composition
test. Accounting fixtures use `TEST_AUTH` (owner `test-owner`) in throwaway databases only; these
are not owner authorizations.

## Canonical Secret or Invariant Under Test

Provider keys must never be revealed or used at A (tested with a `Secret` whose `reveal()` throws
and a spied global `fetch`). Spending authority must be the durable store only; no environment value
or approval may set or raise the account's global daily ceiling.

## Finding-to-fix mapping (A scope only)

| Baseline finding / design requirement                                                           | Checkpoint A change                                                                                                                                                           | Evidence                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Concurrent overspending; in-process ledger resets on restart                                    | Durable `BudgetStore` + migration 0005; admission in one READ COMMITTED transaction with shared policy lock and sorted bucket/account locks                                   | `admission.integration.test.ts` (barrier competition, restart), `admission-ceilings.integration.test.ts` |
| Legacy `SpendLedger`/`budgeted`, $5 default, unknown-model price fallback, implicit paid routes | `budget.ts` deleted; `LTW_AI_DAILY_BUDGET_USD` removed (warned if set); composition local-only; a key alone is no route                                                       | `gateway.test.ts`, `live-ai.test.ts`, `config.test.ts`                                                   |
| Float dollar arithmetic                                                                         | Integer microdollars, per-dimension `ceil`, tiers, highest-rate reservation                                                                                                   | `money.test.ts`                                                                                          |
| Four mandatory positive ceilings; global ceiling account-owned                                  | Schema `CHECK > 0`; ceilings only on account (global) and approval (stage, campaign day, play session, evaluation run); CLI refuses a global ceiling on approvals             | `admission-ceilings…`, `operator-args.test.ts`                                                           |
| Duplicate grants / billing accounts                                                             | `UNIQUE` grant reference and provider account reference; revisions FK to the original grant                                                                                   | `operator.integration.test.ts`                                                                           |
| Session identity / stored attribution                                                           | `AccountingSession` play vs evaluation; buckets from the stored request and attempt rows; evaluation needs a registered run pinned to its campaign                            | `admission-ceilings…` (sessions, runs, midnight)                                                         |
| Erased billed outcomes; idempotent settlement; evidence                                         | One terminal row per attempt (partial unique index); absolute charges, effective = max; open attempts count max(hold, evidence); late settle → evidence; stops in-transaction | `settlement.integration.test.ts`, `operator.integration.test.ts` (batch)                                 |
| Auto-stop deadlock; cross-midnight stop                                                         | Account-control lock shared by every day; concurrent overrun settlements                                                                                                      | `settlement.integration.test.ts` (concurrent, midnight)                                                  |
| Isolation, timeouts, stale checkout                                                             | REPEATABLE READ negative control and rejection; positive local timeouts; no work after expiry; late client released untouched; unreachable DB → unavailable                   | `admission.integration.test.ts`, `transaction-bounds.integration.test.ts`                                |
| Exclusive operator mutations                                                                    | Every operator write and recovery takes `-1` exclusively                                                                                                                      | `transaction-bounds.integration.test.ts` (policy lock)                                                   |
| Unique request outcome, recovery primitives                                                     | `startRequest`, `finalize` (outcome + exact trace string atomically under request lock, digest of that string), `recoverRequest`/`recover-incomplete`                         | `request-journal.integration.test.ts`                                                                    |
| False-positive evaluation predicates                                                            | ADR 0032 caveat appended (structural evidence only); CLI checks relabelled structural; oracles remain C                                                                       | ADR diff; `eval-run.test.ts`                                                                             |
| Eval CLI compile, live refusal, immutable output, effective deadline                            | Refuses before config/credentials/provider; strips keys/routes in offline env; no `.env.local` loading in `eval:ai`; fresh `wx` run directories, historical directory refused | `eval-run.test.ts`                                                                                       |

## Validation Already Run by Implementation Writer

| Command                                                                                                 | Result                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate` (format, lint, typecheck, context budget, unit, build, migrate, seed, integration, e2e) | PASS, exit 0, 91 s. Unit 175 files / 1654 tests; integration 27 files / 122 tests; e2e 45; context budget 630 files, 0 over target; migration applied `0005_ai_accounting` to the dev database (no operator records written) |
| `pnpm exec vitest run --project integration apps/server/src/ai/accounting`                              | PASS, 6 files / 44 tests (rerun after validate; included in the validate run)                                                                                                                                                |
| `pnpm eval:ai`; `pnpm eval:ai --live`                                                                   | exit 2, refused; no evidence directory created                                                                                                                                                                               |
| `pnpm ai:operator status` (read-only, dev DB)                                                           | `{"openHolds":0,"activeStops":0,"incompleteRequests":0,"disabledAccounts":0,"disabledApprovals":0}`                                                                                                                          |
| `pnpm ai:operator approval-create --global-daily-ceiling-micros 5`                                      | exit 2, "the global daily ceiling belongs to the billing account"                                                                                                                                                            |
| `pnpm format:check` after the final `.env.example` comment edit                                         | PASS (that comment-only edit came after the validate run)                                                                                                                                                                    |

No paid runtime call, network provider call, or `.env.local` read was made. `pnpm validate`'s
existing `db:migrate`/`seed` scripts load `.env.local` into their own processes, as before.

## Known Limitations

- A is a foundation: no use case calls the store, request journal or finalizer yet. Admission,
  request-start, outcome freeze, finalization and recovery are tested as store primitives only.
- No verified pricing/bounds catalog exists, so no model has a reservation function; `money.ts`
  provides the arithmetic only. Catalog verification is a separately authorized activity.
- `admit` returns an admission that committed even if the caller's deadline passed during commit;
  per design the caller (B2) must not dispatch and the hold stays until a proven pre-dispatch release.
- Batch evidence treats an attempt as "still running" when its request has no caller outcome; caller
  outcomes are only produced once B2 connects finalization.
- The campaign UTC-day bucket is keyed by campaign and day across all approvals (a conservative
  reading recorded in the ADR amendment).
- Billing-account identity is operator-attested (unique reference), not verified with the provider.
- Startup status is logged as counts; it is not exposed over HTTP.
- `docs/PROJECT_WORKFLOW.md` status line not updated by this session (orchestrator-owned).

## Deferred work (not implemented at A)

- **B1:** adapter outcome classification (`TRANSPORT_NOT_STARTED`, refusal, suspect model/billing),
  prepare/dispatch split, fallback transitions, intent decline envelope, route validation
  (three-entry/multi-remote rejection), branded `AdmittedProvider`/local identity registry, ADR
  0017/0032 deltas (missing-tool paid repair, per-attempt timeout at whole-request expiry).
- **B2:** request lifecycle and whole-request deadlines (`LTW_AI_REQUEST_TIMEOUT_MS`), admission
  wiring, outcome freeze/finalizer/recovery integration, nullable trace IDs, accounting diagnostic
  route, NPC `accountingSessionId` capture, caching accounting, removal of the A construction guard.
  **B2 verification obligation:** legacy Chronicle traces have `paragraphs: null` for template
  fallback; the new frozen representation must preserve the actually returned template/provider
  agreement — not verified or claimed at A.
- **C:** evaluation admission, semantic oracles and negative controls, latency/session-cost report,
  private blind key, client feedback; live evaluation remains unauthorized.
- Pending owner product dispositions (not resolved here): ceiling entry via operator CLI rather than
  environment; local-only preparation/closed-session Chronicle. Owner play acceptance remains deferred.
- Gate 06 is a later formal integrated review and is not satisfied by this checkpoint.

## Coverage Ledger

Due at A and reproducible: composition offline guarantee; durable store admission/settlement/
evidence/stops/locks/timeouts; operator CLI parsing and records; request journal primitives;
evaluation CLI guards. Future surfaces (B1 adapters/fallback, B2 lifecycle/diagnostic/caching,
C evaluation/client) are not tested here and must not be labelled as tested. Gate 01–05 boundaries:
no context builder, prompt, route, contract or UI change at A.

## Required Output

Return a separate report for each exact output path above, using PASS/FAIL evidence. Reviewers do
not modify implementation or inspect their peer's current verdict. End with PASS or FAIL and STOP.
Neither approval alone advances B1.

## Checkout ownership

CHECKPOINT_READY. The implementation session releases checkout ownership with this request and will
not edit further unless the orchestrator explicitly transfers ownership back for review repairs.

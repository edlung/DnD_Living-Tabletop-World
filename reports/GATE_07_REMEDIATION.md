# Gate 07 remediation — the four Medium findings

Date: 2026-10-31. Base: `main` `64efe21` (Stages 370–450 merged). Review:
`reviews/GATE_07_SECURITY_REVIEW_2026-10-31.md` (PR #16). Authority:
`reviews/OWNER_GATE_07_DISPOSITION_2026-10-31.json` («Да, исправить»; moderate job bounds; a
separate picture grant). Scope: `work-orders/GATE_07_REMEDIATION.md`. Decision record: ADR 0038
amendment 2026-10-31 (and ADR 0008 for quest identities).

## What changed

| Finding                  | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Where                                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G07-04 NPC disclosure    | An NPC-held record without `disclosure` compiles to no `SetDisclosure`, so it stays GUARDED, the engine's default. The owner's editor offers "Guarded (default)" for the unset value and the inspector shows the effective value; the generation prompt says omitted means GUARDED.                                                                                                                                                                                                                                                                                                           | `packages/domain/src/campaign/plan.ts`; `apps/web/src/workshop/scenario/edit-fields.tsx`, `structured-fields.tsx`; `apps/server/src/workshop/generation/prompt.ts`                                                                                                             |
| G07-03 quest identifiers | Quests and each quest's stages get registry identities (migration 0023: namespaces `quests`, `quest-stages` with key `<quest>/<stage>`), stable across revisions. The compiler rewrites `questId`, `stage` and `after` to `q-`/`s-` and 32 hex digits; the frozen quest book and every player quest log carry only these. A revision saved before them is refused (`QUEST_IDENTITIES_MISSING`) until saved again. The engine's bootstrap command keeps its identity shape (`engineIdentities`): its plan never publishes quests.                                                              | `packages/contracts/src/campaign/package.ts`; `packages/domain/src/campaign/story.ts`, `references.ts`; `apps/server/src/workshop/packages/identities.ts`, `postgres-store.ts`, `compiler.ts`; `activation/proof.ts`, `submission.ts`, `content.ts`; web `response-schemas.ts` |
| G07-02 picture grant     | Append-only per-owner grants (migration 0024; `pnpm ai:operator picture-grant`). Checked when pictures are offered (`NO_GRANT`, worded in the Images panel), in the enqueue transaction (`no-grant`, no job stored) and at the reservation (the last gate: a grant disabled after queuing refuses the charge). Owners whose latest text grant was enabled received it at the upgrade.                                                                                                                                                                                                         | `apps/server/src/images/picture-grants.ts`, `draft-runtime.ts`, `ledger.ts`; `workshop/images/postgres-store.ts`, `mutation-routes.ts`; operator CLI                                                                                                                           |
| G07-01 job queues        | In the enqueue transaction, under the draft lock and a per-owner advisory lock: one active GENERATE/EDIT job per draft and two per owner (retries included), four active pictures per owner. A refusal is the fixed 429 and stores nothing; the workshop client shows "Too many paid jobs at once. Wait until a running one finishes, then try again." in the generation form, a job's retry, the AI edit and the Images panel. The serial workers take each owner's oldest waiting job first, then each owner's next. The in-memory stores under `testing/` apply the same bounds and order. | `apps/server/src/workshop/job-limits.ts`; generation and image stores and routes; `apps/web/src/workshop/client.ts` and the four flows                                                                                                                                         |

Runbook §8 documents the grant command, the bounds and the recovery note (an older build cannot
read revisions saved with quest identities and checks no grant); `deploy/AGENTS.md` and
`apps/server/migrations/AGENTS.md` repeat the recovery boundary.

## Regressions (each fails on `64efe21`'s behaviour)

- G07-04: `plan.test.ts` — a willing NPC record with its disclosure removed compiles to no
  `SetDisclosure` (the old compiler emitted WILLING: checked by reverting `plan.ts`).
- G07-03: `plan.test.ts` (opaque quest/stage/after IDs; a missing stage identity blocks the plan;
  engine identities keep authored keys); `repository.test.ts` and
  `postgres-store.integration.test.ts` (stable quest identities across revisions, registry rows);
  `compiler.test.ts` (`QUEST_IDENTITIES_MISSING`); `campaign-play.test.ts` and
  `tests/e2e/workshop-activation.spec.ts` (the bootstrapped campaign's player quest answers hold no
  authored quest key or stage slug).
- G07-02: `picture-grants.integration.test.ts` (migration 0024 grants only owners whose latest text
  grant is enabled; later revisions decide; history is append-only);
  `draft-runtime.integration.test.ts` (with the grant disabled after queuing, availability says
  `NO_GRANT` and the reservation refuses: nothing is dispatched or charged — fails without the
  ledger check, verified by removing it); `storage-postgres.integration.test.ts` (an ungranted
  owner's request stores no job); `preparation-config.test.ts` (the operator command's arguments).
- G07-01: `job-limits.integration.test.ts` (30 racing enqueues on one draft admit one; the owner
  bound across drafts leaves other owners alone and frees a place when a job ends; owners are
  served in turn — all three fail with the bounds and the order removed);
  `storage-postgres.integration.test.ts` (the fifth active picture is refused);
  `routes.test.ts` (the second active generation gets 429 `RATE_LIMITED`, the next after a cancel
  succeeds); `client.test.ts` (a 429 is `busy`, not an uncertain failure). Two history tests now end
  each job before queuing the next.

## Verification

- Format, lint and typecheck pass; context budget: 1,483 active files, 0 over target.
- Unit: 3,400 tests in 373 files pass. Build passes.
- Integration (PostgreSQL 18, throwaway databases): 350 tests in 63 files pass.
- Browser journeys: 184/184 (6.0 min), the activation journey's new quest-answer guard included.
- Each new regression was run against the old behaviour: the plan test without the `plan.ts`
  change, the runtime grant test without the ledger check, the three job-limit tests without the
  bounds and the order. All failed, and pass with the fix.
- The local workshop demo (scripted generation, in-memory stores): after a manual correction to
  the unset value, the editor's select and the inspector read «Скрывает (по умолчанию)» at 375
  and 1440 px, and a revision with quest identities saves and reloads in the client. The only
  console error is the existing 404 of the editing context before a draft's first revision.
- Not run locally: the deployment check (this PR's CI runs it). No live provider, no default
  database, no deployment.

## Residual risks and limits

- Campaigns activated before this change keep their authored quest keys in their frozen quest book;
  it cannot be rewritten without changing published content. Revisions saved before it must be
  saved again before activation.
- The 429 shares its fixed body with the request rate limit (20 per minute, two in flight); the
  client's wording ("wait until a running one finishes") fits both.
- The bounds are per owner; the number of invited owners bounds the whole queue. Bulk cancel and an
  operator-wide stop remain G07-10 (runbook) material.
- An older build after a rollback would not enforce the grant or bounds and cannot read revisions
  with quest identities (runbook §3/§8).
- The browser journeys exercise the editor's wording and the activation guard; no journey drives the
  429 wording, which the client and route tests cover.
- Low findings G07-05…G07-10 and the Info notes are unchanged and await the owner's disposition.
  A Gate 07 retest of this remediation is the owner's call.

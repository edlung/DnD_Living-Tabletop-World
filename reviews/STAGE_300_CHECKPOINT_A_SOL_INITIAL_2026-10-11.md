# Independent Stage 300 checkpoint A acceptance — FAIL

Fresh native Codex `gpt-6.1-sol`, `xhigh`, read-only. The owner's 2026-10-11 exception accepts explicit configuration for this review; actual response-model attestation is unavailable. No peer verdict, implementation conversation, credentials or `.env.local` was read.

## Artifact and checks

- HEAD: `406904343bfe8542640035564d3e044561824125`.
- Frozen manifest: `89b3acc588129a283826055ee818c226c4b6e3c8e4e277910a1ab7abf2cb8c4c`; all 71 entries verified before/after; deleted `budget.ts` absent.
- Handoff: `d6cf5a8a45ffaf6d2d3d2e639cef2a9bd51a6f527819fecfe3060e48e5056e82`.
- Approved design: `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`.
- Accounting integration: 44/44 PASS; selected unit: 66/66 PASS.
- Independent PostgreSQL barrier competition: exactly one reservation admitted for each of global day, campaign day, stage and session ceilings.
- All four offline evaluation capabilities with dummy keys/routes and a fetch trap: zero fetches, local/deterministic providers only. Live CLI refused, exit 2.
- Counterexamples below used inline probes and a migrated throwaway database, subsequently dropped. Full validation/build/migrate/seed was not rerun against the dev database.

## Required findings

### P1 — Database operations escape the absolute storage deadline

`apps/server/src/ai/accounting/pg-transaction.ts:109–117,138–146` checks time before awaiting timeout configuration, then starts application SQL without rechecking. BEGIN, isolation verification, COMMIT and ROLLBACK have no client-side absolute deadline bound.

Reproduction: a fake driver delayed settings by 100 ms under a 40 ms deadline; application SQL started at approximately 102 ms, after expiry. Delayed BEGIN/COMMIT/ROLLBACK responses made the operation last approximately 121–122 ms; SHOW started after expiry following delayed BEGIN, and delayed COMMIT returned success after expiry.

Required: bound database waits by the remaining absolute deadline, recheck immediately before application SQL and bound cleanup. Preserve conservative ambiguous-commit handling; timeout does not confirm rollback. Add regressions for settings, transaction-start and commit stalls.

### P2 — Request start extends the stored caller deadline

`apps/server/src/ai/accounting/request-journal.ts:38–57` samples remaining monotonic time before `tx.query` awaits timeout settings. INSERT adds that stale duration to its later database clock.

Real PostgreSQL reproduction: a 250 ms settings-response delay during a 2,000 ms request left approximately 1,736 ms caller time but 1,990 ms stored database time, an extension of approximately 255 ms.

Required: finish preparatory awaits, then recalculate positive remaining time immediately before issuing INSERT. Add delayed-settings coverage alongside delayed checkout. Approved design §2 requires this monotonic-to-database deadline contract.

### P1 — Batch reconciliation confuses caller and attempt completion

`apps/server/src/ai/accounting/operator-store.ts:270–280,306–307` checks absence of a caller outcome to classify running attempts. A TIMEOUT or recovery outcome does not prove an admitted provider attempt stopped or its charge is known. The design separates caller and billing lifecycles and excludes still-running attempts from batches.

Real PostgreSQL reproduction: admit a 1,000-microdollar hold; finalize caller TIMEOUT with no terminal attempt accounting; submit a closed batch window allocating 10. It appends terminal reconciliation and lowers effective charge from 1,000 to 10 despite the unresolved attempt.

Required: establish attempt-level completion/closed-billing evidence independently of caller outcome; preserve uncertain holds absent proof. Add a negative control for a timed-out caller with a pending provider attempt. This is an A primitive obligation, not deferred B2 integration.

## Scope and limitations

Campaign/day identity across approvals conservatively satisfies durable caps without materially relaxing architecture. Nonterminal `attempt-evidence` supports required open-hold arithmetic. Local-only composition, terminal uniqueness, append-only schema, sorted lock domains and non-reducing evidence otherwise matched inspected design and checks.

No verified pricing catalog, gateway/journal lifecycle integration or new live/semantic-quality evidence exists. B1/B2/C and owner product dispositions remain deferred; stale workflow status is administrative.

**FAIL — STOP.** Resolve findings and obtain both independent approvals on the repaired artifact before B1.

Report faithfully transcribed by the orchestrator from `/root/sol_checkpoint_a`'s final assessment; no implementation repair was made by the reviewer.

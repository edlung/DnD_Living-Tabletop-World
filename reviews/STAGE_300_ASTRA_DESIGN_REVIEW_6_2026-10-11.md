# Stage 300 remediation design 6 — Astra review

Date: 2026-10-11. Verdict: APPROVE (architecture only).
Artifact SHA256: `a4a7da26179263a61ce80a4900b0f931503f34e1e9009d244aeee6f4b061c56e`.
Fresh native subagent `/root/astra_design6`, explicit `gpt-6-astra` / xhigh configuration.
Actual response attestation unavailable; configured identity/effort accepted under the owner's
explicit 2026-10-11 exception. No peer verdict supplied. Hash verified before and after review.
The returned assessment follows verbatim.

---

<!-- prettier-ignore-start -->

**APPROVE — Stage 300 remediation architecture, draft 6.**

Reviewed SHA256 `a4a7da26179263a61ce80a4900b0f931503f34e1e9009d244aeee6f4b061c56e`, verified unchanged before and after review. No blocking architecture findings.

The design is feasible against the inspected source contracts:

- **Budget conservation:** The account-owned global ceiling, shared policy lock, consistently ordered account/bucket locks, unique terminal accounting transition, and absolute-charge MAX rules form a coherent admission and settlement protocol. Open-attempt evidence remains chargeable, and uncertain transport outcomes cannot silently release capacity. See [design:18](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:18) and [design:177](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:177).
- **Caller/trace agreement and recovery:** Freezing the public result before trace construction, atomically inserting its unique outcome and trace, and using the same request lock for deadline-qualified recovery resolves the specified conflicting-writer race. Recovery correctly preserves uncertainty without fabricating output or an authoring source. This requires replacing the current standalone trace append transaction within the allowed server persistence scope. See [design:283](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:283) and [postgres-trace-store.ts:17](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/apps/server/src/ai/postgres-trace-store.ts:17).
- **Contract and context compatibility:** `activeSessionId` exists. Intent, relevance and Chronicle already receive trusted state snapshots; NPC dialogue can receive the proposed scalar captured from `before` while retaining its current post-command context. Nullable no-start responses are explicit, and Chronicle’s command/public contracts already support null trace IDs. See [state.ts:96](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/packages/domain/src/kernel/state.ts:96), [npc-routes.ts:62](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/apps/server/src/http/routes/npc-routes.ts:62), and [chronicle/commands.ts:38](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/packages/contracts/src/chronicle/commands.ts:38).
- **Fallback and checkpoint composition:** The design distinguishes semantic decline, provider refusal, invalid output, denied repair, suspect billing and cancellation without expanding canonical authority. Identity-based local exemption and mandatory offline construction guards cover runtime and evaluation composition. The existing evaluation CLI’s direct dependency on the removed ledger is explicitly addressed at checkpoint A. See [design:378](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:378), [design:536](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:536), and [eval-cli.ts:14](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/apps/server/src/testing/eval/eval-cli.ts:14).

Implementation acceptance must demonstrate the specified real-PostgreSQL concurrency, cross-midnight stops, settlement/reconciliation races, bounded persistence, finalizer/recovery races, no-start responses, and zero-dispatch offline guards. One source detail deserves explicit verification: the legacy Chronicle trace uses `paragraphs: null` for template fallback; the new frozen-result representation must preserve the actual returned template/provider agreement required by the design, rather than treating that legacy field alone as complete evidence.

Residual risks remain explicit: uncertain holds can exhaust capacity; full-context reservations can make small allowances unusable; recovered requests can permanently lack a capability trace; provider pricing/cache contracts still require verification. Paid spending authorization, the preparation/closed-session product limitation, live evaluation, NPC voice choice and owner acceptance remain pending.

This was a static, read-only review; no files changed, tests executed, or paid runtime calls made. Required workflow/design documents exposed historical gate-status summaries; no reviewer reports or current peer verdicts were consulted.

Model evidence is the supplied explicit native `gpt-6-astra` / `xhigh` launch configuration under the owner’s exception. Actual response-model attestation is unavailable.

<!-- prettier-ignore-end -->

# Independent architecture assessment — remediation draft 1

Date: 2026-10-11. Baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Exact reviewed artifact SHA256: `890f92e3ca3d9f5e2298c14c822966e85267d0437cb74c8d7199ecd7546ddb13`.
Immutable copy: `STAGE_300_REMEDIATION_DRAFT_1.md`. Hash unchanged after review.
Fresh native agent `01a12949-62af-7451-9213-6c0ac10319c8`, configured Astra/xhigh/OpenAI.
Actual response-model attestation unavailable; no named-model approval claimed.
No writes, tests, live calls or other reviewer verdict supplied.

## CHANGES REQUIRED

1. **High — approval/session identity.** Design lines 20/111 define day buckets but no cumulative
   stage approval shared by runtime/eval/reruns. Define durable approval ID, trusted mandatory
   session attribution, central ceiling revisions and behavior without active session. Charge every
   applicable bucket atomically. Cover midnight/restart/session changes/lowered ceilings.
2. **High — complete journal lifecycle and relevance deadline.** Lines 64/72 do not define how a
   crash before inserting the parent trace leaves spend DM-readable, or distinguish caller timeout
   from later billing settlement. Existing `relevance.ts:176` can wait for storage after timeout.
   Define durable request metadata, append-only lifecycle transitions, unfinished-attempt reads,
   recovery and admission/persistence within the deadline. Recovered records must not seed authoring.
3. **High — adapter outcome and decline contract.** Lines 79/93 defer refusal/no-tool behavior and
   internal decline wire/public mapping. Allowed scope omits `prompt.ts` and limits changes too
   narrowly. Define terminal typed decline, existing-public-status mapping, refusal/malformed/
   truncation/missing-tool transitions and exact allowed prompt/validation/port/test files.
4. **Medium — evaluation report contract and scope.** Lines 115/136 omit a defined per-model
   45-minute workload cost and end-to-end versus attempt latency, and do not explicitly allow
   semantic oracle repair. Define correct-proposal/safe-decline/quality results, disclosed workload,
   known charges versus reservations, and negative controls for Chronicle and relevance as well as
   intent/NPC. Expand allowed scope to cases/oracles and report behavior.

Suggested checkpoints: A durable approval/budget/journal lifecycle; B adapters/gateway/recovery/
routes/decline/cache; C evaluation/client evidence. Opus high owns A/B, Astra xhigh acceptance before
dependent work. Obtain both architecture approvals of the revised exact artifact before writing code.

Conservative reservations, uncertain-charge holds, restricted routes and cache isolation are sound
directions. Supporting administrative docs changed during review; design hash and code did not.

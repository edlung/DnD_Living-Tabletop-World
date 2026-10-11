# Stage 300 remediation design 5 — Astra technical review

Date: 2026-10-11. Verdict: CHANGES REQUIRED.
Artifact SHA256: `35c4623d0878cb0a39b0b9abd8fa0bbd80264594dc8861f60ede63e239e7779e`.
Baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`; HEAD: `406904343bfe8542640035564d3e044561824125`.
Fresh native subagent `/root/astra_design5`, explicitly requested `gpt-6-astra`, xhigh.
Trusted actual response-model and effective-effort attestation unavailable on this native surface.
This is a technical assessment, not a satisfied named-model approval. Hash verified before/after.
The findings below are transcribed from the returned assessment; no tests, writes or paid calls.

## Blocking findings

1. High — No-durable-start result contradicts existing response contracts. Design lines 248–250
   require no trace ID without a durable start, but DmIntentResponse.traceId (intents.ts:44–54) and
   RenderedChronicle.traceId (chronicle.ts:50–54) require strings. Intent always supplies an ID;
   Chronicle forwards it publicly. Specify every capability's exact no-start outcome, either a
   truthful non-durable correlation identifier or reviewed nullable/alternative contracts. State
   whether local proposals are safely refused when no authoring-source trace exists. Test failed/
   stalled start writes for all four capabilities: exact response, bounded completion, zero remote
   dispatch, local behavior, honest trace/diagnostic reads and absent-source authoring rejection.
2. Medium — Required NPC session capture is outside the allowed source boundary. The before snapshot
   is in npc-routes.ts:62, before execution at 77–85, but replyAsNpc at 100–109 passes no session
   and DialogueInput (dialogue.ts:23–36) has no session field. Allow narrow NPC route wiring and a
   trusted scalar captured from the authorized before snapshot. Preserve the post-command NPC
   context; never pass the full world snapshot into the prompt path. Test session closing/changing
   between snapshots, null-before/session-starts-after, original bucket retention on every attempt,
   and accounting metadata exclusion from provider payloads.

## Remaining assessment

The core design is coherent at architecture level: conservative holds, absolute-charge
reconciliation, ordered READ COMMITTED locking, separate request/accounting locks, diagnostic-only
crash recovery, one-switch/one-repair transitions, terminal intent decline and offline intermediate
checkpoints address the failure classes without granting AI mutation authority.

Residual risks: pricing/token-bound catalog and cache-schema verification, uncertain holds exhausting
capacity, owner disposition on preparation/post-session Chronicle, live evaluation and quality.
Implementation acceptance must prove concurrency, recovery, provenance and isolation tests.

Independence disclosure: initial instruction inventory exposed only AGENTS.md filenames in review,
report and handoff directories; no other report/verdict/conversation was opened.

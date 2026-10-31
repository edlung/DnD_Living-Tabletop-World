# Work Order — Stage 390: Campaign packages and compiler

Authority: accepted Stage 370 contract/ADR 0038 and
`reviews/OWNER_CAMPAIGN_CONTINUATION_2026-10-30.json`. Stage 380 is accepted. The
owner delegates technical checkpoint dispositions for Stages 390–450; report and
verify this stage, then continue to Stage 400 without another confirmation.

## Read first

Context map, root/current local AGENTS, architecture invariants, Stage 370 §§4–5,
the workshop store/routes and relevant kernel/knowledge/rules/quest contracts.

## Deliverables

1. Strict versioned campaign-package contract covering brief, initial world,
   entities/party, scoped typed knowledge, conflicts, clues/situations/possible
   developments, prepared encounters, quest definitions and visual briefs.
2. Server-owned opaque identity mapping stable across immutable revisions; draft
   local keys never become player-visible canonical IDs. Keep source/provenance,
   content digest and parent revision. Reject stale writes and idempotency conflicts.
3. A pure compiler/materializer using existing World Engine decisions over an
   isolated in-memory event store. Return structured findings, ordered deterministic
   bootstrap submissions and readiness; it must not mutate a real campaign.
4. Owner-authorized revision/read/history/assessment HTTP paths, PostgreSQL and
   test-only in-memory stores. Persist package-specific quest/scenario definitions;
   progress stays a projection, no fake future events/memories.
5. A complete non-Ravenford specimen and invalid/missing/scope/rules/reference
   cases; concurrency, restart/immutability and cross-owner HTTP/DB tests.
6. Update context/domain instructions and ledgers; focused checks, full offline
   validation, own adversarial pass and technical disposition/report.

## Boundaries

Generation/provider jobs are Stage 400; scenario/visual browser inspection is
410/420; selective AI revision is 430; live campaign bootstrap/publication is 440.
Package storage/materialization cannot add live campaign authority or reuse
unrestricted in-play authoring. No paid calls, new dependencies, deployment,
production credentials, release or rewriting historical migrations/events.

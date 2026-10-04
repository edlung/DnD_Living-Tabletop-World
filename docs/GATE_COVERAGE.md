# Gate Coverage and Surface Introduction

All existing surfaces relevant to an invariant remain subject to review. This table schedules new surfaces; it does not exempt an already implemented route, cache, serializer, or fallback. Test through public or explicit test interfaces without implementing future-stage features solely for a review.

| Introduced at | Required deterministic coverage at introduction | Next independent review |
|---:|---|---|
| 20 | Knowledge query/projection API or harness; PLAYER/PARTY/PUBLIC/CHARACTER/DM and NPC fixtures; missing/forged/malformed scopes, relation traversal, serialization, errors, existing caches/fallbacks; assert permitted data is returned and secret data is absent | Gate 01 |
| 30 | Memory/temporal retrieval respects the same scope boundary, including indirect semantic/entity/time queries and impossible memories | Gate 02 |
| 50–60 | Entity context and investigation paths do not expose secrets through actions, reasons, evidence relations, or hypotheses | Gate 02 |
| 70 | Contradictions preserve testimony/hypothesis types and do not reveal secret truth or cross-contaminate NPC projections | Gate 02 |
| 90 | Reaction eligibility, expiry, double-spend, concurrency, ordering/replay, and declared undo/rewind behavior | Gate 03 |
| 100–120 | AI contexts respect scope; proposals cannot bypass authoring permission, validation, confirmation, continuity, atomicity, provenance, or safe-undo rules | Gate 04 |
| 130 | Runtime NPC dialogue/actions; inspect actual supplied context, then attack prompt injection, other-NPC knowledge, DM truth, and future events | Gate 04 |
| 140 | AI relevance ranks only already-computed legal actions from the acting perspective's own data; legality, reasons, and the action set never change; any AI outage, invalid output, or timeout yields the deterministic context | Gate 05 |
| 150–160 | Player-facing asset metadata, lineage, and historical visual state respect identity and scope; asset jobs obey authoring undo policy. Stage 150 evidence: `packages/domain/src/assets/` tests (`lineage`, `undo`, `views`, `assets.property`), `apps/server/src/http/asset-routes.test.ts` (Gate 04 hooded watcher), `apps/server/src/assets/` worker and PostgreSQL tests (ADR 0022). Stage 160 evidence: `packages/domain/src/visual/` tests (`ravenford-day-two`, `presentation`, `timeline`, `visual.property`), `packages/domain/src/weather/weather.test.ts`, `packages/combat/src/visual-state.test.ts`, `apps/server/src/http/visual-routes.test.ts` (ADR 0023) | Gate 05 |
| 170 | Chronicle and flashback retrieval preserve permitted knowledge and epistemic type, with traceable event sources | Gate 05 |
| 180 | All backend Ravenford surfaces integrated, including regressions from Gates 01–04 | Gate 05 / Stage 190 |

Gate 01 uses Mira as an NPC scope fixture. It does not claim to test runtime NPC dialogue or the Stage 30 memory engine. Carry those obligations to their introducing stages and next gates above.

Every handoff/review records due surfaces, actual evidence, required-but-unavailable surfaces, and future obligations. Missing required coverage blocks PASS. A future obligation is NOT YET IN SCOPE, never PASS; it must name its introduction stage and review gate. Gate 05 closes all backend obligations in this table.

Stages 200–230 introduce real UI consumers of reviewed contracts. Run boundary/E2E regressions as those consumers appear, including perspective switching and stale action/preview handling. Backend review does not certify UI behavior. If a change invalidates a previously reviewed invariant boundary, reopen the affected gate with a RETEST handoff and next unused retest number, preserving earlier reports under `AGENT_WORKFLOW.md`. Stage 250 must link the resulting evidence to its release candidate.

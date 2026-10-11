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
| 170 | Chronicle and flashback retrieval preserve permitted knowledge and epistemic type, with traceable event sources. Stage 170 evidence: `packages/domain/src/chronicle/` tests, `packages/ai/src/chronicle.test.ts`, `apps/server/src/http/chronicle-routes.test.ts` (Chapter I), `apps/server/src/chronicle/chronicle.integration.test.ts` (ADR 0024) | Gate 05 |
| 180 | All backend Ravenford surfaces integrated, including regressions from Gates 01–04. Stage 180 evidence: `apps/server/src/scenario/` (the played slice, the semantics ledger, Integrity and DM acceptance, PostgreSQL with restart), the quest projection (`packages/domain/src/quest/`, `packages/combat/src/quest-survival.test.ts`), and every earlier suite (ADR 0025) | Gate 05 / Stage 190 |

Gate 01 uses Mira as an NPC scope fixture. It does not claim to test runtime NPC dialogue or the Stage 30 memory engine. Carry those obligations to their introducing stages and next gates above.

Every handoff/review records due surfaces, actual evidence, required-but-unavailable surfaces, and future obligations. Missing required coverage blocks PASS. A future obligation is NOT YET IN SCOPE, never PASS; it must name its introduction stage and review gate. Gate 05 closes all backend obligations in the table above; the alpha-phase table below is due at Gate 06.

## Alpha phase (Stages 200–350)

| Introduced at | Required deterministic coverage at introduction | Next independent review |
|---:|---|---|
| 200–240 | Client consumers of reviewed contracts: perspective switching, isolation of DOM and responses, stale actions and previews. Introduction evidence is listed below; no gate has reviewed it | Gate 06 |
| 290 | Play language: Russian equivalents of the Chronicle hedging rule and of lexical memory recall keep the reviewed guarantees; every boundary and isolation suite has a Russian counterpart; histories that earlier revisions wrote load, replay, and undo identically | Gate 06 |
| 300 | Live providers: what each provider receives is exactly what the reviewed context builders produce; outage, invalid output, timeout, refusal, and exhausted budget fall back; keys never reach logs or traces | Gate 06 |
| 310 | Change signal: carries no world content and reveals nothing a perspective could not read; authorized on connect and cut off on revocation; the DM's action for an absent player is an authorized, audited, undoable command | Gate 06 |
| 330 | Real images: no image reaches a player before DM approval; requests and metadata respect scope; refusals and failures leave the neutral fallback | Gate 06 |
| 340 | Production sign-in: forged, expired, revoked, replayed, and cross-campaign credentials fail closed; the check order of ADR 0009 is unchanged; no credential in logs, traces, or URLs | Gate 06 |
| 350 | Deployed build: TLS, server reachable only through the proxy, secrets from the environment, a restore drill that replays to the same world | Gate 06 / Stage 355 |

A stage that changes a boundary reviewed by Gates 01–05 names the change in its completion report and in the Gate 06 handoff. Stage 290 is known to do so (ADR 0010 recall, ADR 0024 prose rules).

Stages 200–230 introduce real UI consumers of reviewed contracts. Run boundary/E2E regressions as those consumers appear, including perspective switching and stale action/preview handling. Backend review does not certify UI behavior. If a change invalidates a previously reviewed invariant boundary, reopen the affected gate with a RETEST handoff and next unused retest number, preserving earlier reports under `AGENT_WORKFLOW.md`. Stage 250 must link the resulting evidence to its release candidate.

Stage 200 introduction evidence (ADR 0026): session bootstrap and full-sheet routes
have membership/perspective/whitelist tests in `apps/server/src/http/` and
`packages/domain/src/character/view.test.ts`. Browser journeys are routed by
`tests/e2e/AGENTS.md`; they cover Player/DM DOM and response isolation, delayed and
failed perspective changes, hidden character options, selection races, full sheets,
loading/empty/recovery, logout/history navigation, and keyboard/narrow layouts.
Existing authorization rules, canonical mutation paths, and reviewed projections
are unchanged; the new reads apply the same boundary with explicit field lists.
No prior gate coverage was invalidated; this is new UI introduction evidence, not
an assertion that Gate 05 reviewed the frontend. Completion evidence and exact
commands: `reports/STAGE_200_COMPLETION.md`.

Stage 210 introduction evidence (ADR 0027): `tests/e2e/investigation-*.spec.ts` cover
the object-first arrival/investigation journey, knowledge-dependent action
visibility, hypotheses staying hypotheses, hidden-data scans of DOM and responses,
single-record retry after an interrupted response, and late-result isolation;
`apps/web/src/exploration/action-bindings.test.ts` covers the command mapping.
No contract, mutation path, or reviewed projection changed, so no gate is reopened.
Evidence and commands: `reports/STAGE_210_COMPLETION.md`.

Stage 220 introduction evidence (ADR 0028): `tests/e2e/combat-*.spec.ts` cover movement and
attack with a server-refused over-speed move, Fireball preview with the ally warning and a
legal cast, a valid Counterspell, Ignore, DM-closed expiry with a stale answer refused,
duplicate and repeated answers spending one slot, and the DM start/run/end lifecycle returning
players to exploration. `apps/web/src/combat/*.test.ts` cover route planning and command
bindings. No rules, combat, reaction, contract, or route code changed, so the deterministic
suites run unchanged and no gate is reopened. Evidence: `reports/STAGE_220_COMPLETION.md`.

Stage 230 introduction evidence (ADR 0029): `tests/e2e/authoring-*.spec.ts` cover Tomas Reed
from sentence to preview, edit (new revision, recomputed preview), confirm, and native
visibility; scoped secrecy in the player's DOM and responses and in the DM's Player View;
a stale confirmation refused with the latest revision reloaded; a blocking proposal that
cannot be confirmed or forced; warning acknowledgement reset by an edit; safe undo; and
undo refused with named blockers, then succeeding after they are undone.
`apps/web/src/authoring/command-text.test.ts` covers the command wording. No server,
contract, rules, or authoring-pipeline code changed, so the authoring atomicity and
continuity suites run unchanged and no gate is reopened. Evidence:
`reports/STAGE_230_COMPLETION.md`.

Stage 240 remediation (ADR 0030): `tests/e2e/dm-tools.spec.ts` covers DM time/weather with the
player's changed view, a written chapter with cited entries and flashback inside the player
boundary, and the DM performing an NPC. These use existing routes; no server, rules, or
contract code changed. Between the Gate 05 reviewed revision `a85b6f8` and the release
candidate the only backend changes are additive (session, character-sheet, surroundings
reads; Stage 200 introduction evidence); reviewed code paths are unchanged.

Stage 290 introduction evidence (ADR 0031): the play language is a campaign property recorded once
(`CampaignCreated.language`, additive, absent = English). Recorded sentences are written in that
language at decision time and replay as stored. **Reviewed boundaries changed here, for Gate 06:**
lexical memory recall (ADR 0010; `packages/domain/src/memory/retrieval.ts`, a bounded Russian
stemmer) and the Chronicle hedging rule (ADR 0024; `packages/domain/src/language/chronicle-text.ts`).
English behaviour is unchanged and every reviewed English suite passes unchanged. Russian
counterparts: `apps/server/src/http/russian-boundary.test.ts` (Gates 01, 02, and 04: exact visible
sets, forbidden markers through every endpoint and query, identical hidden/nonexistent answers,
NPC provider inputs under Russian injection attempts), `apps/server/src/scenario/ravenford-ru.test.ts`
and `ravenford-ru.integration.test.ts` (the played slice, the no-leak scan, integrity, oracle, replay,
and PostgreSQL restart), `packages/domain/src/language/*.test.ts` and
`packages/domain/src/memory/retrieval-ru.test.ts` (hedging and recall), and
`tests/e2e/language-ru.spec.ts` (the client in Russian, no English left on screen). Fixtures:
`fixtures/ravenford-ru/`. No reviewed projection, mutation path, or authorization rule changed.

Stage 300 introduction evidence (ADR 0032, baseline `bc6c116`): live Anthropic and DeepSeek adapters,
per-capability routing and Russian evaluation were introduced. Provider request instructions changed
in `apps/server/src/ai/anthropic-provider.ts` (tool-only suffix) and `packages/ai/src/prompt.ts`
(non-game empty-list instruction). The reviewed scoped builders remain unchanged, but their full
request envelopes and prompt deltas need Gate 06 coverage. Existing provider/fallback/isolation
unit suites passed in the 2026-10-11 audit; this does not certify live model behavior.
**Acceptance is pending:** `reviews/STAGE_300_AUDIT_DISPOSITION_2026-10-11.md` records budget,
trace-accounting, evaluation and fallback defects. Missing usage on refusal/truncation and timed-out
relevance attempts, absent per-campaign ceilings and prompt caching, and false-positive evaluation
predicates require regression coverage before this stage can be accepted. Current review/model
evidence limits are in `docs/PROJECT_WORKFLOW.md`. Future remediation must add its exact revision,
tests and provider-envelope deltas here without rewriting the historical results.


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

Stage 300 remediation checkpoint B1 (2026-10-11; design SHA256 `23e53e4d…aab2`; acceptance pending)
changes provider-facing envelopes, all recorded for Gate 06; scoped context builders are unchanged:
- **Intent wire schema** (`packages/ai/src/prompt.ts` `INTENT_OUTPUT`): one top-level object
  `{kind, proposal, reason}`; `kind` is `proposal` (the unchanged canonical proposal schema) or
  `decline` (`not_game` | `ambiguous` | `unsupported`); exact combinations are enforced in
  `validateIntent`. Both adapters send it unchanged (`raw-adapters.test.ts`).
- **Intent instructions**: the "empty commands list" line is replaced by the decline instruction
  (never invent a command); the repair request ends "Return a corrected answer." instead of
  "Return a corrected proposal.". The directory and request rendering are unchanged.
- **Adapter bodies** are serialized once by `prepare` and sent byte for byte; the Anthropic
  tool-only system suffix is unchanged; the DeepSeek `thinking` switch is now an allowlisted option.
  No cache metadata is sent at B1 (cache framing is B2 and needs its own coverage entry).
- **Outcomes**: missing tool, truncation and unreadable arguments are invalid output (one repair on
  the same provider), no longer provider failure; refusal, suspect model/billing and admission
  denial switch at most once to the local provider; a valid intent decline is terminal
  `INVALID_OUTPUT`/`NO_PROPOSAL`; the local provider declines unreadable intents in one attempt.
  Evidence: `packages/ai/src/{outcome-table,fallback-cancellation,intent-envelope}.test.ts`.
- **B1 repair 1** changes no provider-facing envelope or prompt. Outcomes only: the local provider
  is never repaired (one local call per request), and cancellation from a callback invokes nothing
  further. Routers keep one frozen snapshot of their routes; usage allowlists match own names only.
  Evidence: `packages/ai/src/router.test.ts`, `apps/server/src/ai/{composition,raw-adapter-hardening}.test.ts`.
- **B1 repair 2** changes no provider-facing envelope or prompt. Outcomes only: cancellation during
  validation discards a valid output or decline; an exception from the gateway's own callbacks never
  becomes a provider attempt, repair or switch. Evidence: `packages/ai/src/fallback-callbacks.test.ts`,
  `packages/ai/src/fallback-cancellation.test.ts`.
- **B1 repair 3** changes no provider-facing envelope or prompt. An invoked provider resolving no
  well-formed response is one uncertain `BAD_RESPONSE` attempt with no invented model, usage or
  output. Evidence: `packages/ai/src/fallback-nonresponse.test.ts`.
- **B1 repair 4** changes no provider-facing envelope or prompt. A rejection keeps its code only
  as a genuine, unchanged, allowlisted `ProviderError`; anything else is one uncertain `UNAVAILABLE`
  attempt. Evidence: `packages/ai/src/{providers,fallback-rejection}.test.ts`.

- **B1 tool description (recorded at B2):** `INTENT_OUTPUT.description` changed from "Propose World
  Engine commands that would carry out the game master’s request. They are only a proposal: …" to
  "Propose World Engine commands that would carry out the game master’s request, or decline. A
  proposal is only a proposal: …". Provider-facing tool text only; no scoped data.

Stage 300 remediation checkpoint B2 (2026-10-11; design SHA256 `23e53e4d…aab2`, stop-scope delta
`6bba0030…b485`; acceptance pending) changes provider-facing envelopes as follows, for Gate 06;
scoped context builders, prompts and instructions are unchanged:
- **Cache-block framing** (Anthropic only, `apps/server/src/ai/anthropic-provider.ts`): when the
  verified catalog entry allows a 5-minute cache, `system` is sent as one text block carrying
  `cache_control: {type: "ephemeral"}`; its text is byte-identical to the uncached string, and every
  other field is unchanged. The cached prefix is the tool definition plus that fixed per-capability,
  per-language system text: no campaign, NPC, speaker, perspective, source ID or scoped content
  precedes the breakpoint (`anthropic-provider.test.ts`: identical prefix across two NPCs, two
  speakers and two intent directories; scoped markers absent). DeepSeek sends no cache directive.
  No verified catalog entry exists in this build, so no route sends it at runtime.
- **Accounting metadata** (`ProviderRequest.accounting`: request, attempt, session, campaign) never
  enters a provider body (`raw-adapters.test.ts`, `request-lifecycle.test.ts`, `npc-session.test.ts`).
- **No-start answers**: intent/NPC reply/Chronicle rendering trace IDs may be null; no provider,
  local included, runs without a durable request start (`no-start.test.ts`, `request-lifecycle.test.ts`).
- **DeepSeek classification**: a non-string refusal is a refusal, more than one choice is unverified
  billing, an `insufficient_system_resource` or unknown stop is truncation (`live-ai.test.ts`).
- **B2 repair 1** changes no provider-facing envelope, prompt or body. Outcomes only: past the
  request's monotonic deadline nothing is admitted, dispatched or invoked (local included) even
  before its abort timer runs (`fallback-deadline.test.ts`, `admitted-provider-holds.test.ts`,
  `raw-adapter-hardening.test.ts`, `request-lifecycle.test.ts`); suspect stops are retried and their
  route refused in-process until committed; provider request IDs are kept for every attempt
  (`suspect-records.integration.test.ts`).

Stage 300 remediation checkpoint C (2026-10-12; design SHA256 `23e53e4d…aab2`, stop-scope delta
`6bba0030…b485`; catalog record `reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md`;
acceptance pending) changes provider-facing envelopes as follows, for Gate 06; scoped context
builders, prompts, instructions and tool schemas are unchanged:
- **Anthropic request settings** (`apps/server/src/ai/request-settings.ts`, `gateway.ts`): every
  Anthropic body now carries `output_config: {effort}` and a per-capability `max_tokens` (relevance
  `low`/2,048, NPC dialogue `low`/4,096, DM intent `medium`/8,192, Chronicle `medium`/12,288)
  instead of the model default effort and 4,096. Still no `thinking`, sampling parameter, forced
  tool choice or prefill (`catalog-sonnet-5-5.test.ts`, every capability).
- **Verified catalog entry** for `claude-sonnet-5-5` only: with keys, a stored approval and an
  eligible session, Sonnet routes now dispatch (cache-block framing of B2 applies). Usage
  classification accepts the documented and conservatively allowlisted fields only
  (`raw-adapters.test.ts`, `catalog-sonnet-5-5.test.ts`); zero outbound without approval, store, key
  or session (`gateway-verified.test.ts`); every Vitest project traps the global `fetch`.
- **Evaluation** (`apps/server/src/testing/eval/`, as corrected at repair 1): the Gate 04 replay
  covers all five injection lines of `npc-isolation.test.ts` (in Russian), the five intents (talk,
  two asks, insight, showing evidence) and the four attitude/disclosure scenarios of
  `dialogue-isolation.test.ts`, each intent paired with a rotated line per scenario (69 requests,
  not the full cross product). The exact provider request bodies are checked against the context
  the builder exposes, rebuilt per request with the route's domain functions: by ID (recorded
  sources equal the builder's; no boundary or source ID sent) and lexically by phrase (no planted
  secret, other NPC's fact or still-locked guarded content; the `sayableBy` content the builder
  exposed is present), separately from the lexical reply scan. Intent bodies get a lexical planted-
  marker scan only. A paraphrased secret is not caught by any phrase scan (`oracles.test.ts`,
  `eval-live.integration.test.ts` over a fake Sonnet transport). No live provider was called.
- **Repair 1, request shape** (`apps/server/src/ai/request-shape.ts`): before any reservation a body
  may carry only the adapter's messages (Anthropic: one user message; OpenAI-compatible: one system
  and one user message; no assistant turn or prefill), only its one client tool (no server or typed
  tool) and no `cache_control` but the single 5-minute ephemeral system breakpoint where the entry
  allows it (`pricing-shape.test.ts`). The adapters' bodies are unchanged.
- **Repair 1, runtime relevance** (owner decisions 6): the documented runtime routes send no
  relevance request to any provider; rankings stay on the Context Engine (`gateway-verified.test.ts`
  reads the `.env.example` example). An explicitly configured remote ranker remains possible and
  keeps its B2 coverage.

Stage 310 part A introduction evidence (ADR 0033; `docs/STAGE_310_DESIGN.md` §A; baseline
`edeae54`; acceptance pending): **new surfaces for Gate 06**, row 310 of the alpha-phase table.
- **`GET /campaigns/:campaignId/live`** (`apps/server/src/live/`): the ADR 0009 check order before
  the stream opens; an event stream of `ready`, `changed {seq}`, `closed {reason}` and comment
  heartbeats only. A signal is a change of the SHA-256 over the subscriber's own coverage views,
  each injected with the subscriber's credential into a silent twin of the same application
  (same engine and stores, no workers, no live route), so the reviewed routes and projections
  decide what is visible. Every cycle rechecks through those views: 401, 403 and 404 close the
  stream, and a failure closes it without a signal. Caps 4 per actor per campaign and 200 per
  process; a consumer whose backlog exceeds 64 KiB is dropped.
- **`GET /campaigns/:campaignId/presence`**: characters of the perspective's own `knownEntities`
  and whether their players (and the DM) hold a live subscription, with a 10 s grace; never an
  actor ID.
- **Boundary decisions to review**: a focus or place view that answers 404 is fingerprinted by its
  status (it does not close the stream); the DM's identity view is not covered while the DM holds
  a lower perspective (it lists hidden characters); entity context and surroundings are covered
  only for acting characters.
- **Deterministic evidence**: `apps/server/src/live/live-isolation.test.ts` (every non-DM
  perspective of Ravenford, with and without focus and place, and the hidden-character sentinel's,
  stay silent on five DM-only commits while the DM is signalled; a party record signals each
  reader once; every frame matches the fixed grammar), `live-stream.test.ts` (check order,
  headers, mid-stream 401/403/404 with a flippable authenticator, failure, disconnect, shutdown,
  caps), `live-socket.test.ts` (a real connection), `hub.test.ts` (no overlapping cycles,
  baseline before `ready`, slow consumer, heartbeat, caps), `fingerprint.test.ts` (view answers
  to verdicts: a hidden focus by its status, errors never a fingerprint), `presence.test.ts` (no hidden character or actor ID; a hidden player's
  arrival changes no other perspective's views or signals), `inventory.test.ts`; client
  `apps/web/src/api/live.test.ts`, `live-protocol.test.ts`, `resource.test.ts`; browser journeys
  `tests/e2e/live-combat.spec.ts` and `live-world.spec.ts` (turn hand-off, Counterspell window
  answered without refresh, private authoring silent until published, reconnect).
- No reviewed projection, mutation path or authorization rule changed. The design promises
  protocol non-disclosure, not constant-time execution: fingerprint cost varies with load.

Stage 310 parts B and C introduction evidence (ADR 0033 §6–8; `docs/STAGE_310_DESIGN.md` §B–C;
baseline `13cfaef`; acceptance pending): **new surfaces for Gate 06**, row 310 of the alpha-phase
table ("the DM's action for an absent player is an authorized, audited, undoable command").
- **`POST /campaigns/:campaignId/dm/substitutions`** (`apps/server/src/dm/`): the DM's reason
  (`absent`/`asked`/`other`, optional note of at most 200 characters) recorded before the DM
  submits the command with the same client command ID. ADR 0009 order: 401, 400 (strict body),
  then the 404 of a missing campaign for anyone who is not the campaign's DM, players included;
  422 for a character without a player, 409 for a different reason under the same ID or for a
  command already stored under it. Answers `{status: recorded|duplicate}` only; logs the reason
  code only. Append-only table `ltw_dm_substitutions` (migration 0009): descriptive, never
  canonical; the stored command with the DM as issuer is the record.
- **`GET /campaigns/:campaignId/dm/history?perspective=DM[&before=<sequence>]`**: 404 for anyone
  but the DM, 403 for every lower perspective including the DM's own (decided without looking at
  what it names). Newest first, 20 per page: authoring commits with their summary, and player
  commands the DM issued for a character that had a player when they were decided (the command
  without its recorded draws; the reason only when recorded for the same character). Status from
  stored commands and `CommandUndone`; undo availability from `previewUndo`
  (`packages/domain/src/kernel/decide/undo-preview.ts`): the World Engine's own authorization and
  `UndoCommand` decision against the snapshot, never committed. Covered by the DM perspective's
  live inventory only.
- **No new authority**: `authorize` is unchanged; acting for a player uses the DM's existing
  authority (ADR 0013), records no controller premise, and every command still goes through
  `POST …/commands`; undo uses the existing routes.
- **Boundary decisions to review**: the two `dm/*` routes answer a non-DM member 404 (design §C),
  where older DM-only views answer 403; the DM history returns the DM's own submitted command
  bodies and authoring summaries; the client's acting mode is the DM holding the character's
  perspective, enabled only after the DM's explicit choice; presence never gates anything.
- **Deterministic evidence**: `apps/server/src/dm/substitution-routes.test.ts` (check order,
  identical 404 bodies for a player and a missing campaign, validation, idempotency and conflict,
  roster refusal, reason-before-command, no world content echoed, no player view changes, no note
  in logs), `history-routes.test.ts` (check order with 403 for every lower perspective,
  cross-campaign 404 both ways, listing rules, blockers identical to the undo route's refusal,
  status after undo, paging without gaps, a fresh application over the same stores),
  `stand-in.test.ts` (a player cannot act for another character or a creature; the DM's End turn
  for a player's character is `REACTION_PENDING` while a window waits; issuer and premises),
  `dm-live.test.ts` (recording a reason signals nobody; its command signals the DM and the
  character's readers), `dm.integration.test.ts` (append-only rows, racing records, restart),
  `packages/domain/src/kernel/decide/undo-preview.test.ts` (equal to submitting the undo over
  randomized histories; commits nothing), `apps/server/src/live/inventory.test.ts`; browser
  journeys `tests/e2e/live-stand-in.spec.ts`, `dm-history.spec.ts`, `authoring-undo.spec.ts`.
- **Changed client consumer** (alpha row 200–240): ADR 0029 §8's screen-local authoring undo is
  replaced by the DM history list; no reviewed projection, mutation path, undo rule or
  authorization rule changed.

Stage 320 introduction evidence (ADR 0034; `docs/STAGE_320_DESIGN.md`; parts A `6a18da1`, B
`ee8c880`, C on `stage-320-visual`; baseline `a911d32`; owner play acceptance pending): **client
surfaces changed; no boundary changed**. Alpha row 200–240 (client consumers of reviewed
contracts).
- **Unchanged**: every route, contract, projection, authorization rule, command and what any
  perspective receives. The client still computes no legality, cost, range or area; visual state
  (open sheets, the board's view, the chosen chapter, an open flashback) stays in memory.
- **Client reads of existing routes, new in part C**: the Chronicle book reads the chapter's main
  place through `GET …/entities/:entityId/presentation?perspective=…&at=<chapter end>` (the
  perspective's own presentation, ADR 0023; a refusal or no approved image shows the neutral mist
  and says so); the conversation panel and the selection's panel re-read their `…/context` and
  `…/knowledge` views in the background after the viewer's own actions instead of remounting.
- **Labels of unnamed combatants**: the client shows "Unidentified creature N" (numbered in turn
  order, then position) instead of the entity ID in every visible label and accessible name. The
  player's `EncounterView` still carries those entity IDs (`entity.entityId`, `order`,
  `currentCombatantId`, the reaction window's caster) — **for Gate 06**: whether an unnamed
  combatant's ID should leave the projection is a boundary question (ADR 0015 §6), not a
  presentation one, and is not changed here.
- **DOM retention within one perspective**: the last selection's details panel stays mounted
  while closed (drafts survive closing and the viewer's own actions); a perspective change still
  remounts the world screen, so nothing crosses perspectives. The Chronicle's margin notes show
  each source's event type in words and, on demand, its event ID — exactly what ADR 0024 §5
  supplies to that perspective (sequences and the trace ID for the DM only).
- **"Who will see"** on the DM's proposal card is read from the proposed commands alone (scope of
  each record, a willing disclosure, the proposal being DM data until confirmed); the server's
  projections remain what decides visibility.
- **Deterministic evidence**: unit tests `apps/web/src/combat/labels.test.ts`,
  `chronicle/chapter-facts.test.ts`, `authoring/who-sees.test.ts`, `exploration/speech.test.ts`;
  browser journeys (80, both languages where they existed) including `conversation.spec.ts`,
  `drafts.spec.ts`, `phone-layout.spec.ts`, `chronicle-book.spec.ts`, the perspective-isolation
  and boundary journeys unchanged in strength; axe scans at three widths
  (`accessibility.spec.ts`); the screenshot set `reports/evidence/stage-320/index.md`.

Stage 340 part A introduction evidence (ADR 0036; `docs/STAGE_340_DESIGN.md` with its part A
implementation notes; baseline `e2c4bca`; acceptance pending): **new surfaces for Gate 06**, row
340 of the alpha-phase table. Invitation mode only (`AUTH_MODE=invitations`); development personas
behave as before and stay refused in production. Revised by the part A security review
(2026-10-16; ADR 0036 amendment, `docs/STAGE_340_DESIGN.md` "Security review fixes").
- **`POST /auth/redeem`** (`apps/server/src/auth/auth-routes.ts`): `{token, replaceSession?}` from a
  link's fragment; limits first (10/min per client, 5 failures per token prefix, 15 min lockout
  after 20 failures/hour, 60 refused redeems/min across all clients, a new client refused when the
  tables are full; fixed 429), then 400 for a malformed body, then 409 (fixed body, invitation
  unused) for a browser whose session is live and still a member unless `replaceSession: true`,
  then one fixed 401 for every well-formed failure (unknown, used, revoked, expired, the seat no
  longer free). A player's seat
  is `AssignCharacter` by the system actor `sign-in` under `invite:<invitationId>` (actor stored
  first, so a retry converges); marking the invitation used, creating the session and revoking
  the seat's other open invitations are one transaction; a redeem whose invitation is revoked or
  expires while it takes the seat undoes that assignment. Answers `{campaignId}` and sets
  `ltw_session` (`Path=/api; HttpOnly; SameSite=Strict; Max-Age=1209600`, `Secure` except http
  loopback); a session the browser held before (confirmed away, or dead) is revoked.
- **`GET`/`HEAD /auth/session`** (origin-checked like the live stream): `{campaignId}` only while
  the session is live and its actor still a member, else 401. **`POST /auth/sign-out`**: revokes
  the session, clears the cookie (204), 401 without a live session. A 401 clears the cookie only
  when the request presented exactly one `ltw_session` cookie that opened nothing: no request
  another site can cause signs a browser out.
- **DM only, ADR 0009 order (401, 400, then the 404 of a missing campaign for anyone but this
  campaign's DM):** `POST /campaigns/:campaignId/invitations {characterId, expiresHours?}` (404
  for a non-character, 409 for a taken seat, 20/hour per DM; the link is shown once), `GET
  …/invitations` (newest 100 invitations with status and times, members as character, live
  session count and coarse last-seen; never a token, hash or actor ID), `POST
  …/invitations/:invitationId/revoke` (404 for another campaign's, 409 once used), `POST
  …/members/:characterId/revoke` (the player's sessions and the character's open invitations
  revoked first, then `ReleaseCharacter` as the DM; a World Engine refusal is answered as the
  command route would).
- **Credential binding**: a session opens only its campaign; elsewhere its actor is one no
  campaign has (`apps/server/src/http/auth.ts`, `actorFor`), so after input validation it gets the
  non-member 404 — even where the same actor is the DM. Unknown, non-member and released
  campaigns answer identically; revoked, expired and forged sessions answer the 401 of no cookie.
- **Origin and headers** (`apps/server/src/http/security.ts`): before anything else, a non-GET
  request needs `Origin` = `PUBLIC_ORIGIN`, the live stream and `/auth/session` that `Origin` or,
  without one, `Sec-Fetch-Site: same-origin`; fixed 403 otherwise. Every response (and the stream) carries the
  design's CSP, `Referrer-Policy: no-referrer`, `nosniff`; `Vary: Cookie`. JSON bodies only.
- **Limits on expensive routes**: DM intents, NPC dialogue, Chronicle generation, context requests
  naming `ranking` (AI ranking) and `RequestAsset` commands, 20/min per actor with 2 in flight
  (released when the work ends), answered 429 right after authentication; the refused request
  starts no AI request.
- **Limit mechanics** (`apps/server/src/auth/limits.ts`, `window-counter.ts`,
  `apps/server/src/platform/net/addresses.ts`): clients are the address behind the trusted proxy
  (`LTW_TRUST_PROXY`, required in invitation mode; Fastify `trustProxy`), grouped as an IPv4
  address or an IPv6 /64; every table is a bounded time-bucketed counter (never more permissive
  than its limit, at most 10,000 keys, no sweep); refused and limited redeems are written as
  evidence at most 30 a minute.
- **Operator CLI** (`apps/server/src/auth/operator.ts`): `revoke-dm` (the DM's sessions in a
  campaign and its open DM invitations), `revoke-actor` (one actor's sessions and open invitations
  everywhere), both with `--authorization-source` echoed in the output; `sessions` (live sessions
  without token or hash); `dm-invite` as before.
- **Configuration and logs**: development personas refused in production, with `PUBLIC_ORIGIN`, or
  off a loopback `HTTP_HOST` (`apps/server/src/platform/config/config.ts`, `auth/composition.ts`);
  log lines never carry a client address or port, a header or a cookie (`LOG_SERIALIZERS`).
- **Live stream**: injected views carry the subscriber's cookie; sign-out, revocation and expiry
  close it (`unauthenticated`) within one cycle; a seat released behind a live session closes it
  (`gone`).
- **Kernel: `ReleaseCharacter {characterId}`** (DM only; `CharacterReleased {characterId,
  playerActorId}`, introduced at the dependency contract). Footprint reads the clock, the
  character and its roster entry, writes the roster entry and the player's. Undo restores the
  seat in assignment order (`rosterAssignedAt`) and is refused while any later command stands,
  since later decisions may rest on the empty seat; the release protects the assignment it ended.
  The generic command route refuses `ReleaseCharacter`. Earlier commands of the released player
  stay valid history (re-decision oracle).
- **Table** `0010_auth.sql`: hashes only, format checks, one-way update triggers, invitations never
  deleted; redeem evidence keyed by an HMAC under a process-local key, pruned after 7 days.
- **Deterministic evidence**: `apps/server/src/auth/sign-in.test.ts`, `member-routes.test.ts`,
  `sign-in-limits.test.ts` (proxy, /64 grouping, refusal budget, evidence cap, full tables, AI
  ranking), `limits.test.ts` (rotating addresses: bounded tables and cheap calls),
  `window-counter.test.ts` (never more permissive than its limit), `sign-in-cookies.test.ts`
  (no cross-site sign-out, clearing rule, redeem confirmation), `browser-checks.test.ts`,
  `sign-in-live.test.ts`, `sign-in-logs.test.ts` (captured logger at trace level, AI traces,
  evidence rows, live frames and response bodies hold no token, hash or cookie; no line holds a
  client address, direct or forwarded, IPv4 or IPv6), `modes.test.ts` (configuration
  combinations), `operator.test.ts`, `apps/server/src/platform/net/addresses.test.ts`,
  `credentials.integration.test.ts` (operator commands on PostgreSQL); `packages/domain/src/knowledge/release.test.ts` (decide,
  fold, replay from stored rows, undo order, strictly reverse undo, randomized seats with party
  memories under the re-decision oracle), `kernel/replay.test.ts` and `undo-preview.test.ts` with
  releases in the random command generator. Every reviewed suite passes unchanged except
  mechanical updates for the asynchronous `Authenticator` port.
- **Changed reviewed boundary**: none of the projections, the perspective rules or the ADR 0009
  order changed. The roster gained a removal path going forward (`ReleaseCharacter`), so Gate 06
  should review party-scoped projections after a release (a released character leaves the party
  view from then on, as after an undone assignment).

Stage 340 part B introduction evidence (ADR 0036, "Implementation (Stage 340 part B, browser)";
`docs/STAGE_340_DESIGN.md`, "Implementation notes (part B, browser)"; acceptance pending): the
browser end of row 340, **for Gate 06**. No route, projection or authorization changed.
- **Which sign-in**: the client asks `GET /auth/session`; a 404 (no sign-in routes) shows the
  development personas' token form, so a production build in `disabled` mode shows that form too,
  harmlessly (no persona is accepted there). Review that no other answer reaches the form.
- **The token's path** (`apps/web/src/session/invitation-link.ts`, `sign-in-flow.ts`,
  `apps/web/src/main.tsx`; amended by the part B review, `docs/STAGE_340_DESIGN.md` "Part B
  review fixes"): the fragment of `/join#<token>` is read once and the address and history entry
  replaced (`/`) before anything is requested; the token waits in a one-shot holder (a closure,
  never React state or props) and the redeem is sent once, only when the person presses "Take
  your seat", with the token in its JSON body only; a 409 hands it to a second one-shot holder for
  the question, and keeping the current sign-in, replacing it, success or any failure drops it;
  once the seat is taken, the sign-in kept or the person goes back to the start, the join page is
  replaced by a fresh start page (the browser's navigation timing entry keeps the address it
  opened with). The journeys assert from captured traffic that a link opened and left sends no request, that
  no request URL carried a token and no body outside a redeem did, that the address, history
  entry, timing entries, storage, script-visible cookies, IndexedDB, Cache Storage, service
  workers and the document keep none, and from heap snapshots that the page's JavaScript heap holds none after a
  join, a failure and keeping the sign-in.
- **The session in the browser** (`apps/web/src/api/client.ts`, `live.ts`,
  `apps/web/src/session/sign-in-watch.ts`): no `Authorization` header, `credentials:
  'same-origin'` for every request and the live stream; any 401 of a session (the stream's
  `unauthenticated` included) shows "You are signed out"; only the session on screen can be signed
  out by an answer. The cookie is the browser's: a 403 or 404, a live refusal or a close as
  `gone`/`forbidden`, `online` and the tab shown again make the tab ask `GET /auth/session` and
  its identity, and a 401 or another campaign, actor, role or character than it shows signs it
  out too (review: a tab must never keep another sign-in's world or send its actions under the
  new cookie). Sign-out is `POST /auth/sign-out` after a question; the screen changes only on 204
  or 401.
- **Fixed failures**: every refused, limited, malformed or unanswered redeem shows the same words;
  a signed-in browser is asked before any well-formed link (the server answers 409 before it reads
  the token), keeping is the first and focused choice and replacing waits for a visible, focused
  page and a pointer or key, and the current sign-in survives a failed replacement.
- **The DM's Players sheet** (`apps/web/src/dm/players-sheet.tsx`, `players-lists.tsx`,
  `use-players.ts`): only in the DM perspective of a session; lists what `GET …/invitations`
  answers (never a token, hash or actor ID; character names from the DM's own directory); the new
  link lives in the DM's memory and DOM only until hidden, used, revoked or replaced.
- **Deterministic evidence**: unit tests `apps/web/src/session/sign-in-flow.test.ts` (the
  fragment, the one-shot holders, the probe, the redeem on the click and its fixed failure,
  sign-out, naming the current sign-in, no `Authorization`, same-origin only),
  `invitation-token.test.ts` (no string of a V8 heap snapshot holds the token after keeping the
  sign-in or a failure), `sign-in-watch.test.ts`, `deliberate-choice.test.ts`,
  `apps/web/src/api/client.test.ts` and `live.test.ts` (the session connection: 401 and
  `unauthenticated` sign the screen out; 403, 404, other live refusals, `gone` and `forbidden`
  raise a doubt), `apps/web/src/dm/players.test.ts`; browser journeys `tests/e2e/sign-in.spec.ts`,
  `sign-in-tabs.spec.ts`, `sign-in-ru.spec.ts`, `sign-in-accessibility.spec.ts` on the
  invitation-mode test server (`apps/server/src/testing/ui-sign-in-server.ts`); every
  development-persona journey unchanged.

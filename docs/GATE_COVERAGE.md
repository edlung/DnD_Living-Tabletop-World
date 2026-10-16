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
| 350 (proxy) | Only the proxy publishes ports (80/443); the server, database and backups are unreachable from outside; HTTP redirects to HTTPS; TLS 1.2+ only; `/api` reaches the server without its prefix, with `Origin`, `Sec-Fetch-*` and credentials unchanged; the live stream passes unbuffered and uncompressed | Gate 06 / Stage 355 |
| 350 (trust boundary) | The server shares the internal `backend` network (no host address) with the proxy alone, listens only there, and is unreachable from the host and from the edge network; Caddy replaces a client's `X-Forwarded-For` and the server (Stage 340's `LTW_TRUST_PROXY` = the backend range) trusts it from that range alone, so a forged header changes no per-address limit | Gate 06 / Stage 355 |
| 350 (sign-in on the deployment) | Through the real proxy: the operator's DM link, a DM's player invitation, Russian play, revocation that closes the player's live stream within one cycle, used/revoked/forged links failing with one fixed 401, the 409 of a signed-in browser, cross-site refusals, sign-out; no token or session cookie in any container log | Gate 06 / Stage 355 |
| 350 (headers) | Every response carries CSP (`frame-ancestors 'none'`, `base-uri 'none'`), `Referrer-Policy: no-referrer`, `nosniff`, `X-Frame-Options: DENY`; a policy the server set (asset content) is kept, never weakened; HSTS only with a public certificate; no `Server`/`Via` | Gate 06 / Stage 355 |
| 350 (readiness) | `/readyz` reports ready only when the database answers, no migration of the build is pending and the build can read the whole event store; it never reveals why; health checks gate the proxy's start | Gate 06 / Stage 355 |
| 350 (backup/restore) | Dumps are checksummed and verified before use; the restore drill replays every campaign stream of a restored dump through the World Engine and matches the live state digests at the same versions, failing on any difference; a rollback can never start an image on history it cannot read | Gate 06 / Stage 355 |

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

Stage 330 part A introduction evidence (ADR 0035; `docs/STAGE_330_DESIGN.md`; baseline `5da1b05`;
part B, the live smoke and acceptance pending): **new surfaces for Gate 06**, row 330 of the
alpha-phase table ("no image reaches a player before DM approval; requests and metadata respect
scope; refusals and failures leave the neutral fallback").
- **Image routes** (ADR 0022 §5–6, ADR 0023; check order and visibility unchanged):
  `GET …/entities/:entityId/assets`, `GET …/assets/content/:contentHash`,
  `GET …/entities/:entityId/presentation`, `GET …/locations/:locationId/scene` and the DM's
  `GET …/assets`. Additive fields: `PlayerAssetView.purpose`, `EntityPresentation.figure` (a
  character, NPC or creature) and `battleMap` (a location), each the newest approved asset of that
  purpose under the images' rule (approved, players' audience, of an entity the perspective may
  see); `purpose` on the DM's requests and assets. `RequestAsset` (DM or system only, unchanged)
  takes an optional `purpose`; a `figure` or `battle-map` is a derived variant of the right kind.
  A job that made no provider call fails with the new asset failure `UNAVAILABLE`.
- **`openrouter-openai` generator** (`apps/server/src/images/`, `LTW_IMAGE_GENERATOR`; placeholder
  by default): `POST https://openrouter.ai/api/v1/chat/completions`, allowlisted OpenAI models, a
  fixed style system prompt, a task built from the entity's kind and recorded description, the
  variant, the purpose and the DM's typed note (never its name or ID); a derived variant sends its
  canonical reference as the input image, a new reference two curated style references.
  `redirect: 'error'`, a bounded time and answer size, only an inline PNG/JPEG/WebP data URL (no
  URL is ever fetched), re-encoded to WebP ≤ 1,536 px and ≤ 1.5 MB without metadata. The key comes
  only from `OPENROUTER_API_KEY`, is revealed only for the header, and reaches no log, error or
  record. Refusals, timeouts and provider errors map to `REFUSED`, `TIMEOUT`, `PROVIDER_ERROR`.
- **Image ledger** (migration `0011_image_budget.sql`, append-only): the ceiling exists only as an
  operator revision with the owner's authorization (`pnpm ai:operator image-budget-set`); no stored
  ceiling or zero denies every call; each call reserves its model's worst case under one exclusive
  advisory lock before it is sent, then settles to the reported cost (the whole reservation when
  none is reported; nothing only when provably never sent). Counters in `ai:operator status`.
- **Orphaned reservations** (migration `0012_image_orphaned_settlements.sql`, append-only): a job
  that stopped between its reservation and its settlement leaves the reservation counted whole.
  `pnpm ai:operator image-reservations --older-than-minutes <n>` lists unsettled ones (read-only);
  `image-reservation-settle --charge <id> [--charge-micros <n>]` with the owner's authorization
  closes one at the whole reservation or the given amount, as outcome `orphaned`, only when it is
  older than the longest generation bound plus margin (15 minutes), so a running job's reported
  cost is never pre-empted. The database requires the authorization beside every orphaned
  settlement (deferred constraint trigger) and lets an authorization name nothing else.
- **Live smoke tool** (`pnpm images:smoke`, `apps/server/src/testing/image-smoke.ts`; test
  support, not in builds): drives a running loopback server over HTTP with the development
  personas only, reads the ledger, the stored picture and the event store read-only from
  `DATABASE_URL`, reads no key or env file, and sends no AI request while a play session is open
  (the DM writes the proposal the local interpreter makes instead). It follows the portrait request
  the authoring commit itself queues, so one smoke is one paid image call.
- **Curated set import** (`seed:ravenford`, the browser-test server): every manifest entry through
  `RequestAsset` (DM) → `StartAssetJob`/`CompleteAssetJob` (worker, `curated` generator) →
  `ApproveAsset` (DM, players), idempotent by derived command IDs (a failed job is retried under
  the next derived ID, at most three); files are hash-checked first, and only a job that produced
  the committed picture (provider `curated`, the manifest's hash) is approved. The server's asset
  worker never runs the import's requests.
- **Boundary decisions to review**: the provider receives the entity's canonical description as
  the DM knows it (ADR 0035 §6), quoted as a description but not filtered for injected
  instructions (the output is an image the DM must approve); a 400 answer is read (at most 64 KiB,
  never logged) only to tell a refusal; an unsettled or unpriced call keeps its reservation; the
  curated import approves as the DM by the owner's decision (Q6), only pictures whose provenance
  it checked.
- **Deterministic evidence**: `packages/domain/src/assets/purposes.test.ts` (lineage, refusals,
  payloads, versions, undo hold, player view), `purposes.property.test.ts` (random figures and
  battle maps, presentation per perspective after every step),
  `packages/domain/src/visual/figures.test.ts` (figure/battle map per kind and perspective, never
  a candidate, DM-only to the DM, never chosen as the image),
  `apps/server/src/http/image-purposes.test.ts` (over HTTP; `UNAVAILABLE` leaves the fallback),
  `apps/server/src/images/openrouter-generator.test.ts` (request shape, answers, failure mapping,
  the key on every path), `openrouter-spending.test.ts` (reservation, settlement, release),
  `in-play.test.ts` (through the asset worker: the stored canonical reference reaches the
  provider), `reencode.test.ts`, `curated-import.test.ts` (idempotence, provenance, retries),
  `ledger.integration.test.ts` (ceiling, settle, append-only, the lock, races, operator CLI),
  `ledger-operator.integration.test.ts` (orphaned reservations: listing, settlement, refusals,
  the authorization constraints, the CLI), `apps/server/src/testing/image-smoke/run.test.ts` and
  `checks.test.ts` (the smoke against the production app: both authoring paths, a paid generator's
  ledger record, refusals, failures, visibility judgements),
  `images.integration.test.ts`, `apps/server/src/assets/worker.test.ts`,
  `apps/server/src/platform/config/config.test.ts`.
- **Changed reviewed boundary (Gate 05, rows 150–160)**: asset event payloads gained an optional
  `purpose`, absent for an image, so every type kept its version; the lineage the revision before
  wrote (`fixtures/history/5da1b05-asset-lineage.json`) loads, replays, re-decides, shows the same
  pictures and continues (`packages/combat/src/asset-history.test.ts`,
  `apps/server/src/images/images.integration.test.ts`). Presentation chooses its image among
  `image` assets only. No authorization rule, mutation path or undo rule changed.

Stage 330 part B introduction evidence (ADR 0035, amendment of 2026-10-16 "part B"; the client):
**new surfaces for Gate 06**, row 330.
- **The DM's image controls** (`apps/web/src/images/`): the selection's panel and the Images sheet
  exist only in the DM perspective (a React context the world screen provides there alone); they
  read the DM-only lineage route and send `RequestAsset`, `ApproveAsset` and `RetractAsset`
  through the existing command route, one at a time, with a client command ID kept across an
  uncertain answer. Candidates are fetched by the DM through the existing content route (the DM
  may fetch any asset's bytes); no candidate, request, note, label or generator reaches a lower
  perspective's page or requests.
- **Live coverage** (`apps/server/src/live/inventory.ts`): the DM perspective's fingerprint now
  covers `GET …/assets`, so the DM's controls follow the asset worker; no lower perspective
  covers it, the DM's own included.
- **Pictures for everyone**: approved figures and battle maps (`EntityPresentation.figure`,
  `battleMap`, unchanged server rules) on the battlefield and in the scene; an object's approved
  image in its panel. Nothing is shown before approval; an unreadable picture falls back to the
  medallion, the silhouette or the UI kit's ground.
- **Deterministic evidence**: `apps/server/src/live/asset-live.test.ts` (the DM is signalled at
  each step of a job; a player only when a picture it sees is approved; no hash in its stream),
  `inventory.test.ts`, `apps/web/src/images/lineage.test.ts`; browser journeys
  `tests/e2e/images-dm.spec.ts` (the player's page, presentation, bytes by hash and every API
  body hold no candidate; the approved picture arrives through the live signal),
  `images-curated.spec.ts`, `images-accessibility.spec.ts` on the test server's image campaigns
  (`apps/server/src/testing/ui-image-journeys.ts`).
Stage 330 part B review fixes (ADR 0035, amendment of 2026-10-16 "part B review"; ADR 0022
amendment of the same date): a **changed reviewed boundary** (Gate 05, rows 150–160: approval,
lineage, undo, re-decision of history) and new client surfaces for Gate 06, row 330.
- **Approval supersedes its kind** (`packages/domain/src/assets/decide.ts`, `evolve.ts`,
  `footprints.ts`, `records.ts` `sameKind`; `kernel/decide/undo.ts`): approving a derived picture
  supersedes the approved pictures of its kind (same entity and purpose; an image also the same
  label), listed in the payload's `supersedes`; their records are part of the approval's footprint
  (a later approval of the kind blocks undo of the earlier one) and of its undo restores; the
  undo hold and visibility rules are unchanged (a superseded picture holds its request as a
  superseded reference did, and is never shown). No authorization rule changed.
- **`AssetApproved` version 3** (`kernel/event-versions.ts`): version 2 is read alike and is an
  earlier writer's — canon as recorded for the re-decision oracle (which would otherwise report an
  earlier writer's second approval of a kind as deciding differently), resting on everything
  before it for undo. History written by the revision before
  (`fixtures/history/80d06df-approved-kinds.json`: two approved pictures of each kind, an undone
  variant approval) loads, replays every prefix with integrity, shows as that writer showed it,
  re-decides, verifies and continues: the next approval supersedes every approved picture of the
  kind, and its undo restores them (`packages/combat/src/approval-history.test.ts`; on PostgreSQL
  `apps/server/src/images/images.integration.test.ts`). The `5da1b05` lineage still verifies, its
  approvals now earlier-version (`asset-history.test.ts`).
- **Deterministic evidence**: `packages/domain/src/assets/supersede.test.ts` (an older picture
  approved after a newer one is shown to every perspective; figures and battle maps of any label
  are one kind; other kinds and the canonical reference untouched; undo order; retraction; a
  DM-only picture), `assets.property.test.ts` and `purposes.property.test.ts` (at most one
  approved picture of a kind after every step; after every approval the approved picture is the
  one presentation shows for its kind), `event-versions.test.ts`,
  `apps/server/src/http/image-approvals.test.ts` (over HTTP: the older figure and the older night
  picture are what the player sees; the superseded figure's bytes are a 404 to the player).
- **Client** (`apps/web/src/images/`): approval words from the lineage read after the approval
  (`approvalStanding`, `approvalWords`); one command at a time until the lineage shows its result
  (`command-state.ts`, `command-state.test.ts`); a lost answer shown with Retry in the Images
  sheet and every panel (`images-result.tsx`); focus recovery once per command
  (`focus-recovery.ts`); battlefield name plates above every figure (`combat/board/plates.tsx`,
  `geometry.ts` `plateAnchor`, `plateRoom`). Journeys `tests/e2e/images-commands.spec.ts`
  (supersession seen by the player and the DM's list; a dropped answer while approving, then
  another entity's panel; a double press sends one `RequestAsset`; the keyboard in the sheet; a
  panel's focus once per command), `battlefield-plates.spec.ts` (every plate the topmost thing at
  its centre, ends and number at 1440 × 900 and 820 × 1180, tilted and flat), updated
  `images-dm.spec.ts`; each fails on revision 80d06df.

Stage 330 before its pull request (rebased onto Stage 340's final head;
`reports/STAGE_330_COMPLETION.md`): presentation only, no reviewed boundary changed. Stage 320's
hit-testing and the plates' layer are combined (a name plate and a standing figure take the pointer
for their own combatant's square; `tests/e2e/combat-board-pointer.spec.ts`); the Chronicle shows
three UI-kit pictures (the desk, the ribbon tabs, the flashback frame), which state nothing about
the world (ADR 0034 amendment); text over them keeps 4.5:1
(`tests/ui-kit/chronicle-art-contrast.test.ts`). No route, projection, rule, command or
authorization changed.

Stage 350 part A introduction evidence (ADR 0037 with its 2026-10-16 implementation notes;
`docs/STAGE_350_DESIGN.md`; acceptance pending; local deployment only, no server): **new surfaces
for Gate 06**, rows 350 of the alpha-phase table. Part B (below) added the trust boundary and the
sign-in journeys on the local deployment.
- **Proxy and topology** (`deploy/compose.yaml`, `deploy/proxy/Caddyfile`): Caddy publishes 80
  and 443/tcp only (HTTP/3 off); `server` joins `edge` and the internal `data` network,
  `postgres`, `backup` and the drill database only `data`; containers run non-root with read-only
  root filesystems, no capabilities and `no-new-privileges` (PostgreSQL keeps its entrypoint's
  privileges). `/api/*` is proxied with the prefix stripped and `flush_interval -1`, without
  compression; `Host`, `Origin`, `Sec-Fetch-*`, `Cookie` and `Authorization` pass unchanged and
  a client's `X-Forwarded-For` is replaced. (Part A passed `LTW_TRUST_PROXY` as the proxy
  network `10.231.250.0/24`; part B replaced it with the backend network, below.) Evidence:
  `deploy/verify/smoke.sh`, `deploy/verify/proxy-contract.sh`, `deploy/verify/live-stream.sh`;
  the server's own handling of the header is Stage 340's (its tests). Transcripts:
  `reports/evidence/stage-350/` (index `00-index.txt`).
- **Headers**: CSP `default-src 'self'; img-src 'self' blob: data:; connect-src 'self';
  object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` added only
  where the server set none (`deploy/verify/proxy-contract.sh`: the asset content route's
  sandboxed policy survives), `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`,
  `Cross-Origin-Opener-Policy`, `Permissions-Policy`; HSTS only with `TLS_MODE=acme`.
- **Readiness** (`GET /readyz`, unauthenticated like `/healthz`): fixed bodies
  `{status: ready}` or 503 `{status: not_ready, failed: [check names]}`; checks bounded and
  shared; errors only in the log. Tests: `apps/server/src/platform/health/readiness.test.ts`,
  `apps/server/src/http/readiness-routes.test.ts`,
  `apps/server/src/world-engine/store-readiness.integration.test.ts`.
- **Reviewed boundary changed (ADR 0003, Gate 01 era foundation)**: the migrator refuses a
  database with migrations missing on disk unless the deployment's explicit rollback step passes
  `--allow-newer-database`; then it applies nothing, and drift is still refused
  (`migration-source.test.ts`, `migrator.integration.test.ts`). No canonical state, projection,
  mutation path or authorization rule changed. Operationally, a database restart no longer ends
  the server (`apps/server/src/platform/db/pool.ts`, `pool.test.ts`); `/readyz` reports it.
- **Backup and restore**: `deploy/backup/backup.sh` (custom-format dumps, retention, SHA-256
  manifest, `verify` before use; `deploy/verify/retention-check.sh`), the replay/digest CLI
  (`apps/server/src/world-engine/replay-digest*.ts`, `state-digest.ts`; tests beside them,
  including the real CLI against a copied database) and `deploy/scripts/restore-drill.sh`.
- **Operator surface**: `ai:operator spend` (read-only spend counters,
  `spend-report.integration.test.ts`); never over HTTP, never in startup logs.
- **Local-only verification aids** of part A (`deploy/verify/dev-personas.yaml`,
  `deploy/verify/pre-340.yaml`) were deleted by part B.

Stage 350 part B introduction evidence (ADR 0037, part B notes; on Stage 340's server; local
deployment only, no server): rows 350 (trust boundary) and 350 (sign-in on the deployment).
- **Trust boundary** (`deploy/compose.yaml`): networks `edge` (proxy; published ports),
  `backend` (proxy and server; internal; gateway mode `isolated`, so the host has no address on
  it), `data` (server, database, backups; internal, isolated), `egress` (server; outbound AI
  calls; nothing listens there). The server listens only at `<LTW_BACKEND_PREFIX>.10`;
  `LTW_TRUST_PROXY` is `<prefix>.0/24`. Evidence: `deploy/verify/trust-boundary.sh` (members and
  flags of every network, the listening socket, TCP probes from the host's network namespace and
  from `edge` that never reach the API, from `egress` a refused port; forged `X-Forwarded-For`
  through the proxy is one client, 429 by the eleventh redeem; the same header from the proxy's
  address names a new client). Docker Desktop delivers all published-port traffic from the edge
  gateway, so locally every browser is one client (runbook section 11).
- **Sign-in on the deployment** (`deploy/verify/sign-in-journey.sh`, HTTPS through the proxy,
  cookie jars until Stage 340 part B's browser screens): the checks of row 350 (sign-in on the
  deployment), including the session cookie's attributes as the browser receives them and the
  operator's `sessions` listing without secrets. `deploy/verify/live-stream.sh` signs in by
  invitation (cookie and `Origin`) and adds the closing of the stream on sign-out.
- **Review campaign** (`apps/server/src/world-engine/review-campaign.ts`, test beside it): the
  Russian Ravenford through the World Engine under the fixture's command IDs, then the DM's
  `ReleaseCharacter` for the seat the fixture gave a development persona; idempotent, never takes
  a seat back, refused on a database holding the English Ravenford. No new kernel command, event,
  projection or authorization rule.
- **Deploy**: `deploy.sh` recreates every container when the resolved networks change
  (`LTW_NETWORKS_DIGEST`): Compose otherwise restarts an unchanged container on a recreated
  network without its service name.
- Transcripts: `reports/evidence/stage-350/part-b/` (index `00-index.txt`).

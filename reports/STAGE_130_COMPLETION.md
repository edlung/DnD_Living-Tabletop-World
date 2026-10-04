# Stage 130 Completion Report — NPC Intelligence

- Work order: `work-orders/OPUS_STAGE_130.md`
- Builder: Claude Opus 5.5 (matrix: MAX)
- Implementation revision: `0f2ae9071a8b7ac558f7c0b8bae1302f1f15ef9f` (branch `main`)
- Formal gate: **Astra Gate 04 — NPC Isolation**, covering Stages 100–130 (`docs/GATE_COVERAGE.md`). Request: `handoffs/ASTRA_GATE_04_REQUEST.md`. Required output: `reviews/ASTRA_GATE_04_REPORT.md`.
- Status: **COMPLETE — AWAITING_ASTRA_REVIEW**. Stage 140 is not started.

## Decisions

| ADR                                          | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0020](../docs/adr/0020-npc-intelligence.md) | Owner decisions of 2026-10-04: (1) guarded disclosure through evidence shown or trust, never while hostile or wary; (2) structured dialogue, with AI-phrased replies from a minimal context; (3) Insight as a DC 13 check, Trade not available; (4) deterministic monster suggestions for the DM. Answers Q2 (second half) and Q3.                                                                                                                                          |
| Amendments                                   | [0006](../docs/adr/0006-temporal-model-and-undo.md), [0007](../docs/adr/0007-world-kernel-model-and-event-store.md), [0010](../docs/adr/0010-memory-and-temporal-retrieval.md), [0012](../docs/adr/0012-context-engine.md), [0013](../docs/adr/0013-investigation.md), [0014](../docs/adr/0014-contradictions-and-epistemic-integrity.md), [0015](../docs/adr/0015-combat-engine.md), [0017](../docs/adr/0017-ai-gateway.md), [0019](../docs/adr/0019-continuity-engine.md) |

**Fixes outside the stage's scope.** The new randomized test (`npc.property.test.ts`) and review found gaps that predate this stage:

- **An answer passed over records told before without recording it** (since Stage 60). Undoing the earlier telling was allowed, after which the later answer would have shared that record too. Answers now record every record they pass over, withheld or told before (`considered`); Insight does the same.
- **An answer did not record the disclosure of records it withheld.** Now recorded the same way.
- **Play memories quoted names without recording them** (answers, examinations, Detect Magic). Memories now list them (`named`) and read them.
- **Records earlier writers left incomplete.** `MemoryRecorded` and `ContradictionDetected` move to version 3, so commands recorded by Stages 100–120 with these gaps rest on everything before them. This also closes the Stage 120 residual risk on contradictions recorded before `named`. A genuine history written by revision `b7a1a92` proves the reader (`fixtures/history/b7a1a92-npc-memories.json`).

## Delivered

- **Disclosure** (`investigation/disclosure.ts`): one rule for `AskAbout`, Insight, and the dialogue context. Orin, shown the strange symbol, tells the prior incident; never his secret.
- **Commands:** `ShowEvidence` (EVIDENCE of the asker's own scope only; a CONVERSATION memory) and `InsightCheck` (a Wisdom (Insight) check through the rules port at DC 13, once per character and NPC; on success an INFERENCE that the NPC holds something back about the topic; failure and nothing found look alike). New events `EvidenceShown`, `InsightChecked`; premise kinds `attitude`, `shown`, `considered`.
- **Dialogue:**
  - Talk check (`npc/talk.ts`) and the minimal NPC context (`npc/dialogue-context.ts`), with names the speaker does not know kept out.
  - The `npc-dialogue` use case in `@ltw/ai`: a prompt without IDs, quoted player words, local templates, the shared fallback policy, and traces by purpose.
  - Route `POST /campaigns/:campaignId/npcs/:npcId/dialogue`.
- **Monster suggestions** (`@ltw/combat` `suggestion.ts`): spell, then attack, then move, then end the turn; `movePlan` is now shared with `MoveCombatant`. Route `GET /campaigns/:campaignId/encounter/suggestion` (DM only).
- **Context Engine:** `show_evidence`; Insight legality (`ALREADY_ATTEMPTED`, sheet); Trade `NOT_AVAILABLE`; Talk and Insight for NPCs only; "ask about" a shown subject ranks high.
- **Hygiene:** a dialogue trace never seeds an authoring proposal; logs never carry the player's words or the reply; `kernel/facts.ts` split (`fact-keys.ts`, `premise-facts.ts`) to stay under 500 lines.

## Validation gate evidence — "Context isolation tests pass"

| Item                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planted secrets         | `fixtures/ravenford/npc-boundary.json` plants one marker for each forbidden kind (truth, DM note, description, hidden name, secret, claim, clue, party and character records, unrecallable memories, another NPC's records), plus markers each NPC may say, and markers it may say only once unlocked.                                                                                                    |
| The supplied context    | `npc/isolation.test.ts`: Mira, Orin, Thorne × 5 attitudes × 3 evidence states × 5 topics, each after the ask (225 contexts). No forbidden marker; every sayable marker; guarded markers absent while locked. Every line comes from the NPC's own or PUBLIC records and memories, never SECRET, UNKNOWN, or CONTRADICTION. Every name shown is one the speaker knows.                                      |
| What a provider is sent | `packages/ai/src/dialogue-isolation.test.ts`: 3 NPCs × 4 scenarios × 5 intents × 6 player lines, five of them injection attacks (720 replies). The exact requests (system, prompt, structured task) and the local replies hold no marker and no entity, record, or memory ID.                                                                                                                             |
| End to end              | `apps/server/src/http/npc-isolation.test.ts`: every NPC, 5 intents × 5 attack lines over HTTP; responses and provider requests are clean. `npc-dialogue.test.ts` covers the Orin scene over HTTP.                                                                                                                                                                                                         |
| Permission              | `talk.test.ts`, `npc-dialogue.test.ts`: 401, 400, 404 (outsider, unknown campaign), 403 (another player's character), 422 with `refused` before any command or provider call; an unknown NPC answers like a nonexistent one. Traces are DM-only, and a dialogue trace cannot seed authoring. Players see results through `forPlayer`. Logs hold neither words nor reply. The suggestion route is DM-only. |
| Rules legality          | Insight resolves through the rules port with a recorded d20 (`insight.test.ts`, HTTP). `command-alignment.test.ts` adds `show_evidence`, `insight_check`, and `talk` (against `checkTalk`) and checks that PUBLIC evidence is never offered. `suggestion.test.ts` drives a whole fight with suggested commands only, each accepted, using all four tactics.                                               |
| Disclosure outcomes     | `npc-disclosure.test.ts` (11): the Orin scene; hostile and wary withhold even when shown; trust shares without evidence, never a secret; evidence held by anyone else answers like a nonexistent record. Undo is refused beneath a showing, an attitude, a disclosure change, an earlier telling, or a quoted rename. `insight.test.ts` (5).                                                              |
| Exact under undo        | `npc.property.test.ts`: 6 seeds × 80 random steps of attitudes, disclosure, renames, moves, showings, asks, Insight, and undos; after every accepted undo the re-decision oracle passes.                                                                                                                                                                                                                  |
| Earlier writers         | `npc-memories-history.test.ts` (load, replay every prefix, continue, refuse undo beneath), the history in `history.property.test.ts`, and `npc-memories-history.integration.test.ts` (PostgreSQL, across a restart, dialogue on top).                                                                                                                                                                     |
| PostgreSQL              | `ai-traces.integration.test.ts`: dialogue traces round-trip; only the intent's command reaches the event store.                                                                                                                                                                                                                                                                                           |

**Mutation checks:** I injected 32 defects one at a time and reverted each. All 32 were detected:

- Disclosure:
  - trust unlocks nothing;
  - wary does not withhold;
  - secrets become shareable when shown;
  - no attitude premise;
  - no showing premise;
  - no premise for a withheld record;
  - no premise for a record told before.
- Insight: repeatable; a different DC; premises only for unshared records; context legality ignores the attempt.
- Showing evidence: accepts any record type; accepts any scope.
- Memory names: not recorded; not read.
- The NPC context:
  - holds all the NPC's records;
  - holds all NPC memories;
  - names unknown entities;
  - holds descriptions;
  - holds withheld content.
- Provider requests: an ID in the prompt; unescaped player words; local reply echoes the player.
- Talk: unauthorized; without presence.
- Server:
  - a player sees the full result;
  - a dialogue trace seeds authoring;
  - players get suggestions.
- Context: Trade legal; shown subjects not relevant.
- Suggestions: an attack before a spell.
- Earlier writers: the version bump removed.

**Larger randomized run** (temporary, then deleted): `npc.property.test.ts` with 60 seeds × 80 steps and 30 seeds × 200 steps passed after the told-before fix (two seeds had found it).

**Live server** (built from `0f2ae90`, PostgreSQL, crypto dice, local provider): as the player, Talk with an injection line, Ask, and Insight on Mira all answered 200. Orin, absent, answered 422 `NOT_PRESENT`. The suggestion route answered 403 to the player; the outsider got 404. The DM read the trace (purpose `npc-dialogue`, scope `NPC:mira-vale`, 18 sources); the player got 403. The server log held neither the player's words nor the reply.

## Validation

`pnpm validate:ci-local` exited 0 on `0f2ae90` (`NODE_ENV=test`, docker-compose PostgreSQL 18). It ran:

- frozen install, format, lint, typecheck;
- context budget: 376 files, none over the limits;
- unit tests: 116 files, 1269 tests passed (81 more than Stage 120);
- clean build;
- migrate twice;
- seed twice;
- integration tests: 14 files, 57 tests passed.

## Residual risks and notes

- **The Anthropic adapter has not been run against the live API.** No key is configured here; the local provider stands in. The owner approved sending the minimal context to it.
- **No personality.** NPC descriptions are DM data and may hold secrets, so the context omits them. A reply's voice comes from the attitude alone. A player-safe persona field would need an owner decision.
- **Guarded topics are named.** The context lists the subjects of withheld records (never their content), so a reply may be evasive about them. That hints at what Insight confirms canonically, as the owner chose.
- **A memory summary is the DM's text.** It is recallable when every record it cites may be said. A summary that mentions a secret without citing its record would reach the NPC (an authoring rule in ADR 0020 §3a).
- **No rate limiting** on dialogue: each request may call the provider.
- **Dialogue requests are not idempotent.** The server makes a fresh command ID each time, so a retried request runs again: the answer is `NO_EFFECT` and the Insight `ALREADY_ATTEMPTED`, while a repeated showing records another memory.
- **History from Stages 100–120** containing answers, examinations, Detect Magic, or contradictions is now undone only from its end backwards (ADR 0006 retest 3 rule).
- **Suggestions follow the fixed tactic**, so they may target a downed character if it is the nearest hostile. Monsters have no reactions.
- **Trade is not available**: the slice has no economy.

# 0020. NPC intelligence: scoped dialogue, guarded disclosure, Insight, and monster suggestions

- Status: Accepted
- Date: 2026-10-04
- Stage: 130; reviewed at Astra Gate 04; consumed by Stages 140 (relevance), 170 (Chronicle), 220–230 (UX)
- Decision type: product (owner-approved disclosure, dialogue, Insight and Trade, and monster behavior) and technical
- Owner approval: on 2026-10-04, before implementation, the owner chose:
  1. the disclosure rule in §2 (the second half of Q2);
  2. structured dialogue with AI-phrased replies from a minimal context (§3);
  3. Insight as a check and Trade as not available (§4);
  4. deterministic monster suggestions for the DM (§5).

  These answer Q3 in `docs/IMPLEMENTATION_PREREQUISITES.md` and the Stage 130 obligations of ADR 0013 §5 and ADR 0015 §7.

## Context

Stage 130 makes NPCs speak and act from strictly scoped context (`ARCHITECTURE.md`, NPC Context Isolation; invariants 5–6). Gate 04 will try to make an NPC reveal DM truth, hidden or system context, other NPCs' knowledge, future events, or campaign secrets. It passes only if the forbidden information was never supplied to the NPC in the first place. `RAVENFORD_SPEC.md` asks for the Orin scene: showing the strange symbol surfaces "Ask about symbol", and disclosure depends on knowledge, trust, motivation, and context.

## Options considered

1. **Give the dialogue model everything the NPC knows and instruct it to keep secrets.** This is the usual design, but one prompt injection leaks the secret, so it fails the gate by construction.
2. **Let the dialogue model decide what to disclose.** That makes AI an authority over canonical knowledge, against invariant 2.
3. **Decide every canonical outcome deterministically, then let the model phrase a reply from only what may be said now.** Chosen.

## Decision

### 1. Interactions (player commands)

| Intent                  | Command                                            | Canonical outcome                                                                         |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Talk                    | none                                               | none: a reply only                                                                        |
| Ask about a known topic | `AskAbout` (ADR 0013)                              | the shareable records about the topic, through the existing gate (§2)                     |
| Show evidence           | `ShowEvidence { characterId, npcId, knowledgeId }` | the NPC has seen the record; its subjects count as shown to that NPC by the asker's scope |
| Insight                 | `InsightCheck { characterId, npcId, topicId }`     | a check (§4)                                                                              |

- **Showing evidence.** The record must be EVIDENCE in the asker's own scope (the party's, or the character's alone); anything else is `KNOWLEDGE_NOT_FOUND`, exactly like a nonexistent record. The usual player preconditions apply (ADR 0013 §1), and a CONVERSATION memory records the exchange. Showing a subject again records only the memory. Everything is recorded as premises and undoable under ADR 0006.
- **Talk** runs no command and records nothing. It is authorized as a player command is (the DM, a system process, or the character's controller), and its preconditions are those of `AskAbout` without a topic, in the same order (`npc/talk.ts`).
- **Trade** remains a descriptor. The Context Engine reports it as illegal, `NOT_AVAILABLE`: the slice has no economy (owner).
- **Context Engine (ADR 0012).** For an NPC target: `talk`, `trade` (`NOT_AVAILABLE`), `insight_check` (a sheet, one attempt: `ALREADY_ATTEMPTED`), and one `show_evidence` per EVIDENCE record of the acting character's own scope (at most 5; medium relevance while it holds a subject not yet shown to this NPC). A subject the acting scope has shown the NPC makes "ask about" it high relevance. Talk and Insight are offered for NPCs only, since only NPCs answer them. `command-alignment.test.ts` keeps this aligned with what the World Engine and the Talk check accept.

### 2. Disclosure (owner decision)

`AskAbout` shares an NPC's record about the topic when it was not yet shared with the asker's scope and either:

- it is WILLING (ADR 0013 §3); or
- it is GUARDED (the default) and all three hold:
  1. its type is not SECRET, UNKNOWN, or CONTRADICTION;
  2. the NPC's attitude toward the party is not HOSTILE or WARY;
  3. the asker's scope has shown the NPC evidence naming one of the record's subjects, or the attitude is TRUSTED.

One function (`investigation/disclosure.ts`) answers for `AskAbout`, Insight, and the dialogue context, so they never disagree. The decision records what it rested on as premises:

- the attitude, whenever a guarded record was considered;
- the shown subject that unlocked a guarded record;
- every record about the topic it passed over, withheld or told before (`considered`: its disclosure and whether the scope had been told it).

An undo that would change the answer is therefore refused. Sharing still only copies the NPC's own records. Orin: show him the strange symbol, then ask about the symbol, and he tells the prior incident.

### 3. Dialogue (owner decision)

- **Order.** A dialogue request names an intent, plus an optional line of the player's own words (at most 500 characters). First the Talk check: if the NPC cannot hear the character, nothing runs and nothing is said. Then the World Engine decides the intent's command, if any. Only then is the reply phrased, by the `npc-dialogue` capability. A reply follows even when the command was rejected (for example `NO_EFFECT` or `ALREADY_ATTEMPTED`); the caller sees the command's result as any command result.
- **The minimal NPC context** is built by the domain (`npc/dialogue-context.ts`) from the state after the command. Every item carries its source ID for the trace:
  - who the NPC is: name and kind (not the canonical description, which player views never show either);
  - its attitude toward the party;
  - the time;
  - where it is and the entities it perceives there;
  - who is speaking;
  - what the speaker asked about, or read it for;
  - **only what it may say now:** its records that it has told the speaker's scope or that §2 would share with it now, PUBLIC records, and recallable memories (§3a);
  - what it has just shared;
  - the subjects of evidence the asker's scope showed it;
  - **guarded topics without content:** subjects of records it withholds (not UNKNOWN or CONTRADICTION), limited to entities the asker already knows.
- **Names the speaker does not know stay out.** An entity the speaker does not know (by its knowledge, ADR 0008) appears by kind only, the NPC included: an NPC the speaker does not know by name is told not to give a name.
- **Never in the context:** SECRET records, guarded content, WORLD_TRUTH, DM notes and descriptions, claims, clues, other holders' records and memories, names the speaker does not know, and anything after the current world time. Each list is capped, so the request stays small.
- **(3a) Recallable memories.** An NPC's own memory is recallable when it cites at least one record and every record it cites may be said now. PUBLIC memories are recallable. Orin's memory of the prior incident becomes recallable once the symbol has been shown. A memory's summary is the DM's text: one that touches a secret must cite the secret's record, and then it is never recallable.
- **What a provider receives** is a rendering of that context as names and sentences only: no entity, record, or memory ID reaches a provider. The instructions are fixed. The player's words are quoted as data, JSON-encoded with angle brackets escaped, so they can never open or close a block; they never change a canonical outcome. Isolation does not rest on the instructions: what the NPC must not say was never given to it.
- **The reply** is prose of at most 600 characters. It is never canonical and creates no record or memory. AI suggestions are not facts (invariant 7).
- **Providers** (as ADR 0017): with `ANTHROPIC_API_KEY` set, routing goes to Anthropic and then the local provider; otherwise to the local provider alone, under the owner's fallback policy (one switch, one repair).
  - The local provider replies from deterministic templates filled from the context only, and never reads the player's words.
  - The owner approved sending this minimal context to the external provider.
- **Traces.** Every reply is traced: purpose `npc-dialogue`, scope `NPC:<id>`, source IDs, the player's words, the intent, the command ID, the attempts, and the reply. Traces are DM data; a dialogue trace can never become an authoring proposal. Logs carry statuses and the trace ID, never the words or the reply.
- **HTTP.** `POST /campaigns/:campaignId/npcs/:npcId/dialogue` answers `{ command, refused, reply }` with the ADR 0009 check order: a FORBIDDEN caller gets 403; a character the NPC cannot hear gets 422 with `refused` set and no reply.

### 4. Insight (owner decision)

- **The check.** A Wisdom (Insight) check from the Rules Engine at DC 13, with no special natural 20 or 1 (ADR 0011). Each character gets one attempt per NPC; a repeat is `ALREADY_ATTEMPTED`.
- **On success** the asker's scope gains an INFERENCE record — "<NPC> seems to be holding something back about <topic>." — if the NPC holds a record about the topic that it has not shared with that scope and that is not WILLING, UNKNOWN, or CONTRADICTION (so GUARDED, including SECRET).
- **Nothing found and a failed check look alike**, except for the dice.
- **Premises.** The result rests on every record the NPC holds about the topic, shared or not, and its disclosure (`considered`), and the inference rests on the names it quotes.

### 5. Monster suggestions (owner decision)

- `@ltw/combat` computes (`suggestion.ts`), for the current combatant when it is a creature, one suggested legal action. The fixed tactic, in order:
  1. a stat-block spell on the nearest hostile target it may legally target;
  2. otherwise an attack on the nearest hostile target it may legally attack;
  3. otherwise a move toward the nearest hostile (the cheapest path, within the movement left, to the reachable square nearest it);
  4. otherwise ending the turn.
- Each suggestion carries its explanation and the exact command. Legality comes only from the functions the decisions themselves use: `monsterSpellPlan`, `attackPlan`, and `movePlan` (extracted from `MoveCombatant`'s decision). Ties go to turn order, then to the lower row and column.
- The DM reads it (`GET /campaigns/:campaignId/encounter/suggestion`, DM only) and submits it, or another legal action, as a normal command. Nothing acts by itself, and no AI is involved.

### 6. Records earlier writers left incomplete (technical)

Stage 130 found two gaps in what Stages 100–120 recorded: generated memory summaries quoted names their footprints did not read, and an answer that passed over a record told before did not record that. Both are fixed for new commands (memories carry `named`; answers record `considered`). Commands the earlier writers decided keep their records, but rest on everything before them: `MemoryRecorded` and `ContradictionDetected` move to version 3 (ADR 0007 Stage 130 amendment), so undo refuses anything beneath such a command while it stands (ADR 0006 retest 3 amendment). `fixtures/history/b7a1a92-npc-memories.json` holds what the Stage 120 writer recorded; the current reader loads, continues, and safely undoes it.

## Consequences

- **Stage 140** may rank these actions; the rules stay authority.
- **Stage 170** may cite dialogue only through canonical records; replies are not history.
- **Stage 220–230** build the conversation and monster-turn UI on these routes.
- **A future economy** needs its own decision before Trade executes.
- A reply's tone may reflect the NPC's attitude, which players otherwise never see (ADR 0019 §3); the owner chose to give the NPC its attitude.

## Invariants affected

Implements 5 and 6 for runtime NPCs, keeps 2 and 7 (AI never decides or records knowledge), keeps 8–9 (rules decide legality), and preserves 1, 3, 11, 12, and 18. No invariant is weakened.

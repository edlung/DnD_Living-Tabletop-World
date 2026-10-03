# 0010. Memory, sessions, impossible memories, and temporal retrieval

- Status: Accepted
- Date: 2026-10-03
- Stage: 30; consumed by Stages 50–70, 130, 170
- Decision type: product (requires owner approval)
- Owner approval: approved as written by the project owner on 2026-10-03 (Claude Code session, Stage 30 kickoff)

## Context

Pillar 2 ("World as Memory") requires that observations, conversations, discoveries, decisions, and consequences remain recallable. `RAVENFORD_SPEC.md` requires that a prior-incident memory become recallable for Orin and that Chronicle memories open flashbacks. `ADVERSARIAL_TESTS.md` B and J require:

- no memories before the holder existed;
- no memories of private events the holder neither observed nor was told about;
- no memories created retroactively by state changes;
- retrieval that respects CHARACTER/PARTY scope and resists misleading similarity.

`docs/GATE_COVERAGE.md` (row 30) requires retrieval to keep the ADR 0008 boundary under indirect semantic, entity, and time queries. Gate 02 reviews it.

## Options considered

1. **Derive memories automatically from every event.** It cannot express subjective recollection, and it would leak events a holder never witnessed.
2. **Shared memories with per-holder ACLs.** Same objections as for knowledge in ADR 0008.
3. **Explicit, single-holder memory records validated against the world timeline.** Chosen.

## Decision

### Memories

- A memory has one **holder scope**: PUBLIC (communal history), PARTY, CHARACTER(c), or NPC(n). DM and WORLD_TRUTH are not memory scopes: the event stream and knowledge already hold the canonical truth.
- **Kinds:** OBSERVATION, CONVERSATION, DISCOVERY, DECISION, CONSEQUENCE.
- **Fields:**
  - a summary;
  - `occurredAt` — the world time it happened (concrete, never "before history");
  - an optional location and participants (entities);
  - an optional session;
  - links to related knowledge records and, for CONSEQUENCE, to the memories that caused it;
  - a salience from 1 to 5.
- Memories are immutable and are created only by explicit DM/system commands through the World Engine (undoable under ADR 0006). Nothing creates memories implicitly: moving an NPC or changing a relationship never manufactures a memory.

### Impossible memories are rejected at authoring

- `occurredAt` must not be later than the world clock: no memories of the future.
- The holder, every participant, and the location must have existed at `occurredAt`.
- **Presence:** for OBSERVATION and CONVERSATION held by a character or NPC, the holder must have been at the location (or inside it) at `occurredAt` according to the world timeline under current canon. In a CONVERSATION the holder must also be a participant. For PARTY memories of these kinds, at least one party member must have been present.
- **What a memory may cite:** related knowledge and causing memories must be visible to the holder's perspective (ADR 0008). Causes cannot be later than the consequence.
- **Memories hold their premises:** a memory depends on the placements, entities, knowledge, and memories that made it valid, so those cannot be undone while the memory stands (ADR 0006 §9).

### Sessions

- A session is an out-of-world play session: a title, plus world and record start and end. At most one session is open at a time. Memories may reference a session.
- Campaign members (DM and players) may list sessions. Session titles must therefore not contain secrets.

### Retrieval

- **Scope comes first:** memories are filtered to the requesting perspective (the ADR 0008 table) before any matching, scoring, or counting. Hidden memories never influence results, scores, totals, or ordering.
- **Filters:** text, participant entity, location (including places inside it), world-time window, kind, session, and "as of" world time T, meaning memories that had happened by T.
- **Ranking is deterministic and explained:**
  - **Text relevance:** word overlap with the memory's visible content. This is a provider-neutral stand-in for semantic similarity; an embedding index may replace it at the AI stages behind the same scope-first contract.
  - **Salience.**
  - **Temporal proximity** to the reference time.
  - **Ties** go to the most recent memory, then the lowest ID.
  - A text query returns only memories with some text overlap.
- **Views** show only whitelisted fields. Cited knowledge, causes, participants, and locations appear only if the perspective can see them; entities named by visible memories become known to that perspective.

## Consequences

- Stage 60 discoveries and Stage 130 dialogue will create memories through these commands and inherit the same checks.
- Chronicle (Stage 170) and flashbacks select from scoped memories, never from raw events for non-DM views.
- Lexical relevance is weaker than semantic similarity. Entity, time, and scope filters, rather than wording, are the primary defense against misleading similarity.

## Amendments

- 2026-10-03 (Gate 02 remediation, G02-H01; owner-approved). The location filter ("including places inside it") follows, for any non-DM perspective, only parent links where every location in the chain is known to that perspective. A location the perspective does not know, or an unknown link in the chain, matches nothing, exactly as a nonexistent location does. Totals, scores, and order are therefore identical. Containment between two known places counts as known geography; to keep a place's whereabouts secret, the DM keeps the place itself unknown (ADR 0008). The DM perspective uses all containment.

## Invariants affected

Implements the memory portion of 5, 6, 12, and 19, and preserves 1, 4, 7, and 11. No invariant is weakened.

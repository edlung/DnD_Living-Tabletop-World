# Relationships (`src/relationships/`)

An NPC's attitude toward the party: HOSTILE, WARY, NEUTRAL (default), FRIENDLY, TRUSTED. Authority: `docs/adr/0019-continuity-engine.md` §3 (owner-approved; the relationship part of Q2).

| Concern                                        | File         |
| ---------------------------------------------- | ------------ |
| `attitudeOf`, attitudes that withhold sharing  | `records.ts` |
| `RelationshipChanged` payload and undo restore | `events.ts`  |
| Fold and restore                               | `evolve.ts`  |
| `SetRelationship` (DM or system)               | `decide.ts`  |

Rules:

- Only an explicit `SetRelationship`, directly or through a confirmed authoring proposal, changes an attitude. Nothing else follows from it: no memory, knowledge, or disclosure (ADVERSARIAL B4).
- A dead NPC's attitude cannot change (`TARGET_DEAD`); a non-NPC has none (`INVALID_RELATIONSHIP`).
- The event reads the NPC's existence and status and writes `relationship:<npcId>`; undo restores the previous attitude.
- DM data: no player view, outcome, or context shows an attitude. How it affects runtime disclosure of GUARDED records is Stage 130's decision (Q2, second half).
- `RelationshipChanged` was introduced at schema version 2 (`kernel/event-versions.ts`, `INTRODUCED_AT`): version 1 is refused.

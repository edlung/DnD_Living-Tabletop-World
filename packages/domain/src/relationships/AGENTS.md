# Relationships (`src/relationships/`)

An NPC's attitude toward the party: HOSTILE, WARY, NEUTRAL (default), FRIENDLY, TRUSTED. Authority: `docs/adr/0019-continuity-engine.md` §3 and `docs/adr/0020-npc-intelligence.md` §2–3 (owner-approved; Q2).

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
- DM data: no player view or outcome shows an attitude. It decides runtime disclosure of GUARDED records (ADR 0020 §2: hostile or wary withholds; trusted shares without evidence), and answers record it as a premise. The NPC's own dialogue context holds it (ADR 0020 §3), so a reply's tone may reflect it; no Context Engine output may depend on it (`packages/context/src/leakage.test.ts`).
- `RelationshipChanged` was introduced at schema version 2 (`kernel/event-versions.ts`, `INTRODUCED_AT`): version 1 is refused.

# Quests (`src/quest/`)

The party's quest log as a projection of its own history (invariant 15). Authority: `docs/adr/0025-ravenford-integration.md` §2 (owner-approved ownership, triggers, and visibility). Definitions are content: `fixtures/ravenford/quests.json`, validated with `questBookSchema` (`@ltw/contracts`).

| Concern                                                   | File             |
| --------------------------------------------------------- | ---------------- |
| Activation, milestones, ordering, visibility (`questLog`) | `projection.ts`  |
| The DM's quests by hand: record, events, decisions, view  | `hand-quests.ts` |

Rules:

- Never store or record a quest book's quest; never let a decision read one. Compute it from effective events (`effectiveEvents`) on every read.
- The DM's quests by hand (docs/adr/0058-campaign-content.md §2) are the one stored kind: a world fact (`handQuests`, `QuestSet`, `QuestStepSet`), never mixed with the projection; a player sees only the known ones.
- Read every condition from the history as it stood at the event that met it: where things were, who was in the party, and what a record was about. Never consult the present state for the past (Gate 05, G05-M01); location nesting is the only timeless lookup.
- Only the party's own history counts: PARTY-scope records and memories, members' placements and examinations, fights a member survived. A character's private record must never advance the party's quest.
- The party, its members' CHARACTER perspectives, and the DM read it; only the DM sees sequences. Anything else gets an empty list.
- A new milestone kind is an amendment to ADR 0025 and a contract change (`QUEST_MILESTONE_KINDS`).
- Tests: `quest.test.ts`, `gate05-m01.test.ts` (`quest_examination_uses_location_when_examined`); survival in `packages/combat/src/quest-survival.test.ts`; the played slice in `apps/server/src/scenario/`.

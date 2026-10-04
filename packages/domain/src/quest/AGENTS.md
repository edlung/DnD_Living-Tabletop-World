# Quests (`src/quest/`)

The party's quest log as a projection of its own history (invariant 15). Authority: `docs/adr/0025-ravenford-integration.md` §2 (owner-approved ownership, triggers, and visibility). Definitions are content: `fixtures/ravenford/quests.json`, validated with `questBookSchema` (`@ltw/contracts`).

| Concern                                                   | File            |
| --------------------------------------------------------- | --------------- |
| Activation, milestones, ordering, visibility (`questLog`) | `projection.ts` |

Rules:

- Never store or record a quest; never let a decision read one. Compute it from effective events (`effectiveEvents`) on every read.
- Only the party's own history counts: PARTY-scope records and memories, members' placements and examinations, fights a member survived. A character's private record must never advance the party's quest.
- The party, its members' CHARACTER perspectives, and the DM read it; only the DM sees sequences. Anything else gets an empty list.
- A new milestone kind is an amendment to ADR 0025 and a contract change (`QUEST_MILESTONE_KINDS`).
- Tests: `quest.test.ts`; survival in `packages/combat/src/quest-survival.test.ts`; the played slice in `apps/server/src/scenario/`.

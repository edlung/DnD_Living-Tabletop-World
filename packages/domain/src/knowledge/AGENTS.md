# Knowledge Boundary (`packages/domain/src/knowledge/`)

Security-critical module. Authority: `docs/adr/0008-knowledge-boundary.md` (owner-approved), invariants 4–7. Gate 01 reviews it; every later stage that reads knowledge must go through `perspective.ts` → `queries.ts`.

| Concern                                         | File                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| Record shape, scope keys                        | `records.ts`                                   |
| Event payloads and undo restores                | `events.ts` (composed into `kernel/events.ts`) |
| Authoring rules (AddKnowledge, AssignCharacter) | `decide.ts`                                    |
| Fold                                            | `evolve.ts`                                    |
| Who may use which perspective; visible scopes   | `perspective.ts`                               |
| Canonical → view whitelist                      | `projection.ts`                                |
| Perspective-scoped queries                      | `queries.ts`                                   |

Rules:

- Never return a `KnowledgeRecord`, `EntityState`, or other canonical object to a perspective. Build views in `projection.ts`, one explicit field at a time.
- A hidden record or entity must be indistinguishable from a nonexistent one: return `null`/empty, never a different error, count, ID, or placeholder.
- Permission depends only on the actor's role (`campaignRole`), never on whether a requested target exists.
- Never add a default or fallback perspective. Missing or invalid means rejected.
- Records never change type. Facts come only from new DM-authored records (ADR 0014). Claims (`state.epistemics`) are DM data; only the DM projection shows them.
- Footprints for knowledge events live in `kernel/facts.ts`; keep them complete (holder, subjects, attribution, related records).
- Tests: `*.test.ts` here. Keep the randomized boundary test passing when adding fields or queries.

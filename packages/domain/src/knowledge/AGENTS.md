# Knowledge Boundary (`packages/domain/src/knowledge/`)

Security-critical module. Authority: `docs/adr/0008-knowledge-boundary.md` (owner-approved), invariants 4–7. Gate 01 reviews it; every later stage that reads knowledge must go through `perspective.ts` → `queries.ts`.

| Concern                                              | File                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Record shape, scope keys                             | `records.ts`                                                                      |
| Event payloads and undo restores                     | `events.ts` (composed into `kernel/events.ts`)                                    |
| Authoring rules (AddKnowledge, AssignCharacter)      | `decide.ts`                                                                       |
| Fold                                                 | `evolve.ts`                                                                       |
| Who may use which perspective; visible scopes        | `perspective.ts`                                                                  |
| Canonical → view whitelist                           | `projection.ts`                                                                   |
| Perspective-scoped queries                           | `queries.ts`                                                                      |
| Authenticated caller and current perspective choices | `session.ts` (current assignment only; no credentials or other player identities) |

Rules:

- Never return a `KnowledgeRecord`, `EntityState`, or other canonical object to a perspective. Build views in `projection.ts`, one explicit field at a time.
- A hidden record or entity must be indistinguishable from a nonexistent one: return `null`/empty, never a different error, count, ID, or placeholder.
- Permission depends only on the actor's role (`campaignRole`), never on whether a requested target exists.
- Never add a default or fallback perspective. Missing or invalid means rejected.
- `knownEntityIds` derives from `knownEntityBases` (the earliest premise per known entity), so known sets and recorded premises cannot diverge. `isWithinKnownLocation` is the only containment a non-DM read may use (Gate 02).
- Records never change type. Facts come only from new DM-authored records (ADR 0014). Claims (`state.epistemics`) are DM data; only the DM projection shows them.
- Footprints for knowledge events live in `kernel/facts.ts`; keep them complete (holder, subjects, attribution, related records).
- Tests: `*.test.ts` here. Keep the randomized boundary test passing when adding fields or queries.
- Stage420 `projection-party.ts` supplies validated prepared-party IDs only for
  trusted owner read projections. Actual PLAYER resolution ignores it. Never use
  it for campaignRole, controlledCharacter, roster updates or command permission.

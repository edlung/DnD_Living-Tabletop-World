# Authoring (`src/authoring/`)

AI-assisted authoring: a DM-confirmed proposal applied by the World Engine as one command, `ApplyAuthoring`, or not at all. Authority: `docs/adr/0018-ai-authoring.md` (owner-approved scope, risk policy, warnings, and undo) and `docs/adr/0019-continuity-engine.md` (owner-approved checks, relationships, lore claims; explanations and options). Gate 04 reviews this surface (`docs/GATE_COVERAGE.md`, Stages 100–120).

| Concern                                                                       | File                                           |
| ----------------------------------------------------------------------------- | ---------------------------------------------- |
| Enabled operations and risk levels (L1–L4); what counts as public             | `policy.ts`                                    |
| Assessment: policy, each operation's own decision in order, blocking checks   | `assess.ts`                                    |
| `ApplyAuthoring` decision (legality) and the consent it requires              | `decide.ts`                                    |
| Commit-time consent gate, applied by the World Engine                         | `consent.ts`                                   |
| `AuthoringPremisesRecorded` (reads only)                                      | `events.ts`                                    |
| DM preview: the same authorization and decision a commit would get now        | `preview.ts`                                   |
| Continuity vocabulary, keys, option IDs                                       | `continuity/describe.ts`                       |
| Time: knowledge before a subject, after death; dead speakers; moving the dead | `continuity/timeline.ts`                       |
| Geography: witness elsewhere, `locationAt`; NPCs where a fight runs           | `continuity/geography.ts`                      |
| Identity: names in use; renaming someone players know                         | `continuity/identity.ts`                       |
| Knowledge and relationships: secrets, duplicates, sharing against attitude    | `continuity/knowledge.ts`                      |
| Lore: claims compared with every account and world truth                      | `continuity/lore.ts`                           |
| Warnings and notes, in one pass                                               | `continuity/findings.ts`                       |
| Options: edits and removals with dependents; repairs for rule rejections      | `continuity/edits.ts`, `continuity/repairs.ts` |
| Test support: Ravenford, Tomas, commit and preview helpers                    | `testing/world.ts`                             |

Rules:

- Operations are decided by their own kernel decision functions, in order, on the provisional state of their predecessors (`kernel/provisional.ts`). Never duplicate a kernel rule here.
- Legality — enabled operations, operation rules, and blocking continuity — must only rest on facts the operations' event footprints record, so dependency-checked undo and the re-decision oracle stay exact. `authoring.property.test.ts` runs the oracle under random undo.
- Risk levels and warnings are consent, not legality. They are computed at decision time and enforced by the World Engine against the command's `confirmation`, never re-checked by re-decision (ADR 0018 §4). A new warning must have a stable key (`CODE@index[:entityId]`).
- Adding an operation, scope, or knowledge type to what commits is an owner decision (ADR 0018 §2). Destructive or global operations (L4) never commit.
- Rejections carry `details.issues` (every blocking issue), `warnings`, and `risk` for the DM. These are DM-only: proposals, previews, and provenance never reach player views.
- Every issue and warning carries options: concrete command lists or an acknowledgement (ADR 0019 §1). Options never apply themselves; the server stores one only when the DM asks, as a new revision. Option IDs are `<finding key>/<n>`.
- A blocking check that reads a fact the operations' own events do not footprint must record it: `KNOWN_AFTER_DEATH` emits `AuthoringPremisesRecorded` (holder status) for NPCs that existed before the proposal. `options.test.ts` proves undo cannot reach beneath it.
- Tests: `assess.test.ts` (Stage 110 checks), `continuity-checks.test.ts` (Stage 120 checks), `options.test.ts`, `commit.test.ts`, `undo.test.ts`, `player-view.test.ts`, `authoring.property.test.ts` (randomized, with the re-decision oracle).

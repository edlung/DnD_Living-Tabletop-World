# Authoring (`src/authoring/`)

AI-assisted authoring: a DM-confirmed proposal applied by the World Engine as one command, `ApplyAuthoring`, or not at all. Authority: `docs/adr/0018-ai-authoring.md` (owner-approved scope, risk policy, warnings, and undo). Gate 04 reviews this surface (`docs/GATE_COVERAGE.md`, Stages 100–120).

| Concern                                                                | File               |
| ---------------------------------------------------------------------- | ------------------ |
| Enabled operations and risk levels (L1–L4); what counts as public      | `policy.ts`        |
| Continuity: blocking `KNOWLEDGE_BEFORE_SUBJECT`; the three warnings    | `continuity.ts`    |
| Assessment: policy, each operation's own decision in order, continuity | `assess.ts`        |
| `ApplyAuthoring` decision (legality) and the consent it requires       | `decide.ts`        |
| Commit-time consent gate, applied by the World Engine                  | `consent.ts`       |
| DM preview: the same authorization and decision a commit would get now | `preview.ts`       |
| Test support: Ravenford, Tomas, commit and preview helpers             | `testing/world.ts` |

Rules:

- Operations are decided by their own kernel decision functions, in order, on the provisional state of their predecessors (`kernel/provisional.ts`). Never duplicate a kernel rule here.
- Legality — enabled operations, operation rules, and blocking continuity — must only rest on facts the operations' event footprints record, so dependency-checked undo and the re-decision oracle stay exact. `authoring.property.test.ts` runs the oracle under random undo.
- Risk levels and warnings are consent, not legality. They are computed at decision time and enforced by the World Engine against the command's `confirmation`, never re-checked by re-decision (ADR 0018 §4). A new warning must have a stable key (`CODE@index[:entityId]`).
- Adding an operation, scope, or knowledge type to what commits is an owner decision (ADR 0018 §2). Destructive or global operations (L4) never commit.
- Rejections carry `details.issues` (every blocking issue), `warnings`, and `risk` for the DM. These are DM-only: proposals, previews, and provenance never reach player views.

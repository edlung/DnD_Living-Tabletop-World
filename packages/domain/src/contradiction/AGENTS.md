# Contradictions (`src/contradiction/`)

Claims, deterministic contradiction detection, and epistemic integrity. Authority: `docs/adr/0014-contradictions-and-epistemic-integrity.md` (owner-approved). Gate 02 attacks this module: fact/hypothesis separation, liar inference, cross-NPC contamination, secret truth through contradictions (`docs/GATE_COVERAGE.md` row 70).

| Concern                                                        | File             |
| -------------------------------------------------------------- | ---------------- |
| Claim shape, epistemic state, pair keys, conflict rule         | `records.ts`     |
| The one holder scope whose audience sees both records          | `joint-scope.ts` |
| `ClaimSet`, `ContradictionDetected` payloads and undo restores | `events.ts`      |
| Fold and restores                                              | `evolve.ts`      |
| `SetClaim` (DM)                                                | `decide.ts`      |
| Detection, neutral statement, derived IDs                      | `detect.ts`      |

Rules:

- Claims are DM data. They never appear in non-DM views, outcomes, contexts, or player command results. Only the DM projection (`knowledge/projection.ts`) shows them.
- Detection runs on every accepted decision (`kernel/decide/decide.ts`). It compares only claims set by that decision with existing claims. It writes nothing but new CONTRADICTION records and `ContradictionDetected` events, and never changes a record's type, statement, or relations.
- A contradiction lives only in `jointScope`. WORLD_TRUTH and DM are never joined. A claim's subject must be one of the record's (or clue's) subjects, so statements name only known entities.
- WORLD_TRUTH records may carry DM claims for continuity checks only (ADR 0019 §4; `carriesClaims`). Detection never joins them, so no player ever meets them. DM notes never carry claims.
- The neutral statement quotes names; `ContradictionDetected.named` (Stage 120) lists them, and the event's footprint reads those names, so undoing a quoted rename is refused while the contradiction stands. Events written earlier lack `named` and read only the subject's name. `named.test.ts` guards this.
- No valid transition happens in place. Facts come only from new DM-authored records (ADR 0014 §3).
- Shared copies (`investigation/conversation.ts`) and revealed evidence (`investigation/examine.ts`) inherit the claim of their source.
- Any future way to leave the party must respect contradiction footprints: `ContradictionDetected` in a CHARACTER scope reads the roster.
- Tests:
  - `detection.test.ts` (Ravenford)
  - `joint-scope.test.ts` (the ADR table)
  - `epistemic.property.test.ts` (randomized, with an independent oracle; extend it when adding a claim source)
  - `undo-and-replay.test.ts`
  - `set-claim.test.ts`

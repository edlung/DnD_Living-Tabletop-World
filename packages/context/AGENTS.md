# Context Engine (`@ltw/context`)

The context of one selected entity for one acting character. Authority: `docs/adr/0012-context-engine.md` (owner-approved). Pure: no AI, no I/O, no persistence. Gate 02 reviews this package for secret leakage (`docs/GATE_COVERAGE.md`, Stages 50–60).

| Concern                                                                                                               | File                                                                                     |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Entry point (`entityContext`)                                                                                         | `src/entity-context.ts`                                                                  |
| Inputs gathered once: perceived, known, visible records/memories                                                      | `src/inputs.ts`                                                                          |
| Perception                                                                                                            | `@ltw/domain` (`src/investigation/perception.ts`), shared with player-command validation |
| Whitelisted views (entity ref, visible state)                                                                         | `src/views.ts`                                                                           |
| Action catalog and check order                                                                                        | `src/actions.ts`                                                                         |
| Legality through `@ltw/rules`                                                                                         | `src/legality.ts`                                                                        |
| Legality in combat (positions, turn; ADR 0015 §6); reaction windows (`REACTION_PENDING`, `counterspell`; ADR 0016 §4) | `src/combat.ts` (through `@ltw/combat`)                                                  |
| "Ask about" topics                                                                                                    | `src/topics.ts`                                                                          |
| "Show evidence": the acting scope's EVIDENCE, and what it has shown an NPC (ADR 0020 §1)                              | `src/evidence.ts`                                                                        |
| Relevance heuristics                                                                                                  | `src/relevance.ts`                                                                       |

Rules:

- Legality comes only from `@ltw/rules` on the acting character's canonical sheet (invariant 9); in combat through `@ltw/combat`'s shared legality, never a context-only rule. Context never invents a legality rule; a new reason needs ADR 0012 or 0011 first, plus `CONTEXT_ILLEGAL_REASONS` in contracts.
- Relevance and topics read only `ContextInputs.records`, `memories`, `known`, and `perceived` — never `state.knowledge`, `state.memories`, or another holder's data. Relevance never changes legality.
- Check order protects secrets: actor state, then presence, then target status. An absent target is always `NOT_PRESENT`.
- Views are built field by field. Never spread canonical objects into output.
- Perceived entities are shown by ID and kind. An entity whose identity must stay secret needs an opaque ID (ADR 0008).
- Executable actions (`enter_location`, `inspect`, checks, `ask_about`, `show_evidence`, `insight_check`) must stay aligned with World Engine acceptance (ADR 0013, ADR 0020), and `talk` with the dialogue's `checkTalk`: `command-alignment.test.ts`. `trade` is `NOT_AVAILABLE`.
- Relevance may read the acting scope's own showings (`inputs.shown`), never an NPC's attitude, disclosure, or another holder's showings.
- Tests: `src/testing/ravenford.ts` seeds the full Ravenford fixture. `leakage.test.ts` holds the marker crawl and the noninterference check; extend both when adding an action or field.

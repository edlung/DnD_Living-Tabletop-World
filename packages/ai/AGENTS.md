# AI Gateway (`@ltw/ai`)

ADR 0017 (owner-approved). Pure: no I/O, no provider SDKs, and **no path to the World Engine**. Use cases: DM intents (ADR 0017), NPC replies (ADR 0020 §3), relevance ranking (ADR 0021), and the image-generation port (ADR 0022). `workspace-boundaries.json` `forbiddenNames` bars `WorldEngine`, event stores, and decision functions from non-test sources. The package reads a `WorldState` snapshot and returns proposals. Stage 110 owns any commit.

| File                        | Responsibility                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/providers.ts`          | Provider port: `AiProvider`, `ProviderRequest`/`Response`, `ProviderError` codes                            |
| `src/router.ts`             | `CapabilityRouter`: capability → ordered providers                                                          |
| `src/context-builder.ts`    | Context from one resolved perspective's projections; every item has a `sourceId`                            |
| `src/prompt.ts`             | Fixed instructions, the output tool schema, the delimited directory/request prompt                          |
| `src/validation.ts`         | Proposal schema plus reference checks against the directory                                                 |
| `src/fallback.ts`           | Owner's fallback policy: one switch on failure, one repair on invalid output                                |
| `src/dialogue.ts`           | NPC reply use case (ADR 0020 §3): fallback over `npc-dialogue`, validation, trace                           |
| `src/dialogue-prompt.ts`    | NPC prompt: the minimal context as names and sentences (no IDs), quoted player words                        |
| `src/local-dialogue.ts`     | Deterministic NPC replies from templates (never reads the player's words)                                   |
| `src/relevance.ts`          | Relevance use case (ADR 0021): budgeted `fast-context` ranking, validation, application, trace              |
| `src/relevance-prompt.ts`   | Ranker request: legal actions under opaque keys, the target as seen, the perspective's records and memories |
| `src/local-provider.ts`     | Deterministic offline interpreter (tests, development, fallback)                                            |
| `src/intent.ts`             | DM intent use case: role check, PUBLIC context, fallback, trace                                             |
| `src/traces.ts`             | `AiTraceStore` port and in-memory store                                                                     |
| `src/images.ts`             | Image port (ADR 0022 §3): `ImageGenerator`, `ImageBrief`, failure codes                                     |
| `src/placeholder-images.ts` | Deterministic local SVG placeholder: no text, never reads names, descriptions, or notes                     |

- DM intents use the **PUBLIC** horizon only (entities and world time). Do not widen the context or add records, memories, or DM data without a new owner decision.
- Every fallback reuses the same built context and actor. Never build a broader context for a retry.
- Results are `committable: false`. Do not add a commit path here: the DM commits through an authoring proposal (ADR 0018), whose content the server copies from the trace.
- A proposal may contain `SetDisclosure` only for a record it adds (the directory holds no records).
- NPC replies (ADR 0020 §3) speak only from the context `@ltw/domain` builds (`npcDialogueContext`). Never add an item here that the domain did not give, never put an entity, record, or memory ID into a request, and keep the player's words quoted (`quoted`). `dialogue-isolation.test.ts` checks the exact requests against the planted secrets of `fixtures/ravenford/npc-boundary.json`.
- A reply is never canonical and never a proposal: an `npc-dialogue` trace cannot seed authoring.
- Relevance (ADR 0021) may change only the `relevance` and order of legal actions (`applyRanking`). Offer only legal actions, under opaque keys; never an ID; only the acting perspective's own visible records and memories. Every failure, invalid output, or exceeded budget returns the deterministic actions as given. `relevance.test.ts` guards each rule.
- Images (ADR 0022 §3): a brief is DM data, never stored or traced. The placeholder draws a pattern from the seed only; it must never render text or anything from the subject (`placeholder-images.test.ts`). A real image provider is an owner decision; its adapter would live in the server.
- Provider adapters with I/O (Anthropic) and the PostgreSQL trace store live in `apps/server/src/ai/`.
- Test support: `src/testing/ravenford.ts` (seeds through the World Engine, allowed in tests only) and `src/testing/providers.ts` (scripted providers).

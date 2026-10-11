# AI Gateway (`@ltw/ai`)

ADR 0017 (owner-approved). Pure: no I/O, no provider SDKs, and **no path to the World Engine**. Use cases: DM intents (ADR 0017), NPC replies (ADR 0020 §3), relevance ranking (ADR 0021), the image-generation port (ADR 0022), and Chronicle prose (ADR 0024). `workspace-boundaries.json` `forbiddenNames` bars `WorldEngine`, event stores, and decision functions from non-test sources. The package reads a `WorldState` snapshot and returns proposals. Stage 110 owns any commit.

| File                        | Responsibility                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/providers.ts`          | Provider port: branded `RoutedProvider` (local/remote), classified `ProviderResponse`, `ProviderError` codes                   |
| `src/router.ts`             | `CapabilityRouter`: capability → `[]`, `[x]` or `[remote, local]`                                                              |
| `src/context-builder.ts`    | Context from one resolved perspective's projections; every item has a `sourceId`                                               |
| `src/prompt.ts`             | Fixed instructions, the output tool schema, the delimited directory/request prompt                                             |
| `src/validation.ts`         | Intent envelope (proposal/decline), proposal schema plus reference checks against the directory                                |
| `src/fallback.ts`           | Outcome table (ADR 0017 §5, ADR 0032 B1): one local switch, one same-remote repair, decline, cancellation, progress            |
| `src/fallback-answer.ts`    | Reading a provider's resolution once (`answerOf`), output serialization, an attempt's frozen billing view (B2)                 |
| `src/request.ts`            | One request's lifecycle (ADR 0032 B2): deadline, durable start or no-start answer, fallback, outcome freeze, bounded write     |
| `src/request-deadline.ts`   | The whole-request monotonic deadline and its signal; waiting no later than it                                                  |
| `src/dialogue.ts`           | NPC reply use case (ADR 0020 §3): fallback over `npc-dialogue`, validation, trace                                              |
| `src/dialogue-prompt.ts`    | NPC prompt: the minimal context as names and sentences (no IDs), quoted player words                                           |
| `src/local-dialogue.ts`     | Deterministic NPC replies from templates (never reads the player's words)                                                      |
| `src/relevance.ts`          | Relevance use case (ADR 0021): budgeted `fast-context` ranking, validation, application, trace                                 |
| `src/relevance-prompt.ts`   | Ranker request: legal actions under opaque keys, the target as seen, the perspective's records and memories                    |
| `src/local-provider.ts`     | Deterministic offline interpreter (tests, development, fallback); identity `isLocalProvider`                                   |
| `src/intent.ts`             | DM intent use case: role check, PUBLIC context, fallback, trace                                                                |
| `src/traces.ts`             | Request journal/trace port (`start`, `finalize`, `get`) and the in-memory store (tests, development)                           |
| `src/images.ts`             | Image port (ADR 0022 §3): `ImageGenerator`, `ImageBrief`, failure codes                                                        |
| `src/placeholder-images.ts` | Deterministic local SVG placeholder: no text, never reads names, descriptions, or notes                                        |
| `src/chronicle.ts`          | Chronicle prose (ADR 0024 §3): `narrative` rendering, validation with the World Engine's prose rules, template fallback, trace |
| `src/chronicle-prompt.ts`   | Renderer request: a chapter's entries under keys, names and times, labelled accounts, no IDs                                   |

- DM intents use the **PUBLIC** horizon only (entities and world time). Do not widen the context or add records, memories, or DM data without a new owner decision.
- Every fallback reuses the same built context and actor. Never build a broader context for a retry.
- Results are `committable: false`. Do not add a commit path here: the DM commits through an authoring proposal (ADR 0018), whose content the server copies from the trace.
- A proposal may contain `SetDisclosure` only for a record it adds (the directory holds no records).
- NPC replies (ADR 0020 §3) speak only from the context `@ltw/domain` builds (`npcDialogueContext`). Never add an item here that the domain did not give, never put an entity, record, or memory ID into a request, and keep the player's words quoted (`quoted`). `dialogue-isolation.test.ts` checks the exact requests against the planted secrets of `fixtures/ravenford/npc-boundary.json`.
- A reply is never canonical and never a proposal: an `npc-dialogue` trace cannot seed authoring.
- Relevance (ADR 0021) may change only the `relevance` and order of legal actions (`applyRanking`). Offer only legal actions, under opaque keys; never an ID; only the acting perspective's own visible records and memories. Every failure, invalid output, or exceeded budget returns the deterministic actions as given. `relevance.test.ts` guards each rule.
- Images (ADR 0022 §3): a brief is DM data, never stored or traced. The placeholder draws a pattern from the seed only; it must never render text or anything from the subject (`placeholder-images.test.ts`). A real image provider is an owner decision; its adapter would live in the server.
- Provider adapters with I/O (Anthropic and OpenAI-compatible DeepSeek), the admission wrapper,
  the pricing catalog, capability composition, the durable accounting store (`accounting/`) and the
  PostgreSQL request journal live in `apps/server/src/ai/`. Stage 300 remediation is in progress;
  consult `docs/PROJECT_WORKFLOW.md` before extending metering, fallback or trace contracts. Runtime
  budgets are not development/reviewer billing authorization.
- Outcomes (ADR 0032, B1): provider failures switch at most once, only to the zero-cost local provider; invalid output (including missing tool, truncation, unreadable JSON) gets one repair on the same remote provider (the local provider is never repaired: one local call per request); a valid intent decline is terminal `INVALID_OUTPUT`/`NO_PROPOSAL`; after the caller's signal aborts nothing new is dispatched. An exception from caller-supplied code (`build`, `validate`, `nowMs`, a progress listener) is never a provider attempt or transition (`fallback-callbacks.test.ts`). A provider resolving no well-formed response is one uncertain `BAD_RESPONSE` attempt (`fallback-nonresponse.test.ts`). A rejection keeps its code only as a genuine, unchanged `ProviderError` (`failureCode`); anything else is `UNAVAILABLE` (`providers.test.ts`, `fallback-rejection.test.ts`). `outcome-table.test.ts` pins every capability's row; never add a second paid provider to a route.
- Every use case runs through `runAiRequest` (ADR 0032, B2): no provider (local included) runs without a confirmed durable start; the public result and its trace are frozen once; an expired deadline freezes the cancellation row; the caller never waits past its deadline. Trusted accounting identity (`ProviderRequest.accounting`) comes from the use case and the fallback policy, never from a player, and never enters a payload, prompt or cache prefix (compare with `payloadOf` in tests). A request without a play session runs only its local provider. `request-lifecycle.test.ts` pins the no-start answers, deadlines and freeze for all four capabilities.
- The local provider is known by identity (`isLocalProvider`), never by the ID `local`. Only `createLocalProvider()` makes one; server composition refuses look-alikes.
- Test support: `src/testing/ravenford.ts` (seeds through the World Engine, allowed in tests only), `src/testing/providers.ts` (scripted providers; `testBrand`, the only test-only brand; `testAccounting`, `payloadOf`), `src/testing/capabilities.ts` (each use case over a route; `runWith` for journal, deadline and session) and `src/testing/journal.ts` (a journal whose start/finalize fail, stall or wait). Production sources never import `testing/` (`tests/architecture/test-support-imports.test.ts`).

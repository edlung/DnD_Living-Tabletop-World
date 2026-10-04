# AI Gateway (`@ltw/ai`)

ADR 0017 (owner-approved). Pure: no I/O, no provider SDKs, and **no path to the World Engine**. `workspace-boundaries.json` `forbiddenNames` bars `WorldEngine`, event stores, and decision functions from non-test sources. The package reads a `WorldState` snapshot and returns proposals. Stage 110 owns any commit.

| File                     | Responsibility                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `src/providers.ts`       | Provider port: `AiProvider`, `ProviderRequest`/`Response`, `ProviderError` codes   |
| `src/router.ts`          | `CapabilityRouter`: capability → ordered providers                                 |
| `src/context-builder.ts` | Context from one resolved perspective's projections; every item has a `sourceId`   |
| `src/prompt.ts`          | Fixed instructions, the output tool schema, the delimited directory/request prompt |
| `src/validation.ts`      | Proposal schema plus reference checks against the directory                        |
| `src/fallback.ts`        | Owner's fallback policy: one switch on failure, one repair on invalid output       |
| `src/local-provider.ts`  | Deterministic offline interpreter (tests, development, fallback)                   |
| `src/intent.ts`          | DM intent use case: role check, PUBLIC context, fallback, trace                    |
| `src/traces.ts`          | `AiTraceStore` port and in-memory store                                            |

- DM intents use the **PUBLIC** horizon only (entities and world time). Do not widen the context or add records, memories, or DM data without a new owner decision.
- Every fallback reuses the same built context and actor. Never build a broader context for a retry.
- Results are `committable: false`. Do not add a commit path here.
- Provider adapters with I/O (Anthropic) and the PostgreSQL trace store live in `apps/server/src/ai/`.
- Test support: `src/testing/ravenford.ts` (seeds through the World Engine, allowed in tests only) and `src/testing/providers.ts` (scripted providers).

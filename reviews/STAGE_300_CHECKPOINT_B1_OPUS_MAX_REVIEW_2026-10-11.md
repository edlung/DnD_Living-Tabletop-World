**Verdict: PASS**

No Critical or High findings, and every required check passes. Seven Low findings and one informational note are listed below. Each matters mainly as something to settle before B2 (the next checkpoint) builds on this code.

## 1. Artifact identity verified

- **Approved design:** `docs/STAGE_300_REMEDIATION_DESIGN.md` SHA256 = `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`. This matches draft 7.
- **B2 stop-scope delta:** `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md` SHA256 = `6bba003055bfd53ac4e069d01d5bf6e3a5a6e272fddb41a2f8305b55e153b485`. The brief gave no expected hash, so I recorded it but could not compare it.
- **Checkpoint A manifest:** of the 58 hashed files, 49 are byte-identical. B1 changed 9: `.env.example`, `apps/server/AGENTS.md`, `src/ai/gateway.ts`, `gateway.test.ts`, `live-ai.test.ts`, `platform/config/config.ts`, `docs/AI_CONTEXT_MAP.md`, ADR 0032 and `packages/ai/AGENTS.md`.
  - `src/ai/budget.ts` is absent, as A requires.
  - All accounting sources, migrations 0005/0006 and the five sources pinned by the B2 delta are unchanged from A.
- **B1 scope:** those 9 files plus 55 files that appear in the base diff but not in the A manifest.
- **Untouched by B1:** domain, context-builder, world-command and migration files. `db:migrate` reports 6 already applied and 0 new.
- **Environment files:** only `.env.example` exists; there is no `.env` or `.env.local`.

## 2. Findings

1. **Low: the adapter's start signal is not the release-proof boundary the design §1 text defines** (`apps/server/src/ai/raw-provider.ts:96-101`).
   - **Behaviour:** the adapter can report "transport not started" (`TRANSPORT_NOT_STARTED`) after it has already fired its start signal (`onStart`). This happens when the start hook throws, or when the caller aborts inside it. The tests pin this (`raw-adapter-hardening.test.ts:127-146`, `raw-adapters.test.ts:125-134`).
   - **Conflict:** design §1 says any failure after that signal is post-dispatch uncertainty; only a failure strictly before it proves the transport did not start.
   - **Why it is safe:** `fetch` is provably not called in these paths, so §3's wording ("strictly before invoking transport") still holds. The change is documented in ADR 0032 (B1 repair 1).
   - **Risk for B2:** the start signal no longer means "possibly dispatched", which B2's admission wrapper may assume. The architects should confirm this reading, or the code should be aligned with §1, before B2 builds on it.

2. **Low: a finished attempt's start callback stays live** (`packages/ai/src/fallback.ts:283-289`).
   - **Probe result:** calling an earlier attempt's `onStart` while the local fallback attempt runs produced the event order `start:remote, end:remote, start:local, dispatched, dispatched, end:local`. A stale transport-start notice landed inside the local attempt's window, and repeated calls were all published.
   - **Lost error:** an exception thrown by a listener during that late call is pushed onto the finished invocation's error list and silently dropped.
   - **Impact now:** none. Only trusted providers can be routed, and the raw adapters call `onStart` exactly once.
   - **Fix before B2:** make the callback fire at most once and ignore it after its attempt settles.

3. **Low: the guard against production code importing raw adapters is a filename match only** (`apps/server/src/ai/gateway.test.ts:127-164`).
   - It flags only the exact names `anthropic-provider.ts`, `openai-compatible-provider.ts` and `raw-provider.ts`.
   - An import written as `./anthropic-provider.js`, which TypeScript, Vite and `dist` all resolve, would not be flagged. The same goes for a computed dynamic import.
   - No ESLint rule backs the check. The runtime identity check in `composeRouter` remains the decisive guard.

4. **Low: ADR and Gate 06 documentation gaps.**
   - **Missing-tool delta:** design §3 asks for an explicit ADR 0032 delta for missing tool calls, including "count both attempts and charges in remote-only evaluation". The delta was written into ADR 0017 instead (`docs/adr/0017-ai-gateway.md:89-113`), and that clause appears in neither ADR.
   - **Stale ADR 0032 text, not marked as superseded:**
     - Decision 1 still says a refusal or missing tool call is mapped to `BAD_RESPONSE` (lines 17-19).
     - Decision 3 still says that with no routes set, the old default holds (Anthropic, then local) (line 23).
     - The Consequences still say the default model applies to every capability unless routes are set (line 55).

     A B2 implementer could restore an implicit Anthropic route from this text.
   - **Gate 06 coverage:** `docs/GATE_COVERAGE.md` does not record the changed provider-facing `INTENT_OUTPUT.description` (`packages/ai/src/prompt.ts:25-26`).

5. **Low (B2 hardening in B1 code): requests follow redirects with the key attached** (`raw-provider.ts:104-109`).
   - `fetch` follows redirects by default. On a cross-origin redirect, the Fetch standard strips only the `Authorization` header.
   - Anthropic's `x-api-key` header and the request body would therefore be re-sent to the redirect target.
   - This is unreachable at B1. Before B2 enables dispatch, use `redirect: 'error'`.

6. **Low (conflicts with the approved B2 delta): the OpenAI-compatible adapter accepts a caller-supplied `id` and `baseUrl`** (`openai-compatible-provider.ts:22-27,136-146`).
   - The B2 delta says provider identity is "the adapter's fixed ID, never a configurable label".
   - B2 must pin `deepseek` and its base URL in trusted code. Otherwise relabelling the provider could bypass stop matching.

7. **Low: DeepSeek response-classification edge cases** (`openai-compatible-provider.ts:53-72,114-121`).
   - A non-string `refusal` field fails the whole parse and is classed as a missing tool call. That is invalid output, which triggers a potentially paid repair, rather than a refusal.
   - Only `choices[0]` is inspected.
   - `finish_reason: insufficient_system_resource` with a complete tool call is accepted as valid output.

8. **Informational: the startup log covers only one capability** (`main.ts:56-65`). It logs the `reasoning` providers and the list of disabled remote routes. That is accurate at B1, but design §3 asks startup to report the resolved route for every capability.

## 3. Checks run (snapshot root)

| Check | Result |
|---|---|
| `pnpm run format:check` | pass |
| `pnpm run lint` (max warnings 0) | pass, exit 0 |
| `pnpm run typecheck` | pass |
| `pnpm run context-budget` | pass: 652 files, 0 over target, 0 over hard limit |
| `pnpm run test` | 188 files, 2042 tests passed |
| `pnpm run build` | pass (`tsc -b` and `vite build`) |
| `pnpm run db:migrate` | pass: 6 already applied, 0 new |
| `pnpm run seed:ravenford` | pass: 0 accepted, 91 duplicates, version 113 |
| `pnpm run test:integration` | 28 files, 138 tests passed |
| `pnpm run test:e2e` | 45 passed |

## 4. Probes added

The permission mode blocked writing files to scratch, so all probes ran inline with `node --conditions=@ltw/source -e`.

- **Forged provider errors:** an `Object.create` clone, an error whose `code` was changed after construction, a Proxy of a genuine error, and a bare string all classify as `UNAVAILABLE` (uncertain). Only a genuine, unchanged `ProviderError` keeps the not-started release proof. Pass.
- **Late start callback:** confirmed finding 2.
- **Malformed provider responses:** 14 cases, including negative, NaN, fractional, oversized and string token counts, a non-string model, a throwing getter, unknown kinds and codes, a thenable, an array and `null`.
  - Bad model or usage values are kept as unknown, never invented.
  - Non-responses become one uncertain `BAD_RESPONSE` attempt followed by one switch to the local provider.
  - Pass.
- **`composeRouter` identity checks:** these were all refused:
  - a Proxy, an `Object.create` copy, a spread copy and a kind-forged copy of the local provider;
  - a route with array holes, and a string route;
  - the local provider on the relevance route;
  - local twice, and three locals.

  Symbol keys are ignored. Routes stay frozen. Pass.
- **Raw adapter classification (17 cases, fake `fetch`):**
  - A refusal that also contains a tool call is a refusal.
  - Unknown, nested or null usage fields, a uppercase model name and a model name with a trailing space are all treated as suspect.
  - The only noteworthy results are the edge cases in finding 7.
- **Failures on the repair attempt:**
  - A suspect model or a refusal switches to the local provider with the original prompt and no repair note.
  - A budget denial ends as invalid output with `BUDGET_DENIED` and no local call.
  - A truncated response ends as invalid output with `INVALID_STRUCTURED_OUTPUT`.
  - A decline is terminal, ending as invalid output with `NO_PROPOSAL`.
  - Pass.
- **No network or key exposure:**
  - Outside tests, no server code calls `.reveal(` and only `raw-provider.ts` calls `fetch`.
  - Only tests construct the raw adapters.
  - Only `composition.ts` and test-support files construct routers.
  - Evaluation composes through `createAiGateway` with keys stripped and refuses live mode.
  - The gateway test combines a key whose `reveal()` throws, a global `fetch` spy and valid remote routes.
- **Route-parsing probes:** two inline attempts were denied by the permission classifier. I verified route parsing by inspecting `ai-routes.ts` and through the 14 rejection cases in `live-ai.test.ts`.

## 5. Residual risks and what I could not verify

- **No end-to-end test through the adapters.** No test drives adapter classification through the fallback and all four use cases ("through both adapters and all capability use cases"). That needs B2's admission wrapper; for now each layer is tested separately against the shared response type.
- **Outcome codes are computed but not persisted.** The use cases drop the fallback's outcome code (for example `PROVIDER_FAILURE` when the local switch succeeds, or `INVALID_STRUCTURED_OUTPUT`). B2's caller-outcome record must persist it.
- **Live responses will likely fail closed.** Strict usage and model allowlists will probably mark real provider responses as suspect (Anthropic `server_tool_use`, dated model versions) until the B2 catalog defines them. This is a usability limit, not a safety one.
- **Response size is unbounded.** It is limited only by the per-attempt timeout; request and response size limits are B2 catalog work.
- **A and B2 coverage.** I inspected A only where B1 relies on it. B2 items (journal, deadlines, caching, nullable trace IDs, attempt billing metadata) were out of scope.
- **Not verified:** whether the providers' live APIs accept these request bodies, because no live calls were permitted.

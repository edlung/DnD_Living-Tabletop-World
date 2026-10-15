# Stage 300 remediation checkpoint B1: independent initial acceptance (Opus)

**Verdict: PASS.** I found three Low findings and no Critical, High or Medium ones. None of them blocks B1, but fixing F1 and F2 should be the first step of B2, because B2 relies on both.

## Artifact identity (checked before and after the review)

- **HEAD:** `406904343bfe8542640035564d3e044561824125`.
- **Review manifest:** SHA256 `077be8cd…f357`, 148 entries, one of them a deletion (`apps/server/src/ai/budget.ts`).
  - Every entry hash matches the working tree, before and after.
  - The manifest lists exactly the dirty files in `git status`: nothing extra, nothing missing.
- **Supplied hashes:** all match.
  - Design `23e53e4d…aab2`.
  - Handoff `1bf5e10e…8248979`.
  - Pre-validate manifest `f99adf94…0f6250933`.
  - Validate log `f1f1e3bd…57f23`.
  - Transfer baseline `9a45f469…1ca8`.
- **`manifest.py` diff against the pre-validate manifest:** only administrative files differ:
  - `.prettierignore` (it now ignores only the exact-byte B2 stop-scope docs);
  - `docs/AI_CONTEXT_MAP.md`;
  - `docs/PROJECT_WORKFLOW.md`;
  - the B2 stop-scope design and its reviews;
  - the B1 receipt and validated manifest;
  - product decisions.

  No source file changed after validation.
- **Accounting and migrations:** all 30 manifest entries under `apps/server/src/ai/accounting/**` plus migrations `0005`/`0006` are byte-identical to the transfer baseline. The handoff's count of 32 is wrong; the behavior is unchanged.
- **B1 delta:** all 54 listed hashes match, except `AI_CONTEXT_MAP.md`, which changed after validation as an administrative edit. No source change is missing from the list.
- I did not open the implementation stream, its report or receipt, or any peer or prior review.

## Findings

### F1: Low. The usage allowlist reads inherited keys, so a few field names skip the fail-closed check

- **File:** `apps/server/src/ai/usage-facts.ts:41-58`. `spec.nested[field]` and `spec.labels[field]` are plain-object lookups, so they also find properties every JavaScript object inherits.
- **Effect:** a usage field named after one of those inherited properties is treated as an allowlisted nested group. This affects both adapters through their real `dispatch` path.
- **Reproducer** (Anthropic body with `input_tokens: 1, output_tokens: 2`):
  - with `"constructor": null`, `"__proto__": {}` or `"toString": null` added, the result is `kind: 'output'` with `unrecognized: []`. The output is kept even though the field is not allowlisted.
  - with `"constructor": {"usd": 5}`, `dispatch` throws a raw `TypeError` (`nested.includes is not a function`) after the start boundary. The fallback records generic `UNAVAILABLE` and loses the safe model, usage and request ID. The response is not classified `UNVERIFIED_BILLING`, so in B2 no restrictive stop would be appended.
  - DeepSeek behaves the same (`valueOf: {}`, `__proto__: {"cost": 9}`).
- **Contract violated:** handoff objective 2 ("any unrecognized usage/billing field yields no output") and design §1 ("unknown additions still fail closed").
- **Why only Low:**
  - a real provider is very unlikely to send these field names;
  - the silently accepted values are null or empty and carry no charge;
  - the throwing case still leaves a conservative post-start hold.
- **Required fix:** look up allowlist keys as own properties only (`Object.hasOwn`, or a `Map`/null-prototype spec). Convert any unexpected exception from classification after the start into a classified result, rather than letting it bubble up as an unknown error.
- **Regression:** for both adapters, `constructor: null`, `__proto__: {}`, and `constructor: {x: 1}` must each give `suspect`/`UNVERIFIED_BILLING` with the facts kept.

### F2: Low. `composeRouter` checks one copy of the routes and builds the router from another

- **File:** `apps/server/src/ai/composition.ts:32-44`. It validates `Object.entries(routes)` and then passes the original `routes` object to `new CapabilityRouter(routes)`, which reads it again.
- **Reproducer:** `routes = { get reasoning() { return reads++ === 0 ? [local] : [forgedRemote, local]; } }` yields a composed router whose `reasoning` route is `['anthropic:remote:FORGED', 'local:local:genuine']`. An iterable that returns different items on each pass has the same effect.
- **Reach:** neither configuration nor request input can reach this. The only callers are `gateway.ts` and evaluation through `createAiGateway`, both passing a literal object, so exploiting it takes deliberately adversarial composition code.
- **Why it still matters:** B2 makes `composeRouter` the runtime enforcement of admission ("a forged … cannot reach them").
- **Required fix:** take one frozen snapshot (one `Array.from` per entry), validate the snapshot, and build the router from that same snapshot.
- **Regression:** a getter-backed or Proxy routes object must throw `CompositionError` or end up with only validated entries.

### F3: Low. `LTW_AI_ROUTES` silently drops text after a second `=`

- **File:** `apps/server/src/platform/config/ai-routes.ts:31`. `part.split('=')` keeps only the first two pieces.
- **Reproducer** (with both keys set, through `loadConfig`):
  - `reasoning=anthropic:m,local=deepseek:x` is accepted as `["anthropic:m","local"]`;
  - `fast-context=deepseek:m=anthropic:n` is accepted as `["deepseek:m"]`, and the dropped provider's key is never checked;
  - `reasoning=local=anthropic:m` is accepted as `["local"]`.
- **Impact:** it cannot produce a forbidden shape or a second remote, but objective 6 and ADR 0032 say "rejected, never truncated."
- **Required fix:** a route part with anything other than exactly one `=` is a syntax error.
- **Regression:** the three strings above must be rejected.

### Not findings: hardening notes for B2

- **I1:** one prepared request can be sent more than once. Dispatching the same prepared object twice made two `fetch` calls. The design doesn't require single use, but the B2 admission wrapper must allow exactly one dispatch per reservation. Making `owns` single-use would be cheap defence in depth.
- **I2:** the guard on router construction sites (`gateway.test.ts:150`) is a text scan for `new CapabilityRouter(`, which an alias would get past. Runtime safety rests on `composeRouter` being the only production construction site. Keep the evaluation-path composition (C) under that pin.
- **I3:** `test-support-imports.test.ts` checks only relative specifiers and skips `testing/` folders, including `testing/eval`. This is adequate today: `@ltw/ai` exports only `.`, and evaluation composes through `createAiGateway` (I checked `eval-runners.ts:46`).
- **I4:** if an admission denial resolves after the caller has gone, it is recorded as `CALLER_CANCELLED` with zero usage instead of its denial code. It is harmless because nothing was reserved.

## Contracts assessed, with no defect beyond the above

1. **Prepare/dispatch.**
   - `prepare` returns a frozen, adapter-owned object holding an immutable string body. It makes no `fetch` call and does not read the key.
   - `dispatch` refuses copies and requests prepared by another adapter with `TRANSPORT_NOT_STARTED`, without calling `onStart` or `fetch`.
   - It reads the key in the header builder before `onStart`, and calls `onStart` synchronously right before `fetch`.
   - Every failure after the start is an uncertain code. If the caller's abort and the attempt timeout coincide, `CALLER_CANCELLED` wins.
   - Errors carry no cause and no request or response body. Error bodies are never read.
   - No remote `generate` method or other dispatch path remains. Raw adapters are imported only by their own modules and their tests.
2. **Response classification.** The returned model is checked before billing, and billing before refusal, truncation and missing-tool. Malformed, refusal and suspect results keep the safe facts and never carry prose (tested). A missing model or one that is not a safe identifier is `UNEXPECTED_MODEL`. Usage that is absent altogether keeps the output with unknown usage, as ADR 0032 states.
3. **Outcome table.** I traced `fallback.ts` and ran sequence probes:
   - invalid output → repair outage → local switch gives three attempts (one repair, one switch);
   - malformed → denied repair gives `INVALID_OUTPUT`/`BUDGET_DENIED` with no local call;
   - outage → local invalid → local repair gives `INVALID_STRUCTURED_OUTPUT`;
   - an abort while a remote attempt is in flight discards its late output, and nothing is dispatched afterwards, local included.

   Relevance never runs local AI, and a timed-out relevance trace records the attempt in flight as `CALLER_CANCELLED`. Every result stays within ADR 0017 §5 and the B1 amendment.
4. **Intent envelope.**
   - The wire schema has top-level keys `type`, `properties`, `required` and `additionalProperties` only: no top-level `oneOf`, `anyOf` or `allOf`, and no dangling `$ref`/`$defs`.
   - Both branches are enforced exactly with strict Zod objects.
   - A decline ends as `INVALID_OUTPUT` with `NO_PROPOSAL`, a null proposal and `committable: false`. Authoring refuses it with 422 (`service.ts:91`, tested).
   - The contract changes are additive only. No canonical command schema, public status set, domain or context file changed.
5. **Identity.**
   - The local provider is recognized by identity through a module-private WeakSet, and the object is frozen.
   - A copy, a wrapper, a test brand or a forged remote is refused (tested).
   - The admitted-wrapper set is empty.
   - The gateway builds only local routes whatever the keys or routes, a revealing-throws `Secret` and a global `fetch` spy show no key read and no fetch, and `branded` is not exported from the package.
6. **Routes.** Runtime and evaluation shapes behave as required: three entries, two remotes, a remote-only route outside relevance, a duplicate capability, a local relevance entry and a remote without its key are all rejected. Evaluation mode allows exactly one remote.

None of the B1 foundations blocks the approved B2 integration: there is a `denied` response kind, separate `AttemptContext` signal and `onStart` hooks, a prepared body that later admission can bound, a module-private admitted set, and classification codes for stops.

## Focused checks I ran (offline, no keys, nothing written)

- Hash and manifest checks before and after, `manifest.py` diff, comparison against the baseline and the delta list.
- `pnpm exec vitest run --project unit` over `packages/ai`, `apps/server/src/ai`, `apps/server/src/platform`, the authoring, ai, context-ranking and npc-isolation route tests, and `tests/architecture`: **33 files, 466 tests, all passed**.
- `pnpm run typecheck`: passed. `pnpm run context-budget`: 644 files, 0 over target, 0 over the hard limit.
- Inline Node probes against real modules: usage allowlist (F1), end-to-end adapter classification, the intent wire schema, route parsing (F3), `composeRouter` with a getter-backed routes object (F2), fallback sequences, and reuse of a prepared request.
- I reviewed the diffs of the isolation and acceptance tests: they are mechanical port changes and remove no assertion.
- Not run by me: lint, `format:check`, build, integration, E2E, full `pnpm validate`. The supplied log (hash verified) shows context-budget 644, 1857 unit, 138 integration and 45 E2E tests passing.

## Residual risk and deferred scope

- The usage allowlists have not been checked against current provider documentation; unknown fields fail closed apart from F1. Adapters are tested only against fixed fake responses.
- Whole-request signals for intent, dialogue and Chronicle; the journal; outcome freeze; nullable trace IDs; and cache accounting are B2. Evaluation admission and oracles are C. Gateway and live evaluation remain local-only and off. None of this is counted against B1.
- Per the owner's confirmation, stale "pending decision" text in the handoff does not block B1.

## Model and effort

- This session runs as `claude-opus-5-5` in a fresh session, separate from implementation.
- I cannot observe the effort level from inside the session; the coordinator must take the xhigh evidence from the response envelope.

This report alone does not advance B2.

**PASS. STOP.**
# Stage 300 B1 repair 1 — independent review (read-only)

**Verdict: technical PASS on the exact manifest.** I found no Critical, High or Medium issues. There is one Low finding that doesn't block B1 but becomes a constraint before B2 relies on progress callbacks. This report alone can't satisfy dual acceptance, and it doesn't advance B2.

## Artifact pins (checked before and after my checks; all matched both times)

| Pin | Result |
|---|---|
| HEAD `406904343bfe…4124125` | match |
| `review-manifest.json` `1dd2e148…16b3550` | match. All 161 entries verified: 160 hashes match and `apps/server/src/ai/budget.ts` is absent as expected. 161 dirty paths, none outside the manifest. |
| `STAGE_300_REMEDIATION_DESIGN.md` `23e53e4d…fab23` | match |
| `STAGE_300_B2_STOP_SCOPE_DESIGN.md` `6bba0030…b485` | match (unchanged; not implemented) |
| Handoff `68e2dae0…6c152` | match |
| `validate.log` `11f1a5a1…f9bf7b` | match |
| Pre/post-validate manifest `09661b07…c719` | match; the two files are byte-identical |
| Accepted A accounting + migrations | 30 entries, 0 changed |

I didn't read any B1 reports, receipts, workflow status, peer verdicts, the fail-first log, `brief.txt` or `stream.jsonl`.

## Blockers
None.

## Finding L1 (Low, non-blocking): a callback that throws produces a fabricated provider attempt
- **Where:** `packages/ai/src/fallback.ts:165-176`. `build` and the `start`/`abandoned` notices run inside the provider `try`, and the `catch` at `:262-275` records an attempt for every exception.
- **What happens when the provider was never invoked:**
  - **`start` throws once:** the trace gets `[remote, initial, error, UNAVAILABLE]`, then a local switch runs and the result is `VALID`. Remote `generate` was called 0 times.
  - **`start` aborts and throws:** the trace gets a `CALLER_CANCELLED` remote attempt with 0 calls, and no `abandoned` notice is sent.
  - **`abandoned` throws:** progress goes `start, abandoned, end`. That contradicts the documented contract at `fallback.ts:72-78`: "abandoned … no attempt is recorded".
  - **Repair `build` throws:** a fabricated repair attempt is recorded, then a local switch runs.
  - **`end` throws:** a duplicate attempt is recorded for one invocation and `runWithFallback` rejects.
- **Reproducer:** `/tmp/opus-b1r1-probe/p4-fallback.mts`, run with `node --conditions=@ltw/source <file>`. The core of it is `runWithFallback({providers:[remote, local], …, onProgress: e => { if (e.type==='start' && first) throw … }})`.
- **Why it's Low:** it can't happen at B1.
  - The only production `onProgress` handler is in `relevance.ts:141-148`, and it only assigns values.
  - Production `build`s are pure prompt builders.
  - It never causes a paid call, a second switch, a call after abort, or a false `TRANSPORT_NOT_STARTED`. The fabricated code is always the uncertain kind.
- **Needed before B2 uses progress for journaling or freeze:** a callback exception must not record a provider attempt or trigger a switch. Either make the handlers non-throwing or isolate their exceptions. Add a regression test for each notice and for `build`.

## Contract assessment (all hold)
- **One route snapshot**
  - `snapshotRoutes` (`router.ts:35-43`) reads once. `composeRouter` (`composition.ts:31-47`) checks and builds from the same values, and the router keeps its own copy.
  - I tried 17 attacks: getters, a Proxy, a Proxy-wrapped Map, Map subclasses with duplicate keys, fake Maps, changing entry iterables, array-likes, Proxy arrays, inherited routes, a Proxy of the local provider, and mutating the snapshot or Map input after composition.
  - Result: 0 non-genuine providers routed and 0 forged invocations. Each getter or iterable was read exactly once.
  - Returned routes are frozen and stable. The router is frozen with no own properties, and the gateway's `router` property is non-writable and non-configurable.
- **Identity**
  - The only `genuine.add` is in `local-provider.ts:234`. Nothing populates `admitted`.
  - `@ltw/ai` exports no brand or test helper.
  - Both import guards pass: `gateway.test.ts:127-164` and `tests/architecture/test-support-imports.test.ts`.
- **Usage allowlists (own fields only)**
  - 283 cases through both adapters, built from raw JSON text so `__proto__` is a real own field: 10 inherited names × 7 values × top-level and nested, plus 3 label values.
  - All classify as `UNVERIFIED_BILLING`, drop the output, and keep model, request ID and usage. Clean allowlisted usage is still accepted.
  - Usage that is absent or `null` keeps the output with `billing: null`. That's documented (ADR 0032:172, design :199), so it isn't a defect.
- **Adapter start boundary:** 15 cases per adapter.
  - The key is never read in `prepare`, or when the caller has already aborted.
  - An abort inside the key reader, or an abort or throw in `onStart`, leaves `fetch` at 0 calls and yields `TRANSPORT_NOT_STARTED`.
  - Any failure after `fetch` is uncertain: `CALLER_CANCELLED`, `UNAVAILABLE` or `TIMEOUT`.
  - Bodies match the prepared bytes exactly. A foreign or copied prepared request is refused before the key is read, prepared requests are frozen, and no error carries a `cause`.
- **Outcome table:** 27 fallback cases.
  - A local-only route and the local switch each call local exactly once, and local output is never repaired.
  - Remote invalid output gets one repair on the same provider. A failed repair may then make the one local switch. A denied repair ends `INVALID_OUTPUT` with its denial code and no switch.
  - A suspect response switches to local with no repair note. A remote decline is terminal `NO_PROPOSAL`, and a non-intent decline goes to repair.
  - Strict envelope: these were all invalid and repaired: proposal+reason, decline+proposal, decline with no reason, decline with a bad reason, a bare proposal, and an own `__proto__`.
- **Authoring:** a decline can't seed authoring. `apps/server/src/authoring/service.ts:91` requires `dm-intent`, `PROPOSED` and a non-null proposal.
- **Route parsing:** a clause must split into exactly two pieces on `=` (`ai-routes.ts:32-40`).

## Checks I ran
- **Focused unit suites** (keys and routes unset):
  - Handoff scope plus `authoring-routes`: 33 files, 544 tests pass.
  - The writer's set: 32 files, 532 tests pass.
  - The 8 regression files: 164 tests pass, which equals the claimed 65 + 99.
- **Static checks:** `pnpm run typecheck` passes. ESLint passes on the 22 delta sources with 0 warnings. Prettier passes on those 22 plus 4 delta docs.
- **Probes p1–p5:** Node 25.8.1 type stripping, in `/tmp/opus-b1r1-probe`, using in-memory fake `fetch` only. No network, DB, build, E2E, credentials or `.env.local`.

## Writer's full validate (supplied, not re-run)
From the log's summary lines: unit 184 files / 1959 tests, integration 28 / 138, E2E 45, context-budget 648 files, Prettier pass. I didn't verify the 65 fail-first failures.

## Residual risks deferred to B2/C
- **Holds:** B2 must hold the full reservation when billing is `null`, and must never treat it as zero.
- **Pricing:** avoid double-counting subset fields (`total_tokens`, `cached_tokens`, `reasoning_tokens`) and check the fields against the providers' docs. I couldn't byte-compare the allowlists with the initial B1 artifact. The current lists do match the design §3 dimensions.
- **Single dispatch:** prepared requests are not single-use, so the B2 wrapper must dispatch at most once per reservation.
- **Late output:** an adapter can return output after the caller aborts once headers have arrived. Fallback discards it (`fallback.ts:177-188`), so B2 should settle from its usage rather than release.
- **`onStart` isn't proof of transport:** `onStart` can fire and the attempt still end `TRANSPORT_NOT_STARTED`. Only that code proves release.
- **Admitted wrappers:** these must be frozen with a plain data `kind`, because `kind` is re-read at `composition.ts:37`, `router.ts:18` and `fallback.ts:278/295`.
- **Router construction:** the check is a text scan (`gateway.test.ts:150`). `CapabilityRouter` stays publicly constructible and its prototype isn't frozen, though exploiting that needs in-process code. An `undefined` route throws a `TypeError` rather than a `CompositionError`; it still fails closed.
- **Not started yet (intentional):** B2 covers deadlines, journal, freeze, recovery, the diagnostic read, cache accounting and stop-scope. C covers evaluation admission, oracles, reports and client feedback. Remote runtime and live evaluation stay off.

This report reflects my self-reported identity (`claude-opus-5-5`), which is not proof. I made no source edits, saved no report, made no commits or pushes, and ran no agents, model CLIs, paid or network calls.

**PASS — STOP.**
# Stage 300 B1 repair 4: independent re-review (read-only)

**Verdict: technical PASS on the exact manifest.** I found no Critical, High, Medium or Low issues requiring a fix, only three informational notes. The repair restores the existing B1 rule for release proof and fixed codes without adding any interface, so it needs no new design gate. This report alone can't satisfy dual acceptance and doesn't advance B2. The named-model attestation gate remains pending separately, and this report makes no identity claim.

## Artifact identity (checked before and after my checks; all matched both times)

| Pin | Result |
|---|---|
| HEAD `406904343bfe…4124125` | match |
| `review-manifest.json` `188e7f16…b82729` | match. 186 entries: 185 hashes match, 0 mismatches, and `budget.ts` is absent as expected. The dirty set (186) equals the manifest exactly. |
| Designs `23e53e4d…fab23` and `6bba0030…b485` | unchanged |
| Accepted A manifest `0c5e7373…e63e` | 30 accounting/migration files, 0 changed |
| Pre/post-validate manifests `dc1aa2a8…0f2a` | identical; equal to the review tree except the handoff, which was written afterwards |
| `validate.log` `2dc8b9bd…17b0` | match. Summary lines: unit 188 files / 2042 tests, integration 28 / 138, E2E 45, budget 652 files with 0 over |
| `fail-first.log` | hash prefix `bb6bea92…` matches the handoff; contents not read |

**Delta checks:**
- Against the repair-3 artifact, the only source change is `packages/ai/src/providers.ts`. `fallback.ts` and all server source are byte-identical. Two tests were added, `providers.test.ts` and `fallback-rejection.test.ts`, plus documentation notes. The delta against the repair-4 baseline matches the handoff exactly.
- `.prettierignore` (changed before the baseline) adds five exact evidence paths.
- I didn't read `docs/PROJECT_WORKFLOW.md`.

## Assessment of `failureCode` (`providers.ts:185-219`)
- **Mechanism:**
  - The constructor records each instance's code in a module-private `WeakMap` (`:195`).
  - The lookup is by identity, so it runs no Proxy trap; the old `instanceof` check could hit one.
  - `code` is read at most once, and only after the identity hit. It must equal the constructed code and be on the allowlist.
  - Everything is inside a `try`; any failure gives `UNAVAILABLE`.
- **Genuine codes:** all five survive, including a frozen error, and so does a code getter that returns the constructed code (read once).
- **Never a proof (35 classification checks, all `UNAVAILABLE`, none threw):**
  - a plain `{code:'TRANSPORT_NOT_STARTED'}`, or an `Error` carrying that code;
  - a prototype look-alike, an `Object.create` of a genuine error, a spread copy, a `structuredClone`;
  - a transparent Proxy, Proxies with throwing `getPrototypeOf` or `get`, and revoked Proxies (empty, or wrapping a genuine error);
  - a code changed to or from `TRANSPORT_NOT_STARTED`, a deleted code, a throwing getter, a changing getter (read exactly once);
  - a constructed `INVENTED` code, a `String`-object code;
  - an error from a second module copy;
  - primitives, and a function carrying a code.
- **Fallback behaviour** (42 runs):
  - Nine forged or unreadable rejections each give exactly one uncertain attempt with null model, usage and output, and one `end`. Then:
    - `[remote, local]` routes make one switch and end `VALID`;
    - remote-only routes end `PROVIDER_FAILURE`;
    - once the caller has aborted, they end `CALLER_CANCELLED` with no switch.
  - Genuine `TRANSPORT_NOT_STARTED` is kept after an abort; the other genuine codes become `CALLER_CANCELLED`.
  - A code getter that aborts the caller still cancels.
  - Invalid output followed by a revoked-Proxy repair makes one switch.
  - A refusal followed by a revoked local rejection ends `PROVIDER_REFUSAL`, with one local call.
  - An `end` listener throwing after a revoked rejection records one attempt, then rejects.
- **One package instance per process:** in the built layout (writer's ignored `dist`, run without the source condition), the server adapter's `TRANSPORT_NOT_STARTED` reaches the package fallback intact, whether from an abort in the `dispatched` hook or a foreign prepared request. The package's `failureCode` recognizes server-thrown errors. A second copy's error is only ever downgraded to `UNAVAILABLE`, which invents no proof.
- **Earlier repairs unchanged:**
  - Repair-2 callbacks: 36/36 matched. Through the real raw adapter, an abort in the `dispatched` hook still gives `TRANSPORT_NOT_STARTED` with 0 fetches.
  - Repair-3 non-responses: 42/42.
  - Composition: 0 forged calls. Usage: 283/283. Adapter: 30/30.
- **Architecture fit:**
  - It enforces design §1/§3: only a genuine adapter `TRANSPORT_NOT_STARTED`, emitted before transport, proves a reservation can be released; everything else is ambiguous.
  - It enforces the fixed-code attempt contract (an arbitrary `INVENTED_CODE` can no longer leak) and contract #4 for rejections.
  - No code, status, interface, outcome-table row, route or accounting rule changed.

## Informational (no fix required)
- **I1:** an error built through the real constructor, via a subclass or `Reflect.construct`, keeps its constructed code, `TRANSPORT_NOT_STARTED` included. That's no more power than `new ProviderError(...)` already gives provider code. Whether provider code reports `TRANSPORT_NOT_STARTED` truthfully stays a trust boundary, as before: the raw adapters now, the B2 wrapper later.
- **I2:** a genuine `CALLER_CANCELLED` rejection while the caller is still live is recorded as that code, and the switch still happens. This predates repair 4; it is uncertain, not a proof.
- **I3:** if B2 ever loads two `@ltw/ai` copies, for example through bundling, genuine releases would degrade to holds. That's over-conservative but never overspends; keep a single instance.

## Residual risks deferred to B2/C (unchanged)
- A throwing `dispatched` listener no longer stops transport.
- An abort inside the `end` hook after a result is selected still returns it; the outcome freeze is B2.
- A rejected run writes no trace; the request journal is B2.
- Route-level 500 on rejection (pre-existing): the NPC route returns it after the canonical command has committed, and the context route returns it instead of the deterministic actions.
- The fallback doesn't re-check the model string's format.
- Prepared requests are not single-use.
- Missing or `null` usage keeps the output, and B2 must hold the reservation.
- Usage allowlists aren't verified against provider docs.
- The router-construction pin is a source-text scan.
- Admitted wrappers must be frozen with a plain data `kind`.
- C scope: evaluation admission, oracles, reports and client feedback. Live use stays off.

## Checks I ran
- **Pin and dirty-coverage verification**, before and after.
- **Unit tests** (keys and routes unset):
  - Focused set: 7 files, 200 tests pass.
  - The two new files: 40/40.
  - B1 scope: 37 files, 627 tests pass.
  - `packages/ai`: 19 files, 308 tests, matching the handoff.
- **Static checks:** typecheck passes; ESLint passes on 3 files with 0 warnings; `format:check` passes; context budget is 652 files with 0 over.
- **Probes** (Node, in `/tmp`, in-memory fakes only):
  - p8: 35 `failureCode` checks plus 42 fallback runs.
  - p9: built-layout cross-boundary check, 3 runs plus one direct check.
  - Regression re-runs of p1, p2, p3, p6 and p7.

## Limits
I didn't read any peer or prior reviews, implementation reports, streams, briefs, receipts or workflow status. I didn't open or run the peer probe the handoff references, or its re-run log. I read log bodies only through the summary grep. I didn't write any `sol-review-*` files; this report is returned as text only. I made no checkout writes and ran no builds, E2E, DB, network or paid calls, and didn't touch credentials or auth stores.

**PASS — STOP.**
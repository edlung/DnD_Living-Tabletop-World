# Stage 300 B1 repair 3: independent re-review (read-only)

**Verdict: technical PASS on the exact manifest.** I found no Critical, High, Medium or Low issues requiring a fix, only three informational notes. The repair-3 guard fits within the approved B1 architecture, so it doesn't need a new design gate. This report alone can't satisfy dual acceptance and doesn't advance B2. The named-model attestation gate remains pending separately, and this report makes no identity claim.

## Artifact identity (checked before and after my checks; all matched both times)

| Pin | Result |
|---|---|
| HEAD `406904343bfe…4124125` | match |
| `review-manifest.json` `a8b75059…bd65db` | match. 177 entries: 176 hashes match, 0 mismatches, and `budget.ts` is absent as expected. The dirty set (177) equals the manifest exactly. |
| Designs `23e53e4d…fab23` and `6bba0030…b485` | unchanged |
| Accepted A manifest `0c5e7373…e63e` | 30 accounting/migration files, 0 changed |
| Pre/post-validate manifests `571056b8…008b` | identical; equal to the review tree except the handoff, which was written afterwards |
| `validate.log` `fac70f29…9e3e` | match. Summary lines: unit 186 files / 2002 tests, integration 28 / 138, E2E 45, budget 650 files with 0 over, Prettier pass |
| Flake log and fail-first log | hash prefixes match the handoff (`662cf126…`, `fcb28473…`); contents not read |

**Delta checks:**
- Against the repair-2 artifact I reviewed, all server source is unchanged. The source change is `packages/ai/src/fallback.ts`, plus the new `fallback-nonresponse.test.ts` and documentation notes. The implementation delta against the repair-3 baseline matches the handoff exactly.
- `.prettierignore` (changed before the baseline) adds five exact evidence paths, no globs.
- `docs/PROJECT_WORKFLOW.md` also changed before the baseline. I didn't read it.

## Guard assessment (`answerOf`, `fallback.ts:188-216`, called inside the invocation `try` at `:282-295`)
- **Read once:** with counting getters, `kind`, `code`, `model`, `usage`, `inputTokens`, `outputTokens` and `output` were each read exactly once. Getters that change on later reads can't alter what's recorded or validated.
- **Non-responses:** every one of these becomes exactly one uncertain `BAD_RESPONSE` attempt with null model, usage and output, one `end`, then the ordinary provider-failure transition:
  - `undefined`, `null`, a number, a string, `true`, a `Symbol`, a `BigInt`, a function, a `Date`, a boxed `String` kind;
  - an unknown kind, or an unknown denial, malformed or suspect code;
  - a Proxy that throws on `model`, `usage`, `output`, `code` or `inputTokens`;
  - a thenable resolving `undefined`, and a non-promise `undefined` return.
- **Well-formed values still pass:** a transparent Proxy and a null-prototype object holding a valid response are accepted as responses. A non-string model, or usage that is negative, a float, larger than 2⁵³, or a string, is recorded as unknown.
- **No invented transport proof:**
  - A resolved `ProviderError('TRANSPORT_NOT_STARTED')` gives `BAD_RESPONSE`.
  - A rejected plain `{code:'TRANSPORT_NOT_STARTED'}`, a rejection with `undefined`, and a throwing `then` getter all give `UNAVAILABLE`.
  - A genuinely thrown `ProviderError('TRANSPORT_NOT_STARTED')` is kept, both while the caller waits (then switches) and after the caller aborts (then cancels).
- **Cancellation:** an abort followed by `undefined`, an unreadable Proxy, or a late valid answer each give one `CALLER_CANCELLED` attempt with no switch. Only the late valid answer keeps its safe model and usage.
- **Transitions:**
  - Invalid output, then a repair resolving `undefined`, switches to local. On a remote-only route it ends `PROVIDER_FAILURE`.
  - A refusal followed by a local non-response ends `PROVIDER_REFUSAL`, with one local call and no repair. A local-only non-response is one call, ending `PROVIDER_FAILURE`.
  - A valid repair denial still ends `INVALID_OUTPUT/ADMISSION_DISABLED`.
- **Callbacks:** an `end` or `dispatched` listener throwing on top of a non-response records one attempt, publishes one `end`, then rejects with no switch. All 36 repair-2 callback and transition cases still hold, with every `start` matched.
- **Architecture fit:**
  - It reuses the existing uncertain `BAD_RESPONSE` code, never `TRANSPORT_NOT_STARTED`.
  - It follows the table's outage row, so the B2 reservation stays held.
  - It adds no status, route, provider or accounting rule and invents no metadata.
  - That's consistent with design §2 ("unknown … remain unknown", "no fake transport start") and §3.

## Informational (no fix required at B1; all unreachable from current providers)
- **I1:** for a well-formed response, the fallback accepts any string as `model`. It doesn't re-check the safe-identifier format; for example, a 300-character string was kept. The adapters enforce the format, so the B2 wrapper must pass adapter facts through unchanged.
- **I2:** if a provider's output object has a throwing getter, zod throws inside `validate`. The result is an `INTERNAL_ERROR` attempt and a rejection, not an invalid-output repair. Adapters and the local provider only produce plain JSON-derived data.
- **I3:** a repair that resolves a denial with an unknown code is treated as `BAD_RESPONSE`, which permits the one zero-cost local switch. A valid denial code still ends `INVALID_OUTPUT`. This is the conservative choice.

## Residual risks deferred to B2/C
- **Disclosed in the handoff:**
  - A throwing `dispatched` listener no longer stops transport.
  - An abort inside the `end` hook after a result is selected still returns that result; the outcome freeze is B2.
  - A rejected run writes no trace; the request journal is B2.
- **Route-level 500 on rejection (pre-existing):** the NPC route returns it after the canonical command has committed, and the context route returns it instead of the deterministic actions.
- **Unchanged from earlier repairs:**
  - Prepared requests are not single-use.
  - Missing or `null` usage keeps the output, and B2 must hold the reservation.
  - Usage allowlists aren't verified against provider docs.
  - The router-construction pin is a source-text scan.
  - Admitted wrappers must be frozen with a plain data `kind`.
- **C scope:** evaluation admission, oracles, reports and client feedback. Live use stays off.

## Checks I ran
- **Pin and dirty-coverage verification**, before and after.
- **Unit tests** (keys and routes unset):
  - Focused set: 6 files, 168 tests pass.
  - B1 scope: 35 files, 587 tests pass.
  - `packages/ai`: 268 tests pass, matching the handoff.
  - The disclosed timing-sensitive A test, `pg-transaction.test.ts`, passed 3 of 3 runs in isolation (20 tests each).
- **Static checks:** typecheck passes; ESLint passes on 2 files with 0 warnings; `format:check` passes repo-wide; context budget is 650 files with 0 over.
- **Probes** (Node, in `/tmp`, in-memory fakes only):
  - p7 non-response: 42 cases.
  - p6 repair-2 callbacks: 36 cases plus 3 runs through the real raw adapter.
  - p1 composition: 0 vulnerabilities, 0 forged calls.
  - p2 usage: 283/283.
  - p3 adapter: 30/30.

## Limits
I didn't read any peer or prior reviews, implementation reports, streams, briefs, receipts, workflow status or log bodies beyond the summary grep. I didn't write any `sol-review-*` files; this report is returned as text only. I made no checkout writes and ran no agents, Codex CLI, builds, E2E, DB, network or paid calls, and didn't touch credentials or auth stores.

**PASS — STOP.**
# Stage 300 B1 repair 4 — independent Sol technical review

**Technical verdict: PASS.** The repair closes the rejected-error inspection finding. No required technical finding remains in this bounded B1 review. **The actual-model acceptance gate remains PENDING.** Configuration alone does not satisfy that gate; the owner has declined that exception. This report does not authorize B2 or C.

Reviewed on 2026-10-11 in the existing clean native Codex Desktop acceptance session, explicitly configured as `gpt-6.1-sol` / `xhigh`. Actual response-model and effective-effort attestation are not independently exposed to this reviewer. No actual-model attestation is claimed. No Codex CLI, authentication-store inspection, settings manipulation, network, paid provider call, peer review, or additional agent was used.

## Exact reviewed artifact

- Workspace: `/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2`.
- HEAD: `406904343bfe8542640035564d3e044561824125`.
- Manifest: `/tmp/ltw-stage300-checkpoint-b1-repair4/review-manifest.json`.
- Manifest SHA256: `188e7f16d6f6ae7082bf82b05a5769b343a2e81dd55e65265e6b6f42a3b82729`.
- All 186 entries verified before and after checks: 185 present files match their hashes, and `apps/server/src/ai/budget.ts` is intentionally absent. Exact dirty-path coverage is 186, with no extra or missing paths. HEAD is unchanged.
- Neutral handoff SHA256: `58d0faff1bd2cfbcab6308d92e373f2e8ff3bb8c438e3c95220f7e2e95a4c795`.
- Approved remediation design SHA256: `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`.
- Approved B2 stop-scope design SHA256: `6bba003055bfd53ac4e069d01d5bf6e3a5a6e272fddb41a2f8305b55e153b485`.
- Accepted A manifest SHA256: `0c5e7373fee933f92b259798531cd51401022bc7c6446da16535435dffe5e63e`. All 30 accepted accounting/migration files checked against it remain unchanged. Both design pins also match before and after.

This was a bounded re-review of the repair-4 delta and prior findings in this reviewer's own session. No peer or prior report/receipt was read. Checkout source, tests, snapshots, lockfiles and reports were untouched. Only authorized `/tmp` evidence was written; focused Vitest tooling was permitted.

## Finding closure and behavior

The prior Medium finding concerned an actually invoked provider rejecting with an unreadable `ProviderError.code`, a revoked Proxy, or a tampered unknown code. Rejection settlement previously inspected `instanceof`/`code` without a total classification boundary. Inspection could throw before recording the real attempt/end, or copy an arbitrary code into the attempt. Cancellation did not rescue that branch. This was a pure package boundary finding; no paid/public HTTP exploit was asserted.

The fix in `packages/ai/src/providers.ts:185-219` makes the existing `failureCode` helper nonthrowing. A private WeakMap records each genuine error's constructor identity and original code. Classification reads a recognized object's current `code` once, requires equality with the original code and membership in the existing five-code vocabulary, and otherwise yields conservative `UNAVAILABLE`. A revoked Proxy never needs prototype inspection. The helper's existing fallback call site remains unchanged.

The prior six-case reproducer now passes against this exact artifact. In its live cases, the remote invocation gets one end event with `UNAVAILABLE` and the one allowed local switch completes. In its aborted cases, the outcome is `CALLER_CANCELLED`, no local provider runs, and the actual remote invocation still gets one end event. No arbitrary error code enters the attempt. The fix required by the prior finding—total, fixed-code rejected-error classification without losing actual invocation facts—is present.

Independent adversarial checks also confirm:

- All five genuine, unchanged `ProviderError` codes survive, including real `TRANSPORT_NOT_STARTED` release proof. Cancellation retains that known proof where appropriate and otherwise records caller cancellation.
- Plain objects, prototype look-alikes, spread copies, proxies, revoked proxies, changed known codes, unknown constructor/current codes, non-string codes and unreadable getters cannot manufacture `TRANSPORT_NOT_STARTED` proof.
- Proxy property/prototype traps are never consulted for unrecognized identity. A changing getter is read once per classification; a subsequent changed value becomes uncertain. A getter that aborts during classification produces caller cancellation with the actual end event and no local switch.
- For each real invocation, attempt/end accounting remains complete; at most one local switch occurs, and remote-only plans remain remote-only. Uncertain failures carry no fabricated model, output or usage facts.
- Prior malformed-resolution normalization, callback-exception handling, validation cancellation, build/start cancellation and transport cancellation cases continue to pass. Cancellation before valid outcome selection wins. A post-selection end callback abort preserves the already selected outcome, consistent with the approved B1 selection boundary; the deferred B2 lifecycle/freeze machinery is not required by this repair.

## Architecture assessment

The delta restores an existing B1 contract in a focused helper, with focused tests and brief documentation. It adds no transport code, remote runtime authority, admission path, lifecycle journal, accounting schema, reservation policy or new fallback branch. `fallback.ts` and server source are unchanged. It fits the approved B1 architecture and does not introduce a material architecture change requiring a new design gate.

The identity registry is module-copy-local. A genuine error created by a second module copy is conservatively classified as `UNAVAILABLE`; an independent second-copy probe confirms that no release proof is invented. This limitation may retain uncertainty rather than release a hold, which is the permitted conservative behavior in the review packet. B2 admission, journaling, composition and broader observer-exception lifecycle work remain deferred. The local-only B1 composition remains the authorized runtime boundary.

## Independently executed verification

1. Focused offline Vitest: **410 tests passed in 26 files**, including pure package fallback/router/cancellation tests, rejection/resolution regressions, server config syntax, HTTP/use-case boundaries and architecture test-support imports. One worker; no snapshots or lockfile updates.
2. Repair-4 native Node probe: **66 cases passed** (63 route cases plus three getter/trap/cancellation cases), with **21 direct error-classification checks**. It covers 16 untrusted rejection factories and all five genuine codes across remote-only, one-local-switch and cancelled paths.
3. Prior own rejection reproducer rerun against repair 4: **6 cases passed**.
4. Prior own malformed-resolution probe rerun against repair 4: **52 cases passed**.
5. Prior own callback/cancellation/raw fake-fetch probe rerun against repair 4: **21 cases passed**, including three pure-fallback to raw Anthropic adapter cases using fake fetch. No real HTTP/provider request was made.
6. Context budget: **652 active files, zero above the target, zero above the 700-line ceiling**.
7. Exact artifact, dirty coverage, HEAD, design pins and accepted A accounting/migration hashes verified before and after checks.

Reproducible commands, from the workspace root:

```sh
node node_modules/vitest/vitest.mjs run --project unit packages/ai/src apps/server/src/platform/config/config.test.ts apps/server/src/http/ai-routes.test.ts apps/server/src/http/authoring-routes.test.ts apps/server/src/http/context-ranking.test.ts apps/server/src/http/npc-isolation.test.ts apps/server/src/http/russian-boundary.test.ts tests/architecture/test-support-imports.test.ts --maxWorkers 1
node /tmp/ltw-stage300-checkpoint-b1-repair4/sol-native-probes.mjs
node /tmp/ltw-stage300-checkpoint-b1-repair3/sol-rejection-probe.mjs
node /tmp/ltw-stage300-checkpoint-b1-repair3/sol-resolution-probes.mjs
node /tmp/ltw-stage300-checkpoint-b1-repair2/sol-native-probes.mjs
node scripts/context-budget/cli.ts
```

Probe SHA256 values:

| Probe | SHA256 |
| --- | --- |
| repair4/sol-native-probes.mjs | `b7349d049574827a37859b808adbfae307997504f107fa32de9412bb80090b4e` |
| repair3/sol-rejection-probe.mjs | `07eb7a5ca40fe3b206e9723768253e83b4c818fb5bb53c3436b3d07426a4d869` |
| repair3/sol-resolution-probes.mjs | `8766f0b3a9729f3994c7692423ebe23d2e8e257e914d2838626b1c89ae9873ff` |
| repair2/sol-native-probes.mjs | `37885a448ae90ae493371b4faa2be7acfb028e6c75b3949204fec5da1ab778c7` |

## Supplied verification and limits

The supplied full validation evidence was inspected narrowly and hash-verified; it reports **2042 unit, 138 integration and 45 E2E tests passed**. It was not independently rerun in this read-only review. Supplied fail-first evidence reports 19 failing / 21 passing tests before this helper fix and 40/40 after it; the pre-fix source was not restored or independently rerun.

- `validate.log`: `2dc8b9bda63c90112d3f570e9ca280100ab2be44bcf689e63facc3ee228a17b0`.
- Pre/post validation manifests both: `dc1aa2a8fe0ea3bd4db75f50137a6a995b99b73c4be16fec52a0e60a8a5b0f2a`.
- `fail-first.log`: `bb6bea92c5ecc5edb32a067d3d67368a5a68cf99a2373e92c1ffdd4550dc2d68`.

No shared database, build, full E2E, live catalog or paid remote runtime check was run by this reviewer. These limits do not reopen the bounded technical finding. Named actual-model acceptance remains separately pending because runtime attestation is unavailable and the owner declined a configuration-only exception.

**STOP.** Review and evidence writes are complete; no checkout write ownership is claimed and no dependent checkpoint work is started.

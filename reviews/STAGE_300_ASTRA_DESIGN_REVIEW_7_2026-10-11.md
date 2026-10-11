# Stage 300 remediation design 7 — Astra bounded re-review

Date: 2026-10-11. Verdict: APPROVE (architecture only).
Artifact SHA256: `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`.
Native subagent `/root/astra_design6`, retained explicit `gpt-6-astra` / xhigh configuration.
Bounded re-review following its independent fresh draft 6 review; no peer verdict supplied.
Actual response attestation unavailable; configured identity/effort accepted under the owner's exception.
The returned assessment follows verbatim.

---

<!-- prettier-ignore-start -->

**APPROVE — Stage 300 remediation architecture, draft 7.**

Reviewed the complete current artifact. SHA256 verified before and after: `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`. **No blocking findings.**

The revised contracts are coherent with the unchanged source:

- Separate, committed request-start persistence preserves a real diagnostic identity when subsequent admission fails. The shared request/trace UUID removes lifecycle-reference ambiguity. [Design:253](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:253)
- Storage-step deadlines now distinguish an admission failure that permits local fallback from whole-request cancellation that forbids further dispatch. Starting the NPC AI deadline at `replyAsNpc` preserves the existing command-then-context-then-reply sequence. [Design:78](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:78)
- `prepare`/`dispatch` binds reservation calculations to the immutable serialized body, including adapter-added text and options. The synchronous transport-start boundary supports conservative pre-dispatch release. [Design:181](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:181)
- The server-only WeakSet preserves the pure-package boundary while rejecting test brands in production composition. Frozen attempt snapshots prevent late completions from changing the outcome digest or recorded output. [Design:244](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:244), [design:312](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:312)
- Billing-account identity is accurately described as operator-attested. Missing-tool repair’s additional paid-attempt consequence is explicit and remains subject to separate admission. [Design:36](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:36), [design:465](/Users/oleksandr/Documents/living-tabletop-world-dev-pack-v1.2/docs/STAGE_300_REMEDIATION_DESIGN.md:465)

Required implementation evidence remains: real PostgreSQL admission/accounting races; durable-start preservation through failed admission; storage timeout versus whole cancellation for all capabilities; exact prepared/fetched byte equality; failures immediately before/after transport start; rejection of forged/test provider brands; immutable frozen attempts despite late completion; and finalizer/recovery races with caller/trace agreement. Preserve the previously noted Chronicle template/provider agreement check despite the legacy nullable `paragraphs` field.

Residual risks remain disclosed: uncertain holds and conservative bounds can exhaust usable capacity; recovery can leave diagnostic-only records; provider pricing/cache verification, spending authorization, the preparation/closed-session product disposition, live evaluation and owner acceptance remain pending. This approval does not satisfy those gates.

Read-only bounded re-review: no writes, tests, paid calls, delegation or peer-verdict inspection. Identity evidence remains the explicit native `gpt-6-astra` / `xhigh` configuration under the owner exception; actual response-model attestation is unavailable.

<!-- prettier-ignore-end -->

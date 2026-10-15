# Stage 300 audit disposition

Baseline: `bc6c116`. Date: 2026-10-11. Status: REMEDIATION DESIGN, NO IMPLEMENTATION ACCEPTANCE.

Both independent assessments returned technical FAIL. Fable actual response model is verified;
Astra runtime model/effort configuration is verified but its actual response model is not exposed.
No named-model PASS or architecture approval is claimed. Reports and receipt are adjacent.

Common blockers: durable atomic spending admission, usage on errors, attempt costs and late relevance
accounting, and incomplete owner acceptance/budget evidence. Additional audit findings cover unsafe
evaluation predicates, unreachable deterministic routes, implicit paid relevance, prompt/schema
contradiction, Anthropic caching, client feedback, and documentation/coverage.

Current proposed scope: `docs/STAGE_300_REMEDIATION_DESIGN.md`; a fresh dual review must cover the
same exact hash before implementation. This design is not approved by the baseline audit.

Fresh architecture assessments of draft 1 both returned CHANGES REQUIRED (reports adjacent).
The preserved draft 1 hash is `890f92e3ca3d9f5e2298c14c822966e85267d0437cb74c8d7199ecd7546ddb13`.
Draft 2 incorporates approval/session identity, concrete transaction locks, crash-readable lifecycle,
whole-request relevance deadline, exact decline/refusal transitions, allowed scope and report contract.
Its hash is `4028f4c34f1e94e7ecff2cc078de978e74157e5feb0a956027019ba154c0076f`; renewed review is pending.
No implementation writer was launched and no production source was changed.

Owner update, 2026-10-11: fresh-session Opus 5.5 / xhigh replaces Astra for new reviews and
acceptance; Fable 5.1 / high remains the second architecture reviewer. Draft 2 now records that
assignment and has SHA256 `ad700826921b809a150a577d76607a0c40d6f918fadbf10b410f0713428ddd7c`.
Fresh independent reviews of this exact artifact are in progress. Earlier hashes and assessments
above preserve their original identity; none represents acceptance of the current artifact.

Review 2 subsequently returned CHANGES REQUIRED from verified Opus 5.5/xhigh and Fable 5.1/high.
Their reports, native transport receipts and exact draft 2 snapshot are preserved adjacent. Draft 3
addresses transaction isolation/connection/lock order, single terminal accounting, pricing tiers and
options, hard-abort uncertainty, concrete capability outcomes and the operator approval root.
Its SHA256 is `8ac06844adfdd33cf878870f6656fee245ee6ebe583b2116374f1e85faa68a2d`;
fresh independent dual review is in progress. The documented hard abort and local refusal fallback
preserve ADR 0017; no new owner product decision or paid runtime approval is inferred.

Review 3 returned CHANGES REQUIRED from both verified reviewers. It closed the original lock,
terminal uniqueness and pricing shape, but identified automatic-stop lock upgrades, missing general
deadlines, ambiguous session registration and missing denied-repair/suspect-response transitions.
Draft 4 pins those decisions plus bounded pool checkout, absolute evidence arithmetic and technical
offline composition between checkpoints. Current SHA256:
`beb33666dc682f04719e6ae9a50c1139bf4ff2f09d2d9637ccfef0efbf55ada5`.
Fresh dual review is in progress. Preparation/closed-session Chronicle local-only behavior remains
an explicit owner product disposition required before checkpoint C completion, not implicit consent.
PR 3's description now withdraws earlier semantic/quality/leak claims and records pending acceptance.

Review 4 completed: Fable APPROVE; Opus CHANGES REQUIRED with one blocker covering result fixation,
insert-only trace consistency at deadline and multi-process recovery coordination. Both actual native
response models are verified, with xhigh/high explicitly configured and distinct fresh session IDs.
The exact draft 4 and reports/receipts are preserved. Opus disclosed incidental review-line matches
from one repo-wide search; no report was opened or verdict used according to its disclosure, and no
Opus approval is claimed. Future independent searches are explicitly restricted to source paths.
Dual architecture approval remains pending. No source implementation or code acceptance occurred.

## Recommendations that must not be copied blindly

- In-memory reservations plus startup hydration are insufficient for multi-process admission and
  crash recovery. Require durable atomic reservations before dispatch, not after response/trace.
- Character-count token heuristics do not prove a worst-case billing bound. Use a verified bound
  or deny admission; unknown/missing usage must not be silently refunded.
- Existing capability traces are insert-only. Late accounting needs an append-only linked journal,
  not an update to a previously committed trace.
- DeepSeek caching is automatic according to its official cache guide; missing an explicit cache
  directive is an Anthropic issue. DeepSeek cached-token accounting still needs implementation.
- A new public no-proposal status changes a contract. Prefer a reviewed internal safe-decline path
  preserving public behavior; record prompt changes and keep canonical command validation intact.
- The absence of owner play/NPC choice is explicitly deferred by the user, not consent or a reason
  to repeat that request. It remains pending and prevents claiming final product acceptance.

## Billing and identity

No new runtime calls were made during this audit/preparation. The OpenRouter $20 key limit is image
scope only. Historical $30 text approval is withdrawn. No API billing or usage credits were enabled.
Claude Code reports native first-party Max authentication; cached credit state is organization-level
disabled. Official plan terms checked 2026-10-11 include Fable on Max within its subscription limit:
[Anthropic plan terms](https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan).
Cached credit state is not a live quota measurement; no quota-savings or attributable dollar claim.

Provider references for design verification, checked 2026-10-11:
[Opus 5.5 API behavior](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5),
[DeepSeek caching](https://api-docs.deepseek.com/guides/kv_cache/),
[DeepSeek prices](https://api-docs.deepseek.com/quick_start/pricing/).
These references do not authorize a paid run or replace model-bound verification in implementation.

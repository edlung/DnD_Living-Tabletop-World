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

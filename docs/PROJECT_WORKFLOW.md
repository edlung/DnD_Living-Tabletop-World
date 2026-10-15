# Current delivery workflow

Updated 2026-10-15. The owner's current AGENTS instructions take precedence over older process banners.

## Current owner policy — 2026-10-15 (supersedes all older assignments)

- One session, one model: the model selected in the session plans, implements, verifies and reports.
  No orchestrator, no separate writer/reviewer role assignments, no model or effort pinning, no
  `reviewer-cli`, no Codex/Astra/Fable/Sol/Opus-max gates. Contract: `AGENT_WORKFLOW.md` v2.0.
- The owner decides product questions, authorizes each stage and gives dispositions; the session
  stops at every checkpoint. Independent review is optional and never blocks.
- Existing scope, spending restrictions (ADR 0032: owner authorization, stored operator approval,
  verified catalog entry, never read `.env.local`), checkpoint dependencies and human acceptance
  deferrals remain.
- Everything below this section up to "Current continuation" and the older sections is **historical
  record** of the 2026-10-11/12 role-based process; preserve it, do not follow its role rules.

## Current status — 2026-10-15

- Authorized by the owner (`reviews/OWNER_DECISIONS_9_2026-10-15.json`): Stages 310, 320, 330, 340,
  350, the Gate 06 red-team pass (355) and the non-human parts of 360; the session adopts each
  stage's design without stopping; each stage on its own branch and PR, merged on green CI. Owner
  play acceptance (290 onward) and all manual checks are deferred to the owner; no v0.1 tag before
  the owner's human playtests.
- Stage 300: merged (PR 3). Stage 310: implemented (parts A–C), one independent review of B/C with
  all findings fixed (`e7507fd`); PR 4; report `reports/STAGE_310_COMPLETION.md`.
- Stage 320: direction set by the owner's concepts; all art by GPT
  (`reviews/OWNER_DECISIONS_10_2026-10-15.json`, ADR 0034, `docs/STAGE_320_DESIGN.md`).
- Spending: paid runtime calls only within the stored operator ceilings (ADR 0032); in-play images
  through OpenRouter within $5 (Stage 330); never read `.env.local`.

## Current checkpoint (historical, 2026-10-11/12)

- Source baseline: `bc6c116`, branch `stage-300-live-ai`, PR 3 (stacked on Stage 290, PR 2).
- Committed 2026-10-11: `f7518a6` holds accepted A, B1 repair 4 and all review evidence (no source
  change after the reviewed B1 manifest).
- Stage 300: implemented, independent acceptance pending. The spending ledger and trace
  deliverables require review; the original $30 approval claim is withdrawn.
- Owner decisions 2026-10-11 (`reviews/STAGE_300_OWNER_DECISIONS_2_2026-10-11.json`): explicit
  $30 cumulative Stage 300 text-provider grant (Anthropic and DeepSeek combined); NPC dialogue uses
  Sonnet 5.5, blind comparison waived; play testing of Stages 290/300 deferred. Chronicle after
  session close and preparation without an active session stay local-only (earlier decision).
- Stage 310: continuation authorized 2026-10-11; DM skip/act policy decided the same day. Design
  preparation may proceed, but dependent implementation waits for the Stage 300 checkpoint and
  fresh Astra/Fable xhigh architecture approval. No Stage 320 work is authorized.
- Owner decisions 3 (same day): runtime text model is Sonnet 5.5 only for all four capabilities (no
  Opus or DeepSeek at runtime; the $30 grant covers Sonnet only). Route configuration changes with B2.
  Paid AI stays limited to active play sessions and registered evaluation runs; no test campaign.
- No paid runtime calls yet: the $30 grant is recorded, but no operator billing-account/approval
  records exist, daily/campaign/session sub-ceilings within it are unset, and B1/B2 are not accepted.
- Stage 300 remediation drafts 1–3 received CHANGES REQUIRED. Draft 4 pins bounded whole-request
  and accounting deadlines, uniform runtime-session eligibility, restrictive automatic stops without
  lock upgrades, denied-repair/suspect-output outcomes and post-terminal evidence arithmetic.
  Draft 4 SHA256: `beb33666dc682f04719e6ae9a50c1139bf4ff2f09d2d9637ccfef0efbf55ada5`.
  It is not approved: Fable APPROVE, Opus CHANGES REQUIRED (review 4). Reviews 2–4 used the prior Opus/Fable policy; actual native Anthropic responses verified
  their identities. The current owner policy requires renewed Astra/Fable xhigh approval; prior
  approvals do not satisfy that gate. Astra response identity must be verified anew.
  Historical Astra reports remain unchanged. The local-only preparation/closed-session Chronicle
  limitation still requires owner product disposition before checkpoint C completion.

## Checkpoint boundaries

1. Stage 300 baseline audit returned technical FAIL; see
   `reviews/STAGE_300_AUDIT_DISPOSITION_2026-10-11.md`. Acceptance remains pending under the new
   fresh Sol/Opus xhigh acceptance assignment; the findings still require closure.
2. Obtain dual architecture approval for any material Stage 300 remediation, then delegate one
   cohesive implementation task and obtain fresh independent Sol/Opus xhigh acceptance of the exact artifact.
3. Obtain dual approval of the Stage 310 design, then implement reviewed checkpoints covering
   scoped change signals/recovery, DM proxy actions, and persistent authoring history.
4. Owner plays affected flows. Preserve pending acceptance accurately; stop at Stage 310 boundary.

## Current continuation — remediation draft 7

**Checkpoint C: ACCEPTED 2026-10-12** (`reviews/STAGE_300_CHECKPOINT_C_ACCEPTANCE_2026-10-12.json`).
Fresh Opus 5.5 xhigh and Opus 5.5 max both PASS on the repair-1 artifact (handoff
`handoffs/STAGE_300_CHECKPOINT_C_REQUEST.md`, dirty listing `7f4c4eb4…`). The Stage 300 remediation
(A, B1, B2, C) is complete. Sonnet 5.5 has a verified catalog entry
(`reviews/STAGE_300_CATALOG_VERIFICATION_CLAUDE_SONNET_5_5_2026-10-12.md`); runtime relevance uses
no paid model (decisions 6). Owner-approved Low deferrals are listed in the acceptance record.
Operator records created 2026-10-12 in the local development database
(`reviews/STAGE_300_OPERATOR_RECORDS_2026-10-12.json`): account `anthropic-owner` ($15/day) and
approval `stage-300-sonnet` ($30 stage, $15 campaign/day, $10 per session and per evaluation run,
campaign `ravenford`). They stay inert until `.env.local` selects remote routes and the approval.
Any live run needs separate owner authorization; owner play acceptance of Stages 290/300 stays
deferred. No paid runtime calls so far.

**Checkpoint B2: ACCEPTED 2026-10-12** (`reviews/STAGE_300_CHECKPOINT_B2_ACCEPTANCE_2026-10-12.json`).
Fresh Opus 5.5 xhigh and Opus 5.5 max both PASS on the repair-1 artifact (handoff
`handoffs/STAGE_300_CHECKPOINT_B2_REQUEST.md`, dirty listing `589b980e…`); reports, receipts and
evidence under `reviews/`. Owner-approved deferrals: unconfirmed-COMMIT hold (F4), Sonnet 5.5
allowlists (catalog verification), flaky transaction-bounds test L-N1 (first item of C). The
verified pricing catalog is empty, so every remote route is refused and nothing is sent. Next:
checkpoint C on owner go-ahead. Live use additionally needs owner-authorized catalog verification
for Sonnet 5.5 and operator approval records within the $30 grant. No paid runtime calls.

**Checkpoint B1: ACCEPTED 2026-10-11** (`reviews/STAGE_300_CHECKPOINT_B1_ACCEPTANCE_2026-10-11.json`).
Opus 5.5 xhigh PASS (repair 4) and a fresh Opus 5.5 max PASS
(`reviews/STAGE_300_CHECKPOINT_B1_OPUS_MAX_REVIEW_2026-10-11.md`, receipt and evidence) on the same
artifact (manifest `188e7f16…`, commit `f7518a6`). The Opus max review found 0 Critical/High and 7 Low
findings, carried into B2 in the acceptance record. B2 may start after owner go-ahead, implementing
the approved draft 7 B2 scope plus the approved stop-scope delta. No paid runtime calls before B2 is
accepted. The Sol attestation notes below are historical.

Draft 7 pins outcome freeze, unique atomic caller-outcome/trace finalization and bounded recovery.
Recovery leaves a permanent diagnostic-only record when delivery is unknowable. It also addresses
global bucket/stop identity, operator locks, authorization references, local identity/decline behavior,
mandatory positive ceilings and the offline evaluation CLI at A. Checkpoint A source implementation is complete; initial acceptance found required repairs.
Current design SHA256: `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2`.
Architecture draft 7: APPROVED by independent Astra xhigh and Fable xhigh on the hash above.
Evidence: `reviews/STAGE_300_ASTRA_DESIGN_REVIEW_7_2026-10-11.md`,
`reviews/STAGE_300_FABLE_DESIGN_REVIEW_7_2026-10-11.md` and review 7 receipts.
Checkpoint A: ACCEPTED (Sol xhigh PASS and Opus xhigh PASS) on manifest SHA256
`0c5e7373fee933f92b259798531cd51401022bc7c6446da16535435dffe5e63e`.
Evidence: `reviews/STAGE_300_CHECKPOINT_A_{SOL,OPUS}_REVIEW_REPAIR_2_2026-10-11.md`,
`reviews/STAGE_300_CHECKPOINT_A_ACCEPTANCE_RECEIPTS_2026-10-11.json` and accepted manifest.
Full offline validate: 1674 unit, 138 integration, 45 E2E. No paid runtime calls.
Current owner transport decision: use Codex Desktop native subagents for OpenAI roles; Codex CLI
is excluded for subsequent work. Claude Code CLI remains authorized for Anthropic roles.
The owner’s refusal of a B1 native-configuration evidence exception remains effective; Desktop
review configuration alone does not satisfy the actual-model gate. No silent identity waiver.

Checkpoint B1 repair 1: independent reviews completed; see repair-1 reports and receipts.
Sol Desktop technical FAIL; actual response-model attestation remains unavailable and its named gate pending.
Checkpoint B1 repair 2: independent technical PASS from Desktop Sol and Opus on the same artifact.
Sol actual-model attestation is unavailable, so B1 acceptance remains pending.
Checkpoint B1 repair 3: Opus technical PASS; Desktop Sol technical FAIL for rejected-error
inspection (one invocation without an attempt/end; unrecognized error codes).
Checkpoint B1 repair 4: technical PASS from independent Desktop Sol/xhigh and Opus/xhigh.
Reviewed artifact: manifest `188e7f16d6f6ae7082bf82b05a5769b343a2e81dd55e65265e6b6f42a3b82729`.
Full offline validation: 2042 unit, 138 integration, 45 E2E; 652 active files, zero over limit.
Reports: `reviews/STAGE_300_CHECKPOINT_B1_{SOL,OPUS}_REVIEW_REPAIR_4_2026-10-11.md`.
B1 is NOT ACCEPTED: actual response-model/effort attestation for native Desktop Sol is unavailable;
the owner declined a configuration-only exception. Opus actual response model and native subscription
routing are confirmed by its receipt. No Codex CLI, API billing or usage credits were enabled.
B2 remains blocked by this named-model evidence gate; no dependent implementation has started.
The approved architecture and all 30 accepted A accounting/migration files remain unchanged.
Opus advisory A1 remains a B2 design/integration constraint, not authorization for paid calls.
The owner clarified: exclude Codex CLI, retain Claude Code CLI for Anthropic roles.
Desktop attestation investigation: existing session IDs/auth mode are confirmed, but existing logs
contain no raw server model metadata. A reversible SSE-trace GUI restart is prepared, not applied.
Evidence: `reviews/STAGE_300_SOL_DESKTOP_ATTESTATION_INVESTIGATION_2026-10-11.json`.
Owner deferred the diagnostic restart; scripts are preserved under
`reviews/evidence/sol-desktop-attestation-2026-10-11/`. Decision and resumption steps:
`reviews/STAGE_300_SOL_DESKTOP_ATTESTATION_OWNER_DECISION_2026-10-11.json`.
B1 acceptance remains pending; the diagnostic candidate is not proof.
Initial B1 artifact (historical, superseded by repair 4 above): independent Opus xhigh PASS; independent Sol xhigh FAIL
(two High, two Medium). Both reviewed the same pinned source artifact, manifest SHA256
`077be8cde263d8510d4fda8af6040717faf4c705da962f47bad3f3dbf769f357`; source unchanged.
Owner declined the native-configuration exception, then explicitly authorized a Codex CLI attempt.
Sol CLI fresh session `01a12a46-565a-7f71-8bfa-63c197dcf361` confirmed actual `gpt-6.1-sol/xhigh`
in all 23 completed server response envelopes, via native ChatGPT backend and forced ChatGPT auth.
No API key/billing or model fallback; no exception needed. Required Sol assessment is now completed,
but technical acceptance failed. Construction guard remains; B2 implementation may not start.
Evidence: `reviews/STAGE_300_CHECKPOINT_B1_{SOL,OPUS}_REVIEW.md`, reviewed manifest,
review receipts, Sol CLI receipt and response-metadata JSONL. Sol independently reproduced:

- High: getter/mutable-array bypass of runtime provider identity;
- High: inherited usage keys bypass fail-closed billing or erase known facts;
- Medium: cancellation during callbacks/preparation still invokes provider/fetch;
- Medium: invalid initial local-only intent is attempted twice.
  Sol typecheck/context-budget and native source/HTTP probes passed outside these counterexamples;
  Vitest collected zero tests because the read-only sandbox blocked temporary config/SSR writes.
  The separate Opus 466-test focused PASS and the supplied full validation remain historical evidence,
  not approval of these failures. Opus's route-separator Low finding remains tracked as well.
  Next development requires Opus xhigh repair in the existing B1 implementation session, regressions
  first, fresh exact artifact/checks and independent Sol/Opus xhigh re-review before B2. This review
  request changed no implementation and started no repair or B2 work.
  Implementation Opus 5.5 medium session `15ae1625-61f1-4101-94e2-bfab23ace5cb` released ownership.
  Frozen-tree offline validate: 1857 unit, 138 integration, 45 E2E; validated manifest SHA256
  `f99adf943457f8f1e885b846766e573a8a3ed4e8d54aaab432212ed1b6250933`.
  B2 stop-scope delta draft 2: APPROVED independently by Astra/Fable xhigh, exact SHA256
  `6bba003055bfd53ac4e069d01d5bf6e3a5a6e272fddb41a2f8305b55e153b485`;
  see `docs/STAGE_300_B2_STOP_SCOPE_DESIGN.md` and `reviews/STAGE_300_B2_STOP_SCOPE_*`.
  B2 implementation waits for B1 dual acceptance; no live enablement.
  Owner product decisions confirmed 2026-10-11: ceilings through operator CLI records;
  DM preparation without an active play session and Chronicle after session closure stay local only.
  Evidence: `reviews/STAGE_300_PRODUCT_DECISIONS_2026-10-11.json`. No paid runtime authorization.
  Draft 6 received Astra APPROVE and Fable CHANGES REQUIRED. Draft 7 separates request-start from
  admission, unifies request/trace UUID, pins storage-step deadlines and clarifies prepare/dispatch,
  test-only brands, operator-attested billing identities, dialogue timing and immutable late attempts.
  The missing-tool paid-repair delta is explicit. Draft 6 approvals cannot approve this new hash.
  Draft 5 received CHANGES REQUIRED from both reviewers. Draft 6 adds explicit no-start nullable-ID
  responses, narrow NPC session wiring, one account-owned global ceiling, database-coordinated
  finalization/recovery deadlines, conservative open-hold evidence, cross-midnight stop locking and
  missing source boundaries. Review 5 reports/receipts remain unchanged. The current Astra native
  configuration exception permits the next named review; it does not approve draft 5 or 6.
  Previous draft 4 verdicts below are historical findings, not current approval.

## Previous architecture findings

Review 4 leaves one Opus blocker: freeze the caller result before final trace construction, enforce
one caller-outcome record per request, and define recovery eligibility/coordination so a late writer
cannot contradict the returned result or race recovery. Checkpoint A source implementation is complete; initial acceptance found required repairs.
See `reviews/STAGE_300_OPUS_DESIGN_REVIEW_4_2026-10-11.md`; Fable's separate approval and material
implementation notes are adjacent. Renewed fresh dual approval must cover the revised exact artifact.

Before A, also pin all four mandatory positive ceiling classes, truly global daily bucket identity,
authorization references/duplicate-grant protection, exclusive operator-write locks, the local intent
provider's existing unparseable behavior, identity-based local exemption, and the minimal offline
compiling evaluation CLI at A. Preserve per-bucket conservative bounds in any batch reconciliation;
aggregate invoice allocation alone must never understate a campaign/session bucket's charge.

Owner exception 2026-10-11: for checkpoint A's native Sol acceptance reviewer session (including bounded re-review of these findings),
explicit `gpt-6.1-sol`/`xhigh` configuration is sufficient model evidence. Actual response-model
attestation is unavailable. This does not authorize implementation acceptance or extend the
exception to other checkpoints. Replacement clean assessments of this checkpoint use the same owner grant. Initial acceptance reports and receipts are preserved under
`reviews/STAGE_300_CHECKPOINT_A_*_INITIAL_2026-10-11.md` and
`reviews/STAGE_300_CHECKPOINT_A_INITIAL_RECEIPTS_2026-10-11.json`. Required repairs: absolute DB
deadlines, stored deadline drift, unresolved batch holds, and repeated higher settlement evidence.

Repair 1 fixed all four initial counterexamples; full validation passed (1661 unit, 128 integration,
45 E2E). Fresh clean assessments after a handoff peer-label disclosure: Sol FAIL, Opus PASS on
manifest `d4f97d28…8b442`. Required repair 2: enforce stored finalizer cutoff throughout persistence
and retain unknown COMMIT classification for ambiguous SQLSTATE errors. No dependent work.

Repair 2 accepted after both independent reviews; historical FAIL/PASS reports remain unchanged.
Source hashes were rechecked before updating this administrative status. Native Sol configuration
exception covers this checkpoint A assessment and its replacement clean session/bounded re-review,
not later checkpoints. No dependent implementation may modify accepted accounting scope without
renewed review of that affected scope.

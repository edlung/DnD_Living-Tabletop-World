# Current delivery workflow

Updated 2026-10-11. The owner's current AGENTS instructions take precedence over older process banners.

- Codex coordinates, prepares designs, integrates changes, and records verification. Claude Code is
  the implementation writer, using native Anthropic authentication. One writer owns a checkout.
- Bounded work: Sonnet 5.5, medium. Authorization, isolation, migrations, concurrency, recovery,
  or difficult debugging: Opus 5.5, high. Fable 5.1, high, independently reviews architecture.
- Before a stage or material architecture change: fresh independent Opus (`claude-opus-5-5`, xhigh)
  and Fable (`claude-fable-5-1`, high) approvals of the same exact artifact. Roadmap approval is
  insufficient. Pin identity/effort; verify provider and actual response models; no fallback approval.
- Each implementation checkpoint needs independent Opus 5.5 acceptance of actual changes and checks,
  explicitly xhigh, in a fresh session. Never resume an implementation session as reviewer. Even if
  Opus implemented the change, a separate fresh Opus review session performs acceptance. No session
  accepts its own work. Initial architecture reviews are also fresh and do not receive another
  reviewer's verdict. No inherited model or automatic fallback satisfies the named-model gate.
- Native subscriptions only for development/reviews; do not enable credits or change API billing.
  Runtime provider keys and budgets are separate. Do not expose or commit `.env.local`.
- Preserve baseline commit, dirty-file hashes, reviewed artifact hash, findings, fixes, checks,
  effective model/effort, elapsed time and attributable usage when available. Do not infer quota
  savings from API cost estimates or cache percentages.
- Owner play acceptance of Stages 290/300 remains deferred; independent review does not replace it.

## Current checkpoint

- Source baseline: `bc6c116`, branch `stage-300-live-ai`, PR 3 (stacked on Stage 290, PR 2).
- Stage 300: implemented, independent acceptance and owner NPC voice choice pending. The spending
  ledger and trace deliverables require review; the original $30 approval claim is withdrawn.
- Stage 310: continuation authorized 2026-10-11; DM skip/act policy decided the same day. Design
  preparation may proceed, but dependent implementation waits for the Stage 300 checkpoint and
  fresh dual architecture approval. No Stage 320 work is authorized.
- No new paid runtime calls until explicit text-provider spending ceilings are supplied.
- Stage 300 remediation drafts 1–3 received CHANGES REQUIRED. Draft 4 pins bounded whole-request
  and accounting deadlines, uniform runtime-session eligibility, restrictive automatic stops without
  lock upgrades, denied-repair/suspect-output outcomes and post-terminal evidence arithmetic.
  Current SHA256: `beb33666dc682f04719e6ae9a50c1139bf4ff2f09d2d9637ccfef0efbf55ada5`.
  It is not approved: Fable APPROVE, Opus CHANGES REQUIRED (review 4). The owner replaced Astra with Opus
  5.5/xhigh in a fresh session on 2026-10-11. The former Astra response-identity blocker is superseded;
  actual native Anthropic responses verified Opus 5.5 and Fable 5.1 in reviews 2–4.
  Historical Astra reports remain unchanged. The local-only preparation/closed-session Chronicle
  limitation still requires owner product disposition before checkpoint C completion.

## Checkpoint boundaries

1. Stage 300 baseline audit returned technical FAIL; see
   `reviews/STAGE_300_AUDIT_DISPOSITION_2026-10-11.md`. Acceptance remains pending under the new
   fresh-session Opus reviewer assignment; the findings still require closure.
2. Obtain dual architecture approval for any material Stage 300 remediation, then delegate one
   cohesive implementation task and obtain fresh-session Opus xhigh acceptance of the exact artifact.
3. Obtain dual approval of the Stage 310 design, then implement reviewed checkpoints covering
   scoped change signals/recovery, DM proxy actions, and persistent authoring history.
4. Owner plays affected flows. Preserve pending acceptance accurately; stop at Stage 310 boundary.

## Next required architecture fix

Review 4 leaves one Opus blocker: freeze the caller result before final trace construction, enforce
one caller-outcome record per request, and define recovery eligibility/coordination so a late writer
cannot contradict the returned result or race recovery. Source implementation has not started.
See `reviews/STAGE_300_OPUS_DESIGN_REVIEW_4_2026-10-11.md`; Fable's separate approval and material
implementation notes are adjacent. Renewed fresh dual approval must cover the revised exact artifact.

Before A, also pin all four mandatory positive ceiling classes, truly global daily bucket identity,
authorization references/duplicate-grant protection, exclusive operator-write locks, the local intent
provider's existing unparseable behavior, identity-based local exemption, and the minimal offline
compiling evaluation CLI at A. Preserve per-bucket conservative bounds in any batch reconciliation;
aggregate invoice allocation alone must never understate a campaign/session bucket's charge.

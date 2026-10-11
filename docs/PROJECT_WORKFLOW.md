# Current delivery workflow

Updated 2026-10-11. The owner's current AGENTS instructions take precedence over older process banners.

- Codex coordinates, prepares designs, integrates changes, and records verification. Claude Code is
  the implementation writer, using native Anthropic authentication. One writer owns a checkout.
- Bounded work: Sonnet 5.5, medium. Authorization, isolation, migrations, concurrency, recovery,
  or difficult debugging: Opus 5.5, high. Fable 5.1, high, independently reviews architecture.
- Before a stage or material architecture change: fresh independent Astra (`gpt-6-astra`, xhigh)
  and Fable (`claude-fable-5-1`, high) approvals of the same exact artifact. Roadmap approval is
  insufficient. Pin identity/effort; verify provider and actual response models; no fallback approval.
- Each implementation checkpoint needs independent Astra acceptance of actual changes and checks,
  xhigh by default. A bounded repair re-review may use high only under the owner's stated conditions.
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
- Stage 300 remediation design: draft 1 received CHANGES REQUIRED from both architecture assessments.
  Draft 2 incorporates those findings; SHA256
  `4028f4c34f1e94e7ecff2cc078de978e74157e5feb0a956027019ba154c0076f`.
  It is not approved. Renewed dual review of that exact artifact is required before implementation.
  Actual Astra response-model identity is unavailable in this runtime, so a formal named-model
  approval remains pending even if its configured review produces useful technical findings.

## Checkpoint boundaries

1. Stage 300 baseline audit returned technical FAIL; see
   `reviews/STAGE_300_AUDIT_DISPOSITION_2026-10-11.md`. Named-model acceptance remains pending;
   Astra response identity is not exposed by the native runtime.
2. Obtain dual architecture approval for any material Stage 300 remediation, then delegate one
   cohesive implementation task and obtain Astra acceptance of the exact verified artifact.
3. Obtain dual approval of the Stage 310 design, then implement reviewed checkpoints covering
   scoped change signals/recovery, DM proxy actions, and persistent authoring history.
4. Owner plays affected flows. Preserve pending acceptance accurately; stop at Stage 310 boundary.

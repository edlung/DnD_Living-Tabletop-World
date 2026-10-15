# Independent technical audit — Stage 300

Date: 2026-10-11. Baseline: `bc6c1162073f6c1c1e7bfb5b775d88a50b639181`.
Native reviewer agent `01a12941-19ef-7672-b8ac-4a4e7521b9df`, explicitly configured
`gpt-6-astra / xhigh`. Runtime configuration/provider receipt confirms Astra/xhigh/OpenAI;
actual response-model identity is not exposed. This is a technical FAIL, not certified named-model
acceptance. See `STAGE_300_REVIEW_RECEIPTS_2026-10-11.json`. No source writes or live provider calls.

## Result: FAIL

| Severity | Finding                                                  | Evidence at the audited baseline                                                                                                                                                                                                                        | Required regression                                                                                                                                            |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Spending ceiling is not enforced                         | `apps/server/src/ai/budget.ts:61`: ten concurrent mocked calls costing $0.008 each passed a $0.01 ceiling and recorded $0.08. Restart clears totals; no campaign limit.                                                                                 | Atomic durable campaign/day reservations across processes, restart and rollover.                                                                               |
| High     | Billed failures and timed-out attempts disappear         | `anthropic-provider.ts:109`, `openai-compatible-provider.ts:105` discard refusal/truncation usage; three billed failures left spend zero. `packages/ai/src/relevance.ts:154` recorded `attempts: []` after dispatch. `AiAttemptView` has no cost field. | Retain each dispatched attempt, configured/reported model, known usage/cost and conservative uncertain charges.                                                |
| High     | Evaluation has false-positive correctness/safety results | `eval-cli.ts:157` ignores `guardedBy`; its predicate accepted Orin claiming acquaintance with Captain Thorn. `cases.ts:45` accepted a different NPC name. Effective relevance deadline is not recorded; printed deadline is hardcoded.                  | Wrong-output negative controls, exact intent meaning, guarded/context-fidelity checks, ambiguity and Gate 04 matrix, effective deadline and unchanged actions. |
| Medium   | Accepted routes cannot reach local fallback              | `gateway.ts:89` accepts `anthropic,deepseek,local`; `fallback.ts:87` allows one switch. Zero-budget reproduction exhausted two remotes and never called local.                                                                                          | Every accepted route shape must preserve the approved switch/fallback contract.                                                                                |
| Medium   | Required Anthropic caching is absent                     | `anthropic-provider.ts:45` has no caching directive or cache-aware usage accounting.                                                                                                                                                                    | Injected-fetch cache-boundary and accounting tests.                                                                                                            |
| High     | Owner input/acceptance evidence is incomplete            | Baseline report treated silence as $30 approval; stage/session approval, NPC voice choice and owner play acceptance were not recorded.                                                                                                                  | Correct the claim and retain explicit pending dispositions. No tests can replace authorization or human acceptance.                                            |

## Verification and limits

The reviewer reports 139 passing tests across 12 focused suites with keys absent and Vitest caching
disabled. In-memory no-network probes reproduced budget, accounting, evaluation and route defects.
Code still matched the baseline after checks. Administrative documentation changes were excluded.
Existing context builders are unchanged and exercised isolation/authority regressions passed.
The client has generic resolving/no-reply messages, but live-versus-local fallback is indistinguishable.
Saved measurements do not prove full model quality or reliable total spending. Stage 310 was not reviewed.

No approval is inferred from passing tests. Source remediation and acceptance remain pending.

# Formal Checkpoints

Owner decision 2026-10-15: checkpoints are verified by the session that builds them (all checks plus an
adversarial pass) and dispositioned by the owner; independent review is optional (`AGENT_WORKFLOW.md`).
The Reviewer/Effort columns below are historical (Gates 01–05) or suggestions (Gate 06). Rows for Gates
01–05 preserve historical Astra assignments and artifact names.

| Completed Stage | Checkpoint | Reviewer | Effort | Required Handoff | Required Report | Progress Rule |
|---:|---|---|---|---|---|---|
| 20 | Gate #1 Knowledge Boundary | Astra | MAX | `handoffs/ASTRA_GATE_01_REQUEST.md` | `reviews/ASTRA_GATE_01_REPORT.md` | PASS -> Stage 30 |
| 70 | Gate #2 Knowledge Integrity | Astra | MAX | `handoffs/ASTRA_GATE_02_REQUEST.md` | `reviews/ASTRA_GATE_02_REPORT.md` | PASS -> Stage 80 |
| 90 | Gate #3 Reaction Integrity | Astra | MAX | `handoffs/ASTRA_GATE_03_REQUEST.md` | `reviews/ASTRA_GATE_03_REPORT.md` | PASS -> Stage 100 |
| 130 | Gate #4 NPC Isolation | Astra | MAX | `handoffs/ASTRA_GATE_04_REQUEST.md` | `reviews/ASTRA_GATE_04_REPORT.md` | PASS -> Stage 140 |
| 180 | Gate #5 / Stage 190 Full Red Team | Astra | MAX | `handoffs/ASTRA_GATE_05_REQUEST.md` | `reviews/ASTRA_GATE_05_REPORT.md` | PASS -> Stage 200 |
| 350 | Gate #6 / Stage 355 Full-Stack Red Team | Opus 5.5 (fresh session) | XHIGH | `handoffs/OPUS_REVIEW_GATE_06_REQUEST.md` | `reviews/OPUS_REVIEW_GATE_06_REPORT.md` | PASS -> Stage 360 |

A FAIL routes to remediation and a re-verification recorded under a new filename. Historical reports are immutable; retests use new filenames.

PASS permits the owner to authorize the listed next stage; it is not automatic continuation.

For new retests, including reopened historical gates, use `remediation/OPUS_GATE_<NN>_REMEDIATION.md` and `reviews/OPUS_REVIEW_GATE_<NN>_RETEST_<K>.md`. Preserve all earlier Astra artifacts. A retest request names its exact output file instead of the original report. Coverage obligations are in `docs/GATE_COVERAGE.md`.

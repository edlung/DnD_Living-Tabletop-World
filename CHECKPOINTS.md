# Formal Checkpoints

| Completed Stage | Checkpoint | Reviewer | Effort | Required Handoff | Required Report | Progress Rule |
|---:|---|---|---|---|---|---|
| 20 | Gate #1 Knowledge Boundary | Astra | MAX | `handoffs/ASTRA_GATE_01_REQUEST.md` | `reviews/ASTRA_GATE_01_REPORT.md` | PASS -> Stage 30 |
| 70 | Gate #2 Knowledge Integrity | Astra | MAX | `handoffs/ASTRA_GATE_02_REQUEST.md` | `reviews/ASTRA_GATE_02_REPORT.md` | PASS -> Stage 80 |
| 90 | Gate #3 Reaction Integrity | Astra | MAX | `handoffs/ASTRA_GATE_03_REQUEST.md` | `reviews/ASTRA_GATE_03_REPORT.md` | PASS -> Stage 100 |
| 130 | Gate #4 NPC Isolation | Astra | MAX | `handoffs/ASTRA_GATE_04_REQUEST.md` | `reviews/ASTRA_GATE_04_REPORT.md` | PASS -> Stage 140 |
| 180 | Gate #5 / Stage 190 Full Red Team | Astra | MAX | `handoffs/ASTRA_GATE_05_REQUEST.md` | `reviews/ASTRA_GATE_05_REPORT.md` | PASS -> Stage 200 |
| 350 | Gate #6 / Stage 355 Full-Stack Red Team | Astra | MAX | `handoffs/ASTRA_GATE_06_REQUEST.md` | `reviews/ASTRA_GATE_06_REPORT.md` | PASS -> Stage 360 |

A FAIL always routes to Opus remediation and Astra retest. Historical reports are immutable; retests use new filenames.

PASS permits the owner to authorize the listed next stage; it is not automatic continuation. `EFFORT_MATRIX.md` owns model/effort settings; values above are summaries.

For every gate, including Gates #5 and #6, use `remediation/OPUS_GATE_<NN>_REMEDIATION.md` and `reviews/ASTRA_GATE_<NN>_RETEST_<K>.md`. A retest request names its exact output file instead of the original report. Coverage obligations are in `docs/GATE_COVERAGE.md`.

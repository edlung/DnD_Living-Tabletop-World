# Opus Gate Remediation Report

- Gate:
- Astra report:
- Retest number / required output path:
- Revision before remediation:
- Revision after remediation:
- Status: AWAITING_ASTRA_RETEST

## Finding Remediation

### <Finding ID>
- Severity:
- Violated invariant:
- Root cause:
- Regression test added first:
- Fix:
- Why this fixes the boundary rather than only the symptom:
- Validation evidence:

## Full Validation
| Command | Result |
|---|---|
| ... | PASS |

## Deferred Findings
<None, or owner-approved dispositions with ADR/risk-acceptance reference.>

## Retest Request
Astra: independently retest all original blocking findings and adjacent attack paths. Write `reviews/ASTRA_GATE_<NN>_RETEST_<K>.md` using the exact number/path above. Gate #5 uses `05`, including Stage 190. Update the handoff with review type RETEST and this same output path. Preserve earlier reports. Do not rely on this report's claim that a fix is correct.

## Hard Stop
Opus stops here. Do not begin the next stage until Astra writes PASS.

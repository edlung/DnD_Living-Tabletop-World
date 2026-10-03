# Astra Gate Handoff Request

- Gate: <# / name>
- Review type: INITIAL / RETEST
- Completed stage: <stage>
- Revision/commit: <sha or immutable build id>
- Prior report / remediation / retest number: <required for RETEST; remediation may be N/A with reason for coverage expansion after PASS>
- Required output path: <exact initial report or numbered retest path from CHECKPOINTS.md>
- Requested Astra effort: MAX
- Status: <AWAITING_ASTRA_REVIEW for INITIAL; AWAITING_ASTRA_RETEST for RETEST>

## Review Objective
<one paragraph describing the boundary Astra must try to break>

## Authoritative Documents
<List only documents relevant to this gate. Always include ARCHITECTURE_INVARIANTS.md.>

## Surfaces Available to Reviewer
- API/routes:
- CLI/test harness:
- UI if relevant:
- Logs/traces:

## Start / Reproduce
```text
<exact commands>
```

## Test Personas / Scopes
<List credentials/fixtures/personas such as PLAYER, PARTY, MIRA, PUBLIC, DM. Never include production secrets.>

## Canonical Secret or Invariant Under Test
<Describe what must remain protected/correct without revealing it to an unauthorized runtime persona. Astra as reviewer may know the expected canonical fixture.>

## Validation Already Run by Opus
| Command | Result |
|---|---|
| ... | PASS |

## Known Limitations
<Honest limitations only; do not explain how the implementation enforces the boundary or coach the attack.>

## Coverage Ledger
Use `docs/GATE_COVERAGE.md`. List each due surface with reproducible access, plus future surfaces with their introduction stage and next review gate. Required but untestable surfaces block PASS. Do not label future or unavailable surfaces as tested.

## Required Output
Write the exact required output path above using `ASTRA_REVIEW.md`: `reviews/ASTRA_GATE_<NN>_REPORT.md` for INITIAL or `reviews/ASTRA_GATE_<NN>_RETEST_<K>.md` for RETEST. Gate #5 uses `05`, including the review activity called Stage 190. Preserve previous reports. Do not modify source implementation. End with PASS or FAIL and STOP.

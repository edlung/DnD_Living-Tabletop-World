# Independent Checkpoint Handoff Request

- Gate: <# / name>
- Review type: INITIAL / RETEST
- Completed stage: <stage>
- Revision/commit: <sha or immutable build id>
- Prior report / remediation / retest number: <required for RETEST; remediation may be N/A with reason for coverage expansion after PASS>
- Required output paths: <separate Sol and Opus reports for this same artifact; formal gates use CHECKPOINTS.md>
- Requested reviewers: gpt-6.1-sol / xhigh and claude-opus-5-5 / xhigh, independent clean sessions
- Accepted architecture artifact: <design SHA256 and independent Astra/Fable evidence>
- Dirty-file hashes / package identity: <exact manifest; preserve existing dirty work>
- Status: <AWAITING_SOL_AND_OPUS_REVIEW / AWAITING_SOL_AND_OPUS_RETEST>

## Review Objective
<one paragraph describing the boundary each reviewer must try to break>

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
<Describe what must remain protected/correct without revealing it to an unauthorized runtime persona. Each reviewer may know the expected canonical fixture.>

## Validation Already Run by Implementation Writer
| Command | Result |
|---|---|
| ... | PASS |

## Known Limitations
<Honest limitations only; do not explain how the implementation enforces the boundary or coach the attack.>

## Coverage Ledger
Use `docs/GATE_COVERAGE.md`. List each due surface with reproducible access, plus future surfaces with their introduction stage and next review gate. Required but untestable surfaces block PASS. Do not label future or unavailable surfaces as tested.

## Required Output
Return a separate report for each exact output path above, using the relevant review mission and
PASS/FAIL evidence. Formal gate naming is in `CHECKPOINTS.md`; intermediate checkpoints name both
reports explicitly. Preserve earlier reports and requests. Reviewers do not modify implementation
or inspect their peer's current verdict; the orchestrator may save returned reports and receipts.
End with PASS or FAIL and STOP. Neither approval alone advances dependent work.

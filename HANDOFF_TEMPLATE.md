# Checkpoint Handoff

- Gate: <# / name>
- Type: INITIAL / RETEST
- Completed stage: <stage>
- Revision/commit: <sha or immutable build id>
- Prior report / remediation / retest number: <required for RETEST; remediation may be N/A with reason for coverage expansion after PASS>
- Report path: <formal gates use CHECKPOINTS.md>
- Session model: <model that did the work>
- Approved design: <design SHA256 and the owner's approval record>
- Dirty-file hashes / package identity: <exact manifest; preserve existing dirty work>
- Status: <AWAITING_OWNER_DISPOSITION>

## Objective
<one paragraph describing the boundary this checkpoint must hold>

## Authoritative Documents
<List only documents relevant to this gate. Always include ARCHITECTURE_INVARIANTS.md.>

## Surfaces to Attack
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

## Validation Run
| Command | Result |
|---|---|
| ... | PASS |

## Known Limitations
<Honest limitations only; do not explain how the implementation enforces the boundary or coach the attack.>

## Coverage Ledger
Use `docs/GATE_COVERAGE.md`. List each due surface with reproducible access, plus future surfaces with their introduction stage and next review gate. Required but untestable surfaces block PASS. Do not label future or unavailable surfaces as tested.

## Adversarial Pass
<attacks tried against this boundary and their results; findings fixed or listed with disposition>

## Required Output
The report named above, ending with PASS or FAIL and the honest limits of what was verified. STOP for the
owner's disposition. An optional independent review (`AGENT_WORKFLOW.md`) is recorded separately.

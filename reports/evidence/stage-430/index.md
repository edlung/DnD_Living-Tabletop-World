# Stage430 evidence

Status:**TECHNICALLY_VERIFIED / CONTINUING_BY_OWNER_DIRECTION**,2026-10-30.

- [Completion report](../../STAGE_430_COMPLETION.md):scope, changed entrypoints,
  own adversarial repairs, boundaries and continuation.
- [Full validation](validation.txt):exit0;3,267unit,331PostgreSQL,172browser tests.
  [Isolated runner](validation-runner.txt) blanks paid-provider routes and creates/
  drops only a throwaway database. Default DB remains unchanged.
- [Final focused browser run](browser-focused-green.txt):5owner journeys pass.
  The full validation also includes all3picture/Russian/unavailable journeys.
- [Layout receipt](layout/receipt.json), [measurement/axe rows](layout/results.json),
  [audit log](layout/audit.log):44states at1440/768/390/320,88PNGs;0errors,
  0warnings,0axeviolations. All11views were inspected at each width.
  Start with `candidate-diff-1440.png`, `restore-preview-768-viewport.png`,
  `manual-diff-390.png`, `protections-320-viewport.png` inside `layout/`.
  The runner/server sources and scoped web check logs are retained beside them.
- [Mode defect excerpt](edit-mode-red.txt):actual initial wrong GENERATE presentation
  for an EDIT. Backend unit/PG/HTTP and final browser checks verify the repair.
- [Form-model green log](form-model-green.txt):20tests after nullable repair.
  [Reconstructed receipt](nullable-model-reconstructed.json) explicitly reconstructs
  earlier tool outputs; it is not an original RED/PG raw log. Final source includes
  two further identity-preservation cases, covered by full validation.
- [Head-poll harness failure](browser-head-poll-red.txt) records the test's repeated
  heavyweight context reads hitting the unchanged operational bucket. Final polling
  uses lightweight history; [selector failure](browser-selector-red.txt) retains a
  later exact-text harness mismatch. Final assertions retain the same behaviors.
- `package.sha256` binds delivered source and evidence. Its digest is carried in
  `handoffs/STAGE_430_REQUEST.md`, outside the manifest to avoid self-reference.

Only injected/scripted provider transport ran. PostgreSQL authorization, durable
marker, accounting, jobs, candidates, review/adoption and guards are real. No live
provider quality, paid invoice/latency, canonical played campaign or human acceptance
is claimed. Technical continuation proceeds to440 under the owner's instruction.

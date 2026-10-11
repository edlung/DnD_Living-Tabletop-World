**Verdict: CHANGES REQUIRED** on draft 1 of the B2 stop-scope delta.

I reviewed the artifact as read from disk together with the base design, the five hashed accounting sources, migrations 0005 and 0006, the accounting module guidance, and the existing stop tests. I could not compute SHA256 in this session, so byte identity rests on the coordinator's external check. The HEAD recorded in the artifact matches the current branch tip.

## What is sound

- **The dual restriction is strictly more restrictive.** It adds a denial path and no allowance, so it cannot conflict with the base design's ceilings or the one-switch policy.
- **The schema already carries what the wider match needs.** A stop row records account, approval and source attempt, and the attempt row records provider, model and pricing version. A reason-keyed read-side join needs no migration.
- **Concurrency holds under the accepted protocol.** Admission reads stops only after taking the account-control key exclusively, and settlement, suspect holds and operator writes append stops under that same key or under the exclusive policy lock. A committed stop is therefore visible to every later admission on that account across days and processes, with no lock upgrade and no new ordering.
- **One clearance per stop ID stays coherent.** Clearances are keyed by stop ID, so pre-B2 rows and existing clearances need no rewrite, and clearing an unrelated stop cannot leak.
- **Accepted-A tests are additive, not flipped.** The overrun tests I read admit on the same approval, and the rotation test covers only the unexpected-model stop, so B2 adds assertions rather than reversing accepted ones.

## Blocking findings

1. **The matching predicate and the stop row shape are underdetermined, and one natural reading weakens the approval-wide block.** The current query in `spend.ts` matches by column nullness, not by reason. If B2 writes provider and model into new overrun rows while keeping that query shape, the existing AND chain narrows the original approval restriction to one route, contradicting the artifact's own promise. If B2 instead adds an attempt join without keying it by reason, the fail-closed branch leaks into suspect stops. Correction: state that new overrun and discrepancy rows keep the accepted shape with provider and model null, and define the predicate per reason. For overrun and discrepancy: same account, and either the approval matches, or the source attempt's provider and model match, or the source attempt is absent or disagrees on account. For unexpected model and unverified billing: the existing predicate, with no attempt join. Add that any row outside these two documented shapes fails closed for the whole account.

2. **Canonical model identity is not pinned as stable across catalog and pricing versions.** The artifact ties identity to "the pinned, explicitly verified catalog". A later catalog revision that renames a canonical identity, or re-maps an alias to a new one, would leave old stops matching a string nothing resolves to any more. That is the model-dimension analogue of the grant and midnight bypasses this delta closes. Correction: declare the canonical identity a provider-scoped stable identifier independent of pricing version and catalog version. A catalog revision may add aliases to an existing identity but cannot rename one, and no catalog or pricing revision clears a stop.

3. **The recorded contract still says the opposite and the artifact does not schedule its amendment.** ADR 0032 states that an overrun or discrepancy stops its approval, and the base design uses the same wording. The artifact must list an append-only ADR 0032 amendment entry, plus the doc comments in the accounting module, as B2 deliverables, and state that this delta supersedes that sentence. Without that, acceptance has no pinned text to check the implementation against.

## Recommended corrections, not blocking

- **Clearance is attestation.** The store inserts an authorized clearance row without checking that the source attempt was reconciled. Either reword "only explicit operator verification permits clearance" to say the record attests verification, or require the operator store to refuse clearing an overrun whose source attempt still has no terminal row. Also have reconcile and evidence commands print any stop ID they append, since an operator-induced discrepancy now halts the whole account route.
- **Pin the denial for unverified identity.** Say whether an unmapped alias is a composition-time route refusal with no remote adapter built, or a runtime denial with an existing fixed detail. No new detail code should be needed.
- **Provider identity.** Stops match on the provider string. Require that it is the adapter's fixed ID, never a configurable label.

## Residual risks

- A single under-estimated bound, not provider misbehaviour, now halts every campaign on that account's route until an operator clears it. Local fallback keeps play going, but this is an explicit availability cost the owner should see stated.
- Operator aliasing of billing accounts remains an attestation limit, as in the base design.
- A DM observing a stop on a route their campaign never overran can infer another campaign's overrun. This is inherent to a shared account and already true of the global day ceiling.

## Necessary tests beyond the artifact's list

- Each of the four reasons against four admissions: same approval other route, sibling approval same route, sibling approval other route, other account same route.
- A raw stop row with null attempt, inserted directly, denies every route on that account and nothing on another.
- A new pricing version for the same canonical identity is still denied.
- Operator evidence above bound on a crash-held attempt denies the sibling, and clearance afterwards leaves the hold counted.
- Batch-evidence discrepancy on one approval denies the sibling on that route.
- Both interleavings of overrun settlement and sibling admission on the account-control barrier: stop first then denial, and admission first then its hold still applies.
- Two stops on one route need two clearances.
- Two aliases resolve to one attempt model while the request journal keeps the configured alias.
- The sibling campaign's diagnostic shows a fixed stopped reason and no stop ID, attempt ID or source campaign.
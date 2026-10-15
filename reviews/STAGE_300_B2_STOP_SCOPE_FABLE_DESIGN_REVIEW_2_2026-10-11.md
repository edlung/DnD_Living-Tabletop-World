**Verdict: APPROVE** draft 2 of the B2 stop-scope delta as an architecture delta only. This is not implementation approval and not live enablement.

I reviewed the revised bytes as read from disk against the same accounting sources, migrations and base design already in this session. I cannot compute SHA256 here, so byte identity rests on the coordinator's external check. The HEAD and source hashes listed in the artifact are unchanged from draft 1.

**All three blockers from my draft 1 review are resolved in the text.**

- **Predicate and row shape.** New overrun and discrepancy rows keep the accepted shape with approval present and provider and model null. The predicate is reason-specific, the recorded predicate is an explicit minimum, derived scope is joined by OR, and the two suspect reasons keep their nullness predicate with no attempt join. A row outside its documented shape fails closed for its recorded account. This closes the weakening path I described.
- **Canonical identity stability.** Identity is now a provider-scoped stable identifier independent of pricing and catalog versions. Revisions may add aliases but not rename or remap. Historical tuples resolve through verified equivalence mappings, and a missing or inconsistent mapping fails closed for the account until verified or cleared. Provider identity is the adapter's fixed ID.
- **Recorded contract.** The artifact now names the ADR 0032 amendment, module guidance and context-map entry as append-only B2 deliverables that acceptance checks, and it links this delta rather than editing frozen bytes.

The recommended corrections were also taken: clearance is stated as attestation with no inferred completion and no hold reduction, reconcile and evidence commands must return appended stop IDs, and the regression matrix now covers the four-reasons-by-four-admissions grid, malformed shapes, pricing-version changes, both lock interleavings, two stops needing two clearances, and pre-B2 alias stops.

**No remaining blockers.** The items below are clarifications the ADR amendment should pin and checks acceptance should run. None changes the architecture.

- **Composition-time refusal versus per-request denial.** The artifact says an unverified configured identity is refused at composition "using the existing fixed ADMISSION_DISABLED denial". A route refused before its adapter is built has no request to deny. The amendment should state that such a route is local-only with no fictitious denied remote attempt, as the base design already requires, and that the fixed denial applies to runtime identity gaps found by the admission store.
- **Enumerate all four accepted row shapes.** The artifact states the overrun and discrepancy shape and the unverified-billing shape explicitly, and the unexpected-model shape by reference to the existing predicate. The amendment should list all four so "outside its documented shape" has one authoritative definition.
- **Name the runtime detail for identity gaps.** Either reuse the existing stopped detail or add one fixed internal detail. It must never carry campaign or stop facts.
- **Add two small assertions.** The unexpected-model stop writes the canonical attempt model, never the raw returned string, into its model column. The request journal's configured-model field retains the alias while the attempt row holds the canonical identity.
- **Bound the extra admission work.** Verifying registry coverage of every uncleared stop source on the account is an additional read plus application-side resolution inside the same bounded transaction. Acceptance should confirm it stays within the storage-step deadline and that a timeout maps to the existing unavailable denial with no dispatch.

**Residual risks, all acknowledged or acceptable:**

- A single underestimated bound suspends every campaign on that account's route until an operator clears it. The artifact states this and local fallback keeps play available.
- A catalog deprecation that drops an identity still referenced by an uncleared stop halts the whole account until the mapping is restored or the stop is cleared. That is the intended fail-closed behavior, but clearing to restore service is an attestation the operator makes without the store checking reconciliation. The CLI should say which cause produced the denial so clearance is informed.
- Account aliasing by an operator remains an attestation limit, as in the base design.
- Shared-account denial timing can reveal that shared capacity is unavailable. Fixed diagnostics expose no source campaign or stop facts.
- The historical mapping machinery is defensive. Production has no pre-B2 attempts, so the mapping is an identity map at B2 start, and its value lies in guarding later catalog changes.
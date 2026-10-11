# Stage 300 B2 stop-scope architecture delta — draft 2

Status: DRAFT, requires independent Astra xhigh and Fable xhigh approval of these exact bytes. This document clarifies one stop invariant for B2; it does not authorize implementation before B1 acceptance, live calls, catalog verification or later stages. Do not change accepted design draft 7 or historical evidence.

## Baseline and authority

- Approved base design SHA256: `23e53e4d24e01e6b3752c61de1f698a594c2ee763a746f184f062cebfef4aab2` (`docs/STAGE_300_REMEDIATION_DESIGN.md`).
- Accepted checkpoint A manifest: `0c5e7373fee933f92b259798531cd51401022bc7c6446da16535435dffe5e63e`, saved in `reviews/STAGE_300_CHECKPOINT_A_ACCEPTED_MANIFEST_2026-10-11.json`.
- HEAD: `406904343bfe8542640035564d3e044561824125`, dirty accepted A source. B1 is being implemented separately and cannot modify the accounting files below.
- Owner product decisions 2026-10-11: operator CLI records own ceilings; preparation without an active play session and Chronicle after session closure remain local only. No paid runtime or external catalog verification is authorized.
- Effective roles: architecture Astra/Fable xhigh; implementation Opus medium (review repairs xhigh); acceptance independent fresh Sol/Opus xhigh. This delta needs its own architecture approval before B2 changes accepted A stop behavior.

Relevant accepted source hashes:
- `apps/server/src/ai/accounting/spend.ts`: `a3533cfd4f83d1edafb86a82122b0135f4558544b9271f592068649fe2273276`.
- `apps/server/src/ai/accounting/admission.ts`: `4c5dd5a2d68976bb589064e21fceeb8715264b6461bb375be9519b6db046c768`.
- `apps/server/src/ai/accounting/settlement.ts`: `5f2564ccaa79506077c024a206c09dacf063a0e8b07a0dd1eec9e8864fdc857f`.
- `apps/server/src/ai/accounting/operator-store.ts`: `11dab15623df003159ab39ed3e0e408baebe4505668bfb50c4919137e759c028`.
- `apps/server/src/ai/accounting/lock-keys.ts`: `ea3d258c600f279749cf8915b7777f1f8cf387db8a2ef5c09ba54af5fadaa9ac`.

## Problem and required behavior

A currently writes an approval-wide `OVERRUN` or `DISCREPANCY` stop. A sibling approval on the same billing account can still use the same provider/model. A charge exceeding its reservation proves the admission bound or verified billing evidence is unreliable for that route; changing grants or crossing midnight must not bypass that restriction. Conflicting later charge evidence is treated conservatively as the same route-integrity problem until explicitly reconciled.

Preserve the original approval-wide restriction and additionally block the affected account/provider/model across every approval and UTC day. This is more restrictive than A; it grants no extra authority or budget. Other billing accounts and other models/providers on unrelated approvals remain unaffected. The original approval remains blocked on every route until clearance, as today.

## One immutable stop, two effective restrictions

Keep the existing stop record and its single stop ID; do not add a parallel compatibility ledger, duplicate stop rows or mutate historical rows. New OVERRUN/DISCREPANCY rows retain the accepted shape: approval present, provider and model null, source attempt present. The admission predicate is reason-specific: only these two reasons derive additional source-attempt scope. UNEXPECTED_MODEL and UNVERIFIED_BILLING keep their existing column/nullness predicate with no source-attempt join; UNVERIFIED_BILLING remains provider-wide with model null. For any recognized reason, a row outside its documented accepted shape fails closed for the whole recorded account. Never combine the original approval-wide and derived route restrictions with AND; their denial conditions are OR.

For an uncleared `OVERRUN` or `DISCREPANCY` on account X:

1. Preserve the entire existing stop predicate as a minimum restriction, including its recorded approval and any wildcard scope. Deriving additional scope may never substitute the source approval or narrow the recorded predicate.
2. Derive the affected provider/model from the immutable source attempt referenced by `attempt_id` and match account X/provider/model independently of the approval ID.
3. If the source attempt is absent, its account disagrees with the stop account, or a non-null recorded stop approval disagrees with its source attempt approval, fail closed for all remote routes of account X until the same explicit operator clearance. A null recorded approval retains its existing account-wide wildcard restriction. Never substitute source fields to weaken the recorded predicate.

The existing append-only schema already records account, approval and source attempt. The source attempt records provider, model and pricing version. No migration or backfill is required for this query interpretation. It applies equally to pre-B2 and newly written stops, so restart/deployment cannot bypass old restrictive evidence. `UNEXPECTED_MODEL` and `UNVERIFIED_BILLING` retain their current independent account/provider/model matching; no weakening of their scope.

A single existing authorized `clearStop(stopId)` clears both effective restrictions. It remains an append-only clearance under the exclusive policy lock with owner/date/source reference. The authorized clearance record is the operator’s explicit attestation that verification/reconciliation permits clearance; the store does not infer provider completion or refund an open hold. No new terminal-row prerequisite for clearance is introduced. Clearing a stop never reduces accounting charges or holds. Operator reconciliation/evidence CLI output must return any stop IDs appended by the operation, so the operator can identify the single clearance target. Only explicit operator attestation permits clearance; approval creation/revision, account enablement, retry, new session, day rollover, new process or catalog selection does not clear it. No automatic clearance or expiry is introduced. Existing clearances remain effective.

## Model identity and catalog boundaries

B2 admission must use a canonical model identity from the pinned, explicitly verified catalog. The request journal retains the original configured model separately. Trusted composition resolves permitted configured aliases and returned versions to the canonical model identity; stored attempt.model and stop matching use that canonical identity. Two aliases of the same verified model must not bypass a stop. A genuinely different model is a different route, requiring its own verified catalog entry.

Historical attempts retain their original `(provider, model, pricing_version)` strings. Wider matching must resolve this immutable tuple through explicitly verified historical identity mappings to the same stable canonical model identity used for new admission; never compare a legacy alias verbatim with a newly canonicalized string. The verified registry must cover every uncleared stop source for the account, including retained catalog versions. Provider identity is the adapter’s fixed ID, never a configurable label. Canonical model identity is a provider-scoped stable identifier independent of pricing and catalog versions; verified revisions may add aliases but may not rename it or remap an existing alias to bypass restrictions. Canonical identity is stable across catalog revisions and processes; replacement catalogs must retain verified historical equivalence mappings or deny all remote admission for that affected account. Missing, ambiguous or inconsistent historical identity mappings fail closed for the account until verified evidence restores a consistent identity or the existing authorized stop clearance is recorded. No external lookup, automatic inference, row mutation, new clearance or catalog replacement may silently discard a historical restriction. An imported historical identifier requires an explicit verified equivalence mapping to the stable identity preserving the same restriction; missing or inconsistent equivalence denies admission. Pricing revisions never change identity or clear a stop.

The existing A store accepts trusted `AdmissionRequest.model`; this delta defines B2's value, not player input or a new public DTO. Catalog absence, unverified alias mapping or inconsistent canonical identity denies remote admission. No inferred alias, unpriced option, provider lookup or live experiment is permitted. An unverified configured identity is refused at trusted composition before building a remote adapter or revealing a Secret, using the existing fixed ADMISSION_DISABLED denial. Historical identity gaps discovered by the admission store deny at runtime with that same fixed reason and no remote dispatch. Catalog verification remains separately authorized; an empty verified catalog is a valid fail-closed implementation state.

## Concurrency and evidence

Keep the accepted locking protocol: admission/settlement take shared policy key -1 followed by sorted bucket and stable account-control locks before stop/totals reads or automatic-stop writes. Operator mutations take exclusive policy. No shared-to-exclusive upgrade, deferred stop transaction or request/bucket nesting. The wider match uses the same account-control serialization already present across days.

Known successful usage, malformed output, refusal and late safe billing evidence retain all existing accounting behavior. Effective charge remains MAX of absolute terminal/evidence charges; open hold remains MAX(hold,evidence). A stop never subtracts a charge or releases a hold. Already admitted reservations may dispatch under the base design; their holds still apply. The wider stop changes only subsequent admission.

The accepted conservative batch rule remains: batch evidence requires terminal accounting for every included attempt and never closes an uncertain open hold. Per-attempt operator reconciliation with recorded proof remains the existing path. This delta does not introduce provider-attempt completion authority or relax batch rules.

## Privacy and UX

No new public status, player-supplied identity or accounting capacity exposure. A denied caller receives the existing fixed `ADMISSION_DISABLED`/stopped reason and the base outcome-contract fallback. Campaign diagnostics expose only that campaign's request/attempt facts; they must not disclose another campaign's stop source, attempt IDs, spend, prompts or allowance. The trusted operator CLI remains the administrative surface for clearance.

## Documentation deliverables and availability tradeoff

This delta supersedes only the base design and ADR 0032 sentences that describe OVERRUN/DISCREPANCY as approval-only stops; frozen approved bytes and historical evidence remain unchanged. B2 must append an ADR 0032 amendment describing the dual restrictions, stable identity, reason-specific predicate and attested clearance, update accounting module comments/guidance and the context-map entry, and link the exact independently approved delta. Acceptance checks both implementation and these append-only contract amendments.

An underestimated bound can now suspend every campaign using that account’s affected route until operator clearance. Local fallback keeps play available. Shared-account denial timing may reveal that shared capacity is unavailable; fixed diagnostics expose no source campaign or stop facts. Account aliasing remains an operator-attestation limit.

## Required B2 verification and acceptance

- Two approvals on the same account and model: overrun/discrepancy on one denies the sibling, including a fresh process and next UTC day.
- The original approval remains blocked for another provider/model; an unrelated approval's genuinely different verified route remains eligible when its ceilings permit.
- Other accounts remain eligible; account identity remains operator-attested as in the base design.
- Existing pre-B2 stop rows receive the wider match without rewriting; a single authorized clearance removes both restrictions. Clearing an unrelated stop has no effect.
- Missing/mismatched source attempt or inconsistent recorded/source approval fails closed account-wide; the recorded approval and wildcard restrictions remain minimum restrictions. Unknown model/usage stops retain their prior scopes, including provider-wide `UNVERIFIED_BILLING` with null model.
- A pre-B2 alias stop blocks new admission under the canonical name or another verified alias. Catalog replacement, different pinned catalog versions and process restart cannot bypass historical stop identity. Missing, ambiguous or inconsistent historical mappings deny account admission without Secret revelation.
- Two accepted aliases for the same canonical model are blocked together; absent/unverified catalog mappings dispatch nothing and reveal no Secret.
- Concurrent overrun settlement and sibling admission serialize on the stable account lock; no deadlock; admission started after committed stop is denied. No shared/exclusive upgrade.
- Client/diagnostic fallback reveals no other campaign details; no duplicate ledger or mutable stop history.
- Cover each of the four stop reasons against same-approval other-route, sibling same-route, sibling other-route, and other-account admissions; malformed shape fails closed only for its recorded account.
- Pricing-version changes preserve restrictions; operator evidence on a crash-held attempt and batch discrepancy block siblings, while clearance leaves holds counted. Two active stops require two clearances. Both admission/settlement interleavings preserve committed-stop denial and already-admitted holds.
- Full offline validation and fresh independent Sol/Opus xhigh acceptance cover the affected accepted-A accounting boundary together with B2 integration.

## Exclusions and remaining decisions

No paid call, verified catalog content, provider/model choice for live play, new session class, authentication/deployment, image service, Stage 310/320, or extra caller deadline is approved here. Base design invariants and B1/B2/C checkpoint gates remain. If either architect finds this canonical-identity or stop interpretation insufficient, return required changes on this artifact; do not implement an alternative silently.

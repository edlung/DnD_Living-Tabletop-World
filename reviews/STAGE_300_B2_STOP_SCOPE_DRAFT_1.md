# Stage 300 B2 stop-scope architecture delta — draft 1

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

Keep the existing stop record and its single stop ID; do not add a parallel compatibility ledger, duplicate stop rows or mutate historical rows.

For an uncleared `OVERRUN` or `DISCREPANCY` on account X:

1. Preserve approval-wide matching using its recorded/source approval.
2. Derive the affected provider/model from the immutable source attempt referenced by `attempt_id` and match account X/provider/model independently of the approval ID.
3. If the source attempt is absent or its account disagrees with the stop account, fail closed for all remote routes of account X until explicit operator clearance; do not silently fall back to approval-only matching.

The existing append-only schema already records account, approval and source attempt. The source attempt records provider, model and pricing version. No migration or backfill is required for this query interpretation. It applies equally to pre-B2 and newly written stops, so restart/deployment cannot bypass old restrictive evidence. `UNEXPECTED_MODEL` and `UNVERIFIED_BILLING` retain their current independent account/provider/model matching; no weakening of their scope.

A single existing authorized `clearStop(stopId)` clears both effective restrictions. It remains an append-only clearance under the exclusive policy lock with owner/date/source reference. Only explicit operator verification/reconciliation permits clearance; approval creation/revision, account enablement, retry, new session, day rollover, new process or catalog selection does not clear it. No automatic clearance or expiry is introduced. Existing clearances remain effective.

## Model identity and catalog boundaries

B2 admission must use a canonical model identity from the pinned, explicitly verified catalog. The request journal retains the original configured model separately. Trusted composition resolves permitted configured aliases and returned versions to the canonical model identity; stored attempt.model and stop matching use that canonical identity. Two aliases of the same verified model must not bypass a stop. A genuinely different model is a different route, requiring its own verified catalog entry.

The existing A store accepts trusted `AdmissionRequest.model`; this delta defines B2's value, not player input or a new public DTO. Catalog absence, unverified alias mapping or inconsistent canonical identity denies remote admission. No inferred alias, unpriced option, provider lookup or live experiment is permitted. Catalog verification remains separately authorized; an empty verified catalog is a valid fail-closed implementation state.

## Concurrency and evidence

Keep the accepted locking protocol: admission/settlement take shared policy key -1 followed by sorted bucket and stable account-control locks before stop/totals reads or automatic-stop writes. Operator mutations take exclusive policy. No shared-to-exclusive upgrade, deferred stop transaction or request/bucket nesting. The wider match uses the same account-control serialization already present across days.

Known successful usage, malformed output, refusal and late safe billing evidence retain all existing accounting behavior. Effective charge remains MAX of absolute terminal/evidence charges; open hold remains MAX(hold,evidence). A stop never subtracts a charge or releases a hold. Already admitted reservations may dispatch under the base design; their holds still apply. The wider stop changes only subsequent admission.

The accepted conservative batch rule remains: batch evidence requires terminal accounting for every included attempt and never closes an uncertain open hold. Per-attempt operator reconciliation with recorded proof remains the existing path. This delta does not introduce provider-attempt completion authority or relax batch rules.

## Privacy and UX

No new public status, player-supplied identity or accounting capacity exposure. A denied caller receives the existing fixed `ADMISSION_DISABLED`/stopped reason and the base outcome-contract fallback. Campaign diagnostics expose only that campaign's request/attempt facts; they must not disclose another campaign's stop source, attempt IDs, spend, prompts or allowance. The trusted operator CLI remains the administrative surface for clearance.

## Required B2 verification and acceptance

- Two approvals on the same account and model: overrun/discrepancy on one denies the sibling, including a fresh process and next UTC day.
- The original approval remains blocked for another provider/model; an unrelated approval's genuinely different verified route remains eligible when its ceilings permit.
- Other accounts remain eligible; account identity remains operator-attested as in the base design.
- Existing pre-B2 stop rows receive the wider match without rewriting; a single authorized clearance removes both restrictions. Clearing an unrelated stop has no effect.
- Missing/mismatched source attempt fails closed. Unknown model/usage stops retain their prior scopes.
- Two accepted aliases for the same canonical model are blocked together; absent/unverified catalog mappings dispatch nothing and reveal no Secret.
- Concurrent overrun settlement and sibling admission serialize on the stable account lock; no deadlock; admission started after committed stop is denied. No shared/exclusive upgrade.
- Client/diagnostic fallback reveals no other campaign details; no duplicate ledger or mutable stop history.
- Full offline validation and fresh independent Sol/Opus xhigh acceptance cover the affected accepted-A accounting boundary together with B2 integration.

## Exclusions and remaining decisions

No paid call, verified catalog content, provider/model choice for live play, new session class, authentication/deployment, image service, Stage 310/320, or extra caller deadline is approved here. Base design invariants and B1/B2/C checkpoint gates remain. If either architect finds this canonical-identity or stop interpretation insufficient, return required changes on this artifact; do not implement an alternative silently.

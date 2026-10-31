# Stage430 — Protected revision editing

Authority:accepted ADR0038 and delegated continuation. Base:`b8ea7bb`.
Scope:`work-orders/STAGE_430.md`.

## Stable editing and locks

Owner editing remains inside the mounted Scenario boundary; selected-character
preview unmounts it completely. Build typed structured controls for every package
field, including arrays, references, unions and statistics. Existing object keys
and canonical IDs are immutable in the form; new objects receive fresh local keys.
Removed aliases stay reserved by the existing server identity registry. Manual
schema-valid but incomplete/invalid content can still be saved for correction,
with ordinary compiler findings and activation blocked as before.

Server target catalogs address keyed objects through stable IDs/keys, never a name,
display alias or array index. Unkeyed arrays are whole-section targets. Duplicate
keys make object targeting ambiguous: reject it and offer whole-section repair.
Locks store exact content projections, or exact image slot/candidate/hash/reference/
source-signature/state, in immutable monotonic snapshots with nonce/CAS. Empty is
a real version, not a reset. Renames/deletion never implicitly remove a lock.

All package writers meet one shared guard before identity inserts. It checks the
expected lock snapshot, protected content and the prospective inherited visual
manifest0. Image selection also guards locked dependent figures/maps. Relevant
source edits cannot silently stale locked art; explain the conflict and require an
explicit unlock or a narrower change. The memory implementation has equivalent
atomic semantics for tests. Historical390 fingerprints remain readable: separate
policy/write receipts bind new lock/adoption/restore intent without rewriting old
fingerprints or stored rows. Replay precedes current CAS and guards.

## Selective preparation

Resolve targets and the directed incoming structural dependency closure on the
server. Keep reasons for every expansion. Outgoing references provide context, not
permission to rewrite their targets. Locked dependencies remain read-only; directly
requesting locked content is a conflict. Structural references are evidence of
dependency; shared words/names or possible plot effects are not proof. The owner
can explicitly select additional objects/sections when a semantic change needs it.

Extend real generation jobs with immutable mode GENERATE/EDIT, captured lock
version and edit specification. Legacy defaults to GENERATE. The real0018 workshop
session/grant/accounting path is reused, with mode/stage binding. Do not add edit
to the seven generation stages. Separate mode-qualified scheduling/claim/control
prevents an EDIT from entering the concept pipeline or automatic finalizer.

EDIT ordinal0 persists the exact owner-authorized baseline, instruction, resolved
scope/locks/manifest, prompt/schema, trace and provider/model. The provider proposes
a full strict package; validators compare it with the baseline and reject changes
or order changes outside closure and any locked mutation. It cannot widen its own
scope. The existing technical input/output bounds and bounded repair remain. A
large or unsupported edit fails explicitly, without truncation, hidden model switch
or a local-generated substitute. No live calls occur in this stage's verification.

Successful preparation stores an immutable candidate and closes the job without
appending a revision. Unknown dispatch cannot resend; stored outputs survive lost
ACK. Cancellation/revocation fences late results. GENERATE still uses its existing
seven stages, but shared guards prevent it bypassing newly installed locks.

## Review, adoption and restore

Owner review returns complete structured changes and both source/candidate content,
compiler assessment, lock conflicts and prospective image consequences. A review
digest binds candidate, current baseline/head, lock snapshot and visual manifest.
Nothing is accepted from an untrusted HTTP AI-source/content assertion: adoption
loads the stored server candidate and creates trusted provenance.

Explicit adoption runs under the owned draft lock, verifies the current owner
session, nonce replay, reviewed digest and all CAS, revalidates candidate and shared
guards, then appends and stores the adoption receipt atomically. A changed head is
never silently rebased. Changed locks/manifest require a fresh review; conflicts
remain visible and the candidate is retained. Terminal jobs are immutable, so
adoption never updates their attached_revision.

History comparison loads only explicitly selected owner revisions. Restore first
shows its full diff against current head, then appends historical content as a new
revision with preserved server identities and an immutable operation receipt.
Neither adoption nor restore calls AI or changes a historical row. Every newly
saved revision receives the420 atomic manifest0 and invalidates later confirmation.

## Verification and recovery

Test lock/unlock and head/manifest changes during preparation/review, locked source
and derived-reference replacement, outside-scope reordering/deletion, duplicate-key
ambiguity, hostile provenance, cross-owner IDs, nonce reuse/lost COMMIT, restore
against locks and legacy replay. Prove EDIT uses real prep accounting, never the
seven-stage scheduler/autoappend, and creates no canonical events. Browser tests
cover complete structured editing, linked comparison/adoption, explicit locks,
reload/failure/late replies, language/focus and four-width layout/axe. Full isolated
offline validation precedes the technical report and continuation.

Migration0021 adds revision controls and mode-aware jobs. Once used, recovery
requires a430-aware application/operator build; older workers could process EDIT
incorrectly or skip locks. Preserve external-cost accounting on a matching restore.

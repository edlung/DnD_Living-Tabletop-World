# Stage420 — Scoped visual preview and private draft images

Authority:accepted ADR0038 and the owner's delegated390–450 continuation.
Base:`c07ab00`; scope:`work-orders/STAGE_420.md`.

## Projection boundary

Materialize a stored immutable revision with the ordinary compiler/World Engine in
local memory. Never inject the production event store. An optional pure prepared-
party context supplies only validated prepared character IDs to trusted owner
projection. Existing player resolution ignores it; campaign membership, command
authority and roster remain unchanged. Party knowledge/identities/HP and visual
perceivers use the same context. Include it in any perspective memo key.

Use ordinary knowledge, scene, presentation and character-sheet projections and
whitelist the resulting DTO. Owner mode can inspect all prepared content. Selected-
character mode returns no package/local keys, scenario graph, owner diagnostics,
candidate/job/lineage metadata, alternative character directory or future encounter
names/IDs. Its visual digest describes only its permitted chosen subset. Unknown
and inaccessible resources have the same404. Names of merely perceived unidentified
objects remain null. A known remote camera view stays unobserved, with no invented
presence/weather/state/map; camera navigation never places the holder there.

Prepared encounter branches are owner-only. Fork initial history in memory and
validate placement/combat through ordinary decisions, then project a static
battlefield/combatant layout. Omit initiative, round, current/order and reactions.
Narrow the reusable Board input while preserving live EncounterView compatibility.

The browser mounts an independent restricted branch for character mode, clears
owner title/history/forms and remounts image consumers. Release object URLs and
abort requests on scope/session changes. Returning to owner mode loads fresh owner
controls. Scenario links first leave the restricted branch.

## Image identity and persistence

Use separate draft jobs/dispatches/candidates/contents/manifests, not the canonical
asset worker. Every query includes owner/draft. Jobs retain source revision/digest,
canonical subject identity, permitted normalized visual input, reference hashes,
template version, provider/model, exact request digest, preallocated charge ID and
originating live workshop session. Lease/fence uses database time. Control fields
alone can change; inputs, dispatch marker, result, bytes and manifest revisions
remain immutable.

Image input uses visual appearance/style and an explicit note; never automatically
send narrative entity description, name/key or knowledge to the provider. A
conservative source signature can include description/identity and relevant map
geometry to detect staleness without sending those fields. Figure/battle-map jobs
require the exact chosen portrait/location raster reference. Changing a reference
invalidates incompatible derived selections.

Reserve in the existing image ledger under a genuine workshop subject and explicit
UNLIMITED installation policy. Build/validate request and headers, then await a
durable beforeDispatch gate inside the adapter immediately before fetch. Verify
job/session/fence/provider/model/request digest, commit marker, recheck abort and
dispatch once. Pre-transport refusal settles not-sent when provable. A lost result
after possible dispatch is DISPATCH_UNKNOWN and cannot automatically resend.
Reservations/unknown holds and late billing settlements remain even after job
cancellation/revocation. A stored result is reused after lost acknowledgement.

Bytes and candidate attach atomically, without selection. Selection uses explicit
owner nonce and CAS over package revision/digest and manifest version. Immutable
manifest version0 is created in the shared package-append transaction, covering
manual and generated revisions. It freezes compatible selections at creation.
Changing an older revision's selections never changes an existing descendant.
Missing historical manifests initialize EMPTY version0 under the draft lock; no
parent lookup occurs on that recovery path. EMPTY never means text-only consent.

## Image visibility and later adoption

Owner candidate thumbnails require current workshop authorization. Character byte
reads require membership of the hash in the current selected, compatible manifest
and an ordinary permitted entity presentation. A hash alone grants no access.
Overlay only whitelisted PlayerAssetView fields on permitted presentations, with
no hidden candidate versions, provenance or local keys. Stale/unselected/missing
art uses the neutral fallback; no eager hidden-byte preloads.

Keep exact encoded bytes/hash and draft lineage so440 can copy them unchanged into
canonical asset storage and bootstrap selected approvals. No re-encoding, provider
call or canonical asset event occurs during420 preview/selection. A later explicit
text-only activation remains possible and is never inferred from missing art.

## Verification and recovery

Exercise real HTTP and PostgreSQL ports with injected provider transport: valid
and absent routes/policies, owner/session separation, permitted prompt fields,
request drift, lease takeover, revocation/cancellation, lost dispatch/result ACK,
candidate selection races, inherited/stale manifests and exact-byte authorization.
Assert no real event stream, roster/history/time change. Browser checks cover
owner→character→owner, delayed responses, no hidden names/bytes/DOM/cache, image
choice/ref change, bilingual keyboard/axe/layout at four widths. Full offline
validation and own adversarial pass precede the technical report.

Migrations0019/0020 add real draft-image subjects. After their use, keep a matching
aware recovery build; an older consistent restore requires external-cost
reconciliation. No claim of older-binary compatibility or deployment is made.

# Stage440 — Confirmed activation and isolated publication

Authority:accepted ADR0038/Stage370§10 and delegated continuation. Base:`689967c`.
Scope:`work-orders/STAGE_440.md`. Architecture invariants1–3,5,11–18 remain intact.

## Reviewed owner intent

Activation uses the latest stored revision. Historical content must first be
restored as a new revision. Recompute full390 readiness, including discarded
prepared-encounter validation, and the pure bootstrap plan. READY is required;
errors/incompleteness cannot be acknowledged away. Stable server finding IDs bind
severity/code/path/message; all warnings require exact acknowledgement.

The server forms a versioned plan envelope from the stored revision/identities,
ordered initial operations, prepared-party IDs, rewritten quest definitions and
selected asset descriptors. Hashes exclude new activation/campaign IDs, timestamps,
event UUIDs and leases. Review binds package, plan, scenario/quest content, current
lock snapshot, visual manifest and text-only policy. The HTTP start body contains
only nonce/digests/CAS/acknowledgements; it never accepts a package, operations,
owner actor, canonical IDs or asset provenance from the browser.

With pictures, every selected entry must be CURRENT and every derived reference
must match. At least one current choice is needed; otherwise explicit text-only
activation is required. Unselected pictures remain neutral fallback and are
disclosed in an acknowledged warning. Selected stale art blocks picture activation
until replaced/removed or explicit text-only is chosen. Text-only copies no pictures,
even when draft choices exist. Draft locks/selections themselves are unchanged.

The acceptance transaction serializes on the owned draft, authenticates the current
owner session, rechecks head/package/lock/manifest/review and warning acknowledgements,
and reserves stable activation/campaign/bootstrap-command IDs. Accepted nonce replay
precedes current-head guards; different intent reusing a nonce fails. One draft has
one activation. Later requests cannot create a second campaign from it.

Acceptance is a durable explicit USER intent. Closing the tab or ending a session
does not reverse an accepted initialization. Background recovery may finish that
same frozen operation; it cannot confirm a new source. All new owner reads/retries/
entry requests require current workshop authorization. Subsequent draft edits do
not rebase the accepted operation and cannot rewrite played state. The UI displays
the original confirmed revision while provisioning and after publication.

## Pure atomic bootstrap

`BootstrapCampaign` carries stored content/identities, source digests and activation
identity, selected asset proofs, visual policy and exact confirmation. The trusted
submission actor must be `user` and equal the confirming owner. System/AI actors
are rejected even with a forged confirmation literal. Consent is a dedicated
engine gate; do not reuse ApplyAuthoring's12-operation limit or broaden its scope.

Reuse the pure campaign compiler. Apply only its supported initial commands to
provisional state and discard the entire decision on any failure. Keep
`CampaignCreated` first, ordinary initial events next, then canonical prepared
party, asset adoption/approval and final bootstrap provenance. Every event has one
USER command causation. No production loop of engine.execute calls, started combat,
fake discoveries, memories, Chronicle, played quest progress or fixture commands.
Technical content/operation/event/asset limits are explicit and separate from money.

The existing EventStore appends the one command and full batch atomically. Stable
command ID/fingerprint handles duplicate execution and lost COMMIT acknowledgement.
Replay/re-decision requires no provider, database or bytes I/O. Bootstrap is always
non-undoable, conservatively matching CreateCampaign; later ordinary safe undo stays.

Prepared party is separate from the character→controller roster. A membership
helper combines canonical prepared members and actual roster members for knowledge,
quest, investigation, memory, contradiction and Chronicle semantics. Controllers,
role checks, ownership of a character and stand-in permission still use actual
roster assignments only. Legacy state without prepared-party metadata keeps the
same roster-derived behavior. New initial members must be existing valid characters;
no player account or session is manufactured.

## Exact pictures and immutable campaign content

Before the initial append, copy chosen owner-qualified encoded bytes to the target
campaign content store, verify read-back hash, media type and byte equality, and
seal immutable scenario/rewritten-quest/visual lineage manifests. Never re-encode,
invoke a generator or require a still-enabled dispatch grant for stored material.

`AssetAdopted` honestly creates a candidate with draft/candidate/job/source-signature/
manifest proof and original provider/model. It creates no external request/job queue.
Existing owner approval decisions establish initial canonical choices in the same
batch. Adopt/approve raster references before derived figures/maps; new canonical
derivedFrom IDs and reference hashes must match. Asset integrity and approval
undo/restore preserve adoption origin. Player asset DTOs retain their whitelist.

The campaign's scenario and rewritten quest definitions are immutable content,
bound by bootstrap provenance and included with bytes/events/activation records in
backups. Quest progress stays the ordinary history projection. A per-campaign
resolver serves the new book; only untracked legacy campaigns use the existing
Ravenford book. Missing content for a bootstrapped campaign fails closed.

## Provisioning, publication and entry

The durable record has PROVISIONING/PUBLISHED status, bounded phases, fixed failure
codes, fencing/leases and retry scheduling. Immutable source stays separate from
mutable control. Content/bytes are prepared, bootstrap is executed/verified, then
publication and explicit ownership link become visible atomically. Recovery checks
actual stored command fingerprint, snapshot provenance, manifests and bytes; phase
labels alone are insufficient proof. A stream appended before a crash stays closed
until reconciliation verifies and publishes the same campaign ID.

Use a normal EventStore view which hides unpublished streams/commands and rejects
ordinary appends. Construct ordinary HTTP, auth/operator, workers, live app and
fingerprint mirror engines through that view. Only the narrowly injected bootstrap/
reconciler and raw readiness/replay tools can see provisioning streams. Unknown
activation rows mean legacy; do not permanently cache that absence as published.
Common invitation issuance also checks publication. The existing401→400→membership
404 order remains intact, without a pre-auth existence oracle.

Owned-campaign pages query only explicit PUBLISHED ownership records with bounded
paging. A separate owner entry action verifies ownership/canonical DM and issues a
fresh normal one-use invitation. Hash-only credential storage cannot recover a lost
plaintext link, so entry is separate from idempotent activation. `/join` clears the
fragment, waits for Take your seat and deliberately confirms game-cookie replacement.
Workshop activation/status never sets a game cookie. Delayed game401/sign-out
responses must not expire a newer cookie; sign-out binds mounted campaign/actor.

## Verification and continuation

Exercise real PG lifecycle with crash before/after content, append and publication;
lost ACK and concurrent starts/retries; stale head/locks/manifest/acknowledgements;
cross-owner IDs, revocation and closed ordinary routes/invitations/assets/SSE;
exact bytes/derived references, no queued generation or provider calls; full atomic
rejection, replay and safe later undo; per-campaign books and unchanged Ravenford.
Browser flows cover explicit activation, existing-game replacement, owner shelf,
player invitation and ordinary play. Run RU/EN, four-width layout/axe, full isolated
validation and own adversarial report. Migration0022 and new bootstrap/adoption
events require an aware recovery build; preserve a consistent protected restore.
After a local checkpoint continue450 without another technical approval.

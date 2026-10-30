# Stage 370 — AI campaign generation and preview

- Date: 2026-10-30.
- Status: **Proposed detailed contract; awaiting owner disposition.**
- Scope: design checkpoint of the owner's authorized Stages 370–450 program.
- Work order: `work-orders/STAGE_370.md`; architecture delta: ADR 0038.
- Example: `docs/design/campaign-generation/EXAMPLE.md`.

## 1. Owner requirements and acceptance boundary

The owner requested other campaigns, then specified that AI must generate them and
that the owner must be able to preview both their appearance and their scenario.
The owner subsequently removed AI monetary limits and authorized implementation
of all nine proposed stages. This contract develops that request into reviewable
implementation decisions; the session does not treat its own design as owner approval.

The delivered experience is:

`Brief → generated draft → scenario/visual previews → revisions → confirmation → playable campaign`.

The first acceptance specimen is a fully prepared first session and a connected
outline of later developments. This is an evaluation specimen, not a campaign-size
or spending limit. Larger campaigns retain the same staged-generation workflow.
Russian and English follow the existing campaign-language contract.

Success requires a genuinely different campaign that starts without Ravenford
entities, quest definitions, secret fixtures or hand-edited database rows. Its
characters, investigation, encounters, images and future play use the ordinary
world interface and existing supported rules. AI-invented mechanics are unsupported
content requiring a visible correction, not new executable rules.

## 2. Existing foundations and concrete gaps

| Reuse                                                       | Gap that must be implemented                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| World Engine, campaign streams, `CreateCampaign`            | No public creation path; complete initial content needs a confirmed, atomic bootstrap                                                     |
| Stored authoring revisions, previews and consent (ADR 0018) | Current authoring has 12-command proposals and intentionally narrow operations; a whole campaign cannot be smuggled through that endpoint |
| Knowledge scopes and perspective-aware projections          | A private draft needs equivalent player-preview isolation before a live campaign exists                                                   |
| Production invitation/cookie sessions (ADR 0036)            | Credentials currently open one existing campaign; authors need a separately authorized workshop identity                                  |
| AI gateway, request journal and accounting (ADR 0032)       | No campaign-preparation capability; paid preparation is currently local-only                                                              |
| Image port, worker, approval, lineage and content storage   | Draft pictures must exist before canonical entities; later activation must reuse the selected bytes                                       |
| Scene, objects, battlefield, full character sheets          | Need preview composition and navigation over an isolated materialization                                                                  |
| Quest projection over effective history (ADR 0025)          | Definitions are currently supplied by a server-level file; generated campaigns need their own versioned content                           |

Keep the modular monolith and existing workspace dependency directions. Contracts
remain serializable; domain logic remains pure; server modules own persistence,
providers, jobs and authentication; the web client calls only the server.

## 3. Ownership before a campaign exists

Introduce a workshop identity with an opaque owner ID, independent of any campaign
membership. For the closed installation, provision it through an operator-issued,
single-use workshop invitation. Reuse credential primitives and expiry/revocation
discipline; do not reinterpret a player or campaign-DM cookie as a workshop grant.

A workshop session reads only its own drafts/jobs/pictures and explicitly owned
campaign links. A campaign membership still opens exactly its own campaign. A
workshop owner becomes the DM of a new campaign only through confirmed activation.
Player invitations never grant workshop access. Existing campaign DM access does
not silently grant ownership of other campaigns.

Keep credential material out of URLs after redemption, logs, traces, storage and
error messages. Authorize image bytes, progress streams and version histories as
strictly as draft documents. Revocation closes workshop progress connections.
Keep existing origin, malformed-input and non-enumeration protections. The Stage
380 design must specify cookie separation and identity handover before coding.

## 4. Versioned campaign package

Separate an immutable revision's **content** from mutable job/provisioning state.
The server assigns IDs and records source revisions; names never serve as identity.
Document size and generation chunk sizes are technical bounds, not monetary limits.

| Part                | Required content and semantics                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brief               | Language, setting, tone, desired length, party size/level, themes to include/exclude, owner's free text                                                                          |
| World               | Title, description, start time, starting location, weather and valid location nesting/placements                                                                                 |
| Entities            | Locations, NPCs, factions, creatures, items, features; stable opaque identities, descriptions, placement and existence                                                           |
| Party               | Valid starting character sheets and party membership, or explicit unresolved slots that block activation until filled; controller accounts are assigned through real invitations |
| Truth and knowledge | Distinct world truth and DM notes; typed PUBLIC/PARTY/CHARACTER/NPC records, holders, subjects, temporal origin and disclosure policy                                            |
| Conflicts           | Actors, motivations, resources and current tensions; never a record that a future player choice occurred                                                                         |
| Scenario            | Entry hooks, situations, clues, alternative approaches, conditional developments and later-session outline; plan data available to the owner                                     |
| Encounters          | Supported catalog references, valid sheets, positions, terrain and start conditions; prepared fights are inactive at campaign start                                              |
| Quest definitions   | Versioned activation/milestone content using supported kinds; progress remains a projection of played history                                                                    |
| Visual brief        | Art direction and references per entity/purpose, candidate lineage, chosen content hash, source description revision and approval                                                |
| Provenance          | Owner edits, AI request/trace IDs, provider/model identity, input revision, validated output, timestamps, content/schema version and package digest                              |

Scenario prose is a plan. Lore marked as world truth becomes truth only after
confirmation and a validated World Engine command. Rumor/testimony remain those
types even when they disagree with truth. Future consequences cannot fabricate
memories, Chronicle chapters, discoveries, quest progress or player decisions.
Scenario/quest content has immutable per-campaign versions and is included in
backup/restore; mutable quest progress is never stored as truth.

The compiler produces a stable, ordered bootstrap plan from a complete revision.
It uses the same domain decisions and scoped projections as activation/preview.
Check reference/type/temporal/placement/rules validity and supported quest triggers.
Report findings by stable object/path and severity. Dangling references, invalid
sheets and impossible knowledge block. Narrative quality and suggested clue
redundancy are assessments; no validator claims to prove general story solvability.

## 5. Draft and job lifecycle

Draft lifecycle: `DRAFT → ACTIVATING → ACTIVE`; `ARCHIVED` closes an unused draft.
Readiness is computed per revision: `INCOMPLETE`, `INVALID`, `READY`. Generation
does not replace draft lifecycle: a partially generated revision stays inspectable.

Jobs have `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED` and an explicit
uncertain-dispatch outcome when a provider call may have happened. Each stores
owner/draft/base revision, stage, durable idempotency key, inputs, attempts and
result references. Acquire a lease/fencing token before work; an old worker cannot
write after takeover. Retry safely stored results without a second provider call.

Use compare-and-swap on revisions. Late generation stores an inspectable candidate
and never overwrites later owner edits. A cancelled or superseded job cannot attach
its output to the chosen revision. Persist completed steps so browser/server
restarts can resume. If dispatch outcome is uncertain, retain that fact and its
spend record; do not claim exactly-once execution against an external provider.

## 6. Generation and unlimited monetary policy

Sequence: concept → conflicts and topology → entities → scoped knowledge/clues →
encounters/party → first-session plan → later outline → validation. Persist each
validated result. Offer targeted correction for a failed stage; keep earlier work.
Use a `campaign-preparation` capability/session with durable workshop ownership;
never invent a play session merely to bypass the existing eligibility check.

Owner correction of 2026-10-30: **no monetary ceiling for text or image AI**.
Implement an explicit stored `UNLIMITED` policy in Stage 380, scoped to this
installation's authorized owner. Apply it to workshop and that owner's authorized
runtime calls. All former account/day/campaign/session monetary limits are
inapplicable in this policy. Preserve historical finite approvals and ledger rows.
Do not use zero, a huge fake number, missing records or a browser flag as infinity.

Preserve actual/unknown charges, dispatch evidence, reservations, settlement,
provenance and operator diagnostics. Missing/unknown usage must not fabricate a
price. Operational timeouts, concurrency, bounded retries, request size, provider
allowlists, explicit cancellation and authenticated dispatch remain in force.
Exhausting an old monetary bucket is not a refusal in unlimited mode; genuine
provider failure or unavailable infrastructure remains a visible failure.

Text and image generation use the existing approved adapters where possible.
No model/provider switch is implied. Tests inject providers and cannot spend.
Each live test records actual cost and quality; unused/unconfigured remote AI must
show an honest unavailable state rather than label canned output AI-generated.

## 7. Scenario preview

An owner-only overview and linked outline show the brief, opening situation,
locations, cast and motivations, secrets, clue access, possible developments and
first-session notes. Selecting a person/place/clue opens its structured content and
where it is referenced. Trace explanatory prose back to package objects.

Label truth, testimony, rumor, hypothesis and proposed development consistently.
Separate what the party starts knowing from what it can discover, how, and from
whom. Show who knows a secret and who is willing to tell it. Problems link to the
affected object and offer explicit edits; an AI assessment is not a rules verdict.

The owner can inspect all authorized material without losing it in a compressed
summary. The player's preview never returns this owner overview or secret graph.

## 8. Visual preview

Materialize the selected revision into an isolated, noncanonical world using the
compiler and ordinary domain decisions. No preview writes to the live event store,
creates invitations, advances played time or emits live campaign changes. Navigation
selects locations/viewpoints without manufacturing travel or observation history.

Reuse scene/object/battlefield rendering over scoped server projections. Provide
owner and selected-character views. A requested perspective is checked on the
server; player mode receives only what that character starts knowing/perceiving.
Do not download an owner package into the browser and hide secrets with CSS.
Do not preload inaccessible picture bytes, metadata, names, IDs or maps.

Draft image jobs operate on draft-scoped visual subjects. A picture is a candidate
until the owner chooses it; player preview uses chosen images only. Art briefs
include only permitted appearance and style information, never unrelated secrets.
Keep portrait/figure/location/map identity and derivation consistent with ADR 0035.

Include source revision and chosen content hash in a visual manifest. A relevant
description/style/identity edit marks affected images stale. Preserve approved
unaffected images and stored bytes; regeneration is an explicit request. Missing,
failed and stale pictures have truthful statuses and the existing neutral fallback.
The owner can choose text-only activation explicitly; ungenerated/unapproved art
must never be represented as complete. Both preview modes link the same object.

## 9. Editing and selective regeneration

Support manual changes, AI edit instructions, object/section selection, locks,
revision comparison and restore-as-new-revision. A lock covers selected content,
not a name string. Request the smallest dependency closure required by an edit.

For example, changing a culprit's motivation may affect clues, testimony and the
opening; show all resulting changes before accepting them. Conflicting locks
produce an explanation and a proposed resolution. No lock is silently dropped.
Confirming a candidate appends a revision; new content invalidates the old package
confirmation and readiness assessment. Reusing a stable object retains its ID.
Deleting it invalidates dependent references and blocks activation until resolved.

## 10. Activation and the exact reviewed result

Activation is a deliberate owner action over a server-stored revision, compiled
plan digest, selected visual-manifest digest and acknowledged findings. Recompute
validation/authority at activation. An edit or new visual selection invalidates
the prior confirmation; a stale request returns a conflict.

Introduce a dedicated, bounded campaign-bootstrap World Engine command whose
pure decision applies supported initial operations against provisional state and
returns the complete initial event batch, including provenance, for one atomic
append. It establishes the confirming owner as DM. The system/AI cannot confirm
for the owner. Do not expand ordinary in-play authoring into unrestricted global
mutation or replay fixture commands as trusted production initialization.

Prepare draft images/content manifests and immutable quest/scenario content before
the append. Use one idempotent activation record per draft with a stable target
campaign ID. An unpublished provisioning state keeps every live route, invitation,
asset read and progress channel closed until required manifests and the append
are durably consistent. A crash resumes the same operation and campaign ID.
Reconciliation handles an appended stream whose publication step did not finish;
no paid generation occurs as a side effect of retrying activation.

Adopt the exact chosen image bytes by hash with recorded draft→canonical lineage
and approval. Publish only after checks, then issue the normal campaign sign-in
transition for the owner. Display other campaigns only through explicit workshop
ownership links. A live campaign and an old draft diverge after activation:
editing a draft cannot rewrite played history. Later changes use ordinary,
separately confirmed in-play authoring. Undo/replay semantics for the new bootstrap
must be decided and tested in Stage 440; its initial policy is no bulk undo after
play, preserving all events and existing safe per-command undo behavior.

## 11. Delivery stages and measurable checkpoints

| Stage | Deliverable                                                                         | Acceptance evidence                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 370   | This contract, example, ADR proposal, roadmap and ledgers                           | Requirement/invariant adversarial pass; owner disposition before detailed-contract adoption                                                                               |
| 380   | Workshop identity/invitations, authorization and explicit unlimited monetary policy | HTTP/cookie/stream revocation and cross-owner tests; text/image admission above every former monetary ceiling; historical accounting still readable                       |
| 390   | Strict package schemas, immutable revisions, compiler and campaign-specific content | Non-Ravenford package compiles; malformed/unsupported/cross-scope references fail; revision races/restart tests; no live mutations                                        |
| 400   | Durable generation pipeline and preparation capability                              | Stubbed multi-step journey, restart/cancel/lease takeover/stale-output/uncertain-dispatch tests; explicitly authorized live sample and quality report                     |
| 410   | Scenario overview and linked cast/clue/conflict inspection                          | Owner follows opening→clue→holder→truth, edits findings; player/outsider cannot read it; Russian/English and responsive journeys                                          |
| 420   | Draft pictures and world/character preview                                          | Chosen images and same-revision scenes/maps; hidden secrets/bytes absent from player responses/DOM; preview leaves real streams and histories untouched                   |
| 430   | Manual edits, locks, targeted AI regeneration and revision comparison               | Keep NPC/image locks while changing a location; dependency conflicts visible; concurrent output cannot overwrite edits; confirmation becomes stale                        |
| 440   | Atomic confirmed bootstrap, picture adoption, owned-campaign list and entry         | Same revision/hash launches; crash/retry converges to one campaign; no partial publication; replay/restore includes scenario/quests/assets; existing Ravenford unaffected |
| 450   | Integrated verification and owner acceptance                                        | Investigation, social and combat specimens; full create→preview→edit→activate→play; adversarial accounting/auth/knowledge/race pass and owner play disposition            |

Each stage has its own scoped work order, detailed design where needed, verification
and handoff. Authorization for the program does not supply a missing checkpoint
disposition. The session stops at formal checkpoints under `AGENT_WORKFLOW.md`.
Existing Stage 360 human playtests and the no-v0.1-tag condition are unaffected.

## 12. Verification and migration obligations

Test both permitted content and absence of forbidden content at HTTP, bytes,
progress, DOM, cache, logging and provider-context boundaries. Preserve prior
Gate 01–06 regressions. Validate compiler/preview/activation parity, cross-owner
and cross-campaign attacks, malformed scopes, stale digests, hostile brief text,
oversized graphs, duplicate requests, cancellation races and restart recovery.

Keep provider tests offline with the repository's fetch trap. Measure live quality
separately from schema validity; an approved provider returning text is not proof
of a playable campaign. Record cost and latency without imposing monetary caps.
Use layout/accessibility checks on introduced screens, including long Russian
names, missing art, narrow viewports and keyboard navigation.

Add additive database migrations with old-reader compatibility or an explicit
rollback bound. Preserve old campaign streams and finite spending evidence. New
event types require schemas, versions, evolve/footprints/replay/undo coverage and
earlier-writer compatibility per kernel instructions. Backups include workshop
drafts, jobs, ownership, package/content manifests, assets and activation records.

## 13. Decisions requiring this checkpoint's owner disposition

The requested features, program authorization and unlimited monetary policy came
from the owner. The following are proposed implementation choices to review here:
operator-invited workshop identity; first-session acceptance specimen; immutable
package/scenario model; scoped read-only visual preview; lock/diff revision flow;
dedicated atomic bootstrap; explicit text-only activation; initial bulk-undo policy.
No assertion in this document claims those detailed choices are already approved
or that any Stage 380–450 runtime behavior has been implemented.

# Stage 310 design — draft 1

Date: 2026-10-11. Source baseline: `bc6c116`. Status: DRAFT, NOT APPROVED FOR IMPLEMENTATION.
Scope: `work-orders/OPUS_STAGE_310.md`. Stage 300 acceptance is a prerequisite.
Current model/review policy: `docs/PROJECT_WORKFLOW.md`.

## Owner decisions and contracts

The DM may skip the absent player's turn or act as that character (owner, 2026-10-11).
Every action retains the authenticated DM as issuer, records the controlled character and reason,
and obeys the same deterministic legality, reaction pause, idempotency, audit, replay and undo rules.
Presence does not grant authority or automatically decide that a player is absent. The DM explicitly
confirms the substitution; no client may impersonate another actor.

Hidden changes produce no observer-visible change notification, revision, timestamp, payload-size
change or event counter. Changing perspective must close the previous subscription before exposing
the new view; authorization never falls back to a broader perspective.

## A. Scoped change notifications and recovery

Use authenticated fetch streaming (SSE framing) rather than browser EventSource, so the bearer
credential remains in the Authorization header. No credential, global event position or global
world version in a URL, notification, browser storage or log. Follow existing HTTP check order.

The stream carries a fixed-schema invalidation message, never world content. A client re-reads its
own authorized projections. Subscription identity includes campaign, authenticated actor, effective
perspective and local generation. Reject or ignore messages from older generations. A local sequence
counts only permitted invalidations for that subscription and is not a canonical history position.

Compare deterministic, authorized view representations at a fixed cadence, not on raw canonical
event callbacks. Secret-only commits must not alter the representation or emission schedule.
The comparison must reuse existing projection/authorization rules; never hash raw WorldState,
history, hidden identifiers or unfiltered event metadata. Define an explicit coverage inventory
before implementation for session, surroundings, selected entity/context, character sheet, encounter
and reaction windows, knowledge, memory, quests, visual scene, Chronicle and DM-only authoring views.
AI-generated rankings/replies do not run during comparison. Query-dependent projections need
validated subscription interests or a documented coverage-preserving invalidation scheme; a
default/empty query snapshot is insufficient evidence that every visible change is covered.

Heartbeat cadence and shape are independent of commits. A load/comparison failure terminates the
stream safely; do not emit an invalidation based on an internal exception or silently continue with
unchecked authorization. Recheck authentication, membership and perspective on each cycle. Bound
subscription counts, interest sizes, buffers and work; never overlap comparison cycles. Cleanup on
disconnect and server shutdown. Explicitly test slow consumers and permissions revoked mid-stream.

On initial connection or reconnect, reload scoped projections after stream registration, closing
the subscribe/read race. Always reload after a missed connection rather than replaying a global
event cursor. Duplicates coalesce; out-of-order and stale generations cannot overwrite fresh state.
Use reconnect backoff with bounded jitter, cancel on leave/perspective change, and show connection
state. Keep background refresh from destroying drafts, focus or unsubmitted DM intent.

Presence is ephemeral transport metadata, not canonical truth. Expose only character identities
already available to the selected perspective; never another player's actor ID or a hidden roster
entry. DM substitution remains an explicit choice independent of presence. Define TTL, multi-tab
deduplication and filtering in the reviewed contract before implementation.

This design does not promise resource-level constant-time noninterference under shared server load;
tests must distinguish protocol non-disclosure from infrastructure timing assumptions.

## B. DM substitution

Add a bounded domain command envelope for an explicit DM proxy action, with target character and
reason. Preserve the DM issuer; do not change actor identity or temporarily rewrite campaign roster.
Restrict the allowed inner commands to character combat actions already implemented in the slice.
Skipping uses the existing EndTurn behavior for the current character, including next-turn effects;
it cannot bypass an open reaction window. Character control applies only after independent DM
authorization and target validation. A player cannot invoke it, including through nested commands.

Reuse the reviewed combat deciders for legality, dice, turn ownership, resources and reactions.
The atomic command boundary records the proxy provenance and resulting events together. Undo must
retain existing dependency blockers and deterministic replay. Define supported action/reaction
inventory explicitly; do not grant a generic authority bypass for arbitrary World Engine commands.

The DM UI selects the on-turn character and an explicit proxy action, states why it is being taken,
and shows the result and undo availability. Client visibility does not supply authorization.

## C. Persistent authoring history and day controls

Provide a paginated DM-only list of authoring commits. Canonical provenance determines committed
and undone status; proposal revisions supply descriptive working data only. Preserve campaign
isolation, fixed HTTP check order, revision locking and existing undo blockers. Derive the list
from durable canonical history plus durable proposal data, not screen-local state. Never return
it to a lower perspective even when the authenticated user is a DM viewing as a character.
Reload and perspective switching must clear privileged rows and preserve normal scoped data.

Make the day-advance control derive its label and next permitted action from current world time;
do not offer the already-completed Day 2 action. Keep time changes behind existing commands.

## Implementation checkpoints and evidence

1. Contracts/projection coverage, scoped transport, reconnect and isolation. Opus 5.5 high owns
   implementation because this changes isolation and recovery. Astra xhigh acceptance before step 2.
2. DM proxy domain commands, audit, replay/undo and permission regressions. Opus 5.5 high;
   Astra xhigh acceptance before step 3.
3. Persistent authoring list, day controls and multi-client UI. Assign Opus high where authorization
   or persistence changes; bounded presentation may use Sonnet 5.5 medium in a separate writer task.
   Full required validation and Astra xhigh checkpoint acceptance. Owner play acceptance pending.

Every checkpoint records exact source/artifact identity, tests, findings, fixes and residual risks.
Initial dual reviews must cover this same design revision; later critical-scope changes require fresh
review. No dependent implementation starts while a required prior checkpoint is unaccepted.

Required journeys: two browsers exchange combat turns; DM opens Counterspell and the player answers
without refresh; private authoring emits nothing to an unauthorized player; publication updates the
permitted view; reconnect converges; duplicate/out-of-order signals and stale perspective requests
are harmless; hidden creations/deletions and undo produce no private revision gaps. HTTP/domain
tests cover nonmembers, forbidden perspectives, revocation, proxy injection, concurrent actions,
idempotent retries, reaction pause, replay, undo blockers, cross-campaign authoring history and
durable reload. Finish with `pnpm validate` using no live provider calls.

## Open technical work before approval

- Specify complete projection-interest contract and stable normalization, with exact entry files.
- Specify proxy action envelope and atomic provenance event version/undo treatment.
- Specify presence identity filtering and authoring pagination contract.
- Confirm transport works with the existing dev proxy and planned deployment; no deployment now.
- Obtain Stage 300 acceptance and fresh Astra/Fable approval of the resulting exact design.

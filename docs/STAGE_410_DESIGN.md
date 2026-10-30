# Stage410 — Private scenario inspection and generation browser

Authority:accepted ADR0038, verified400 at`e176349`, and the owner's delegated
technical continuation. No canonical authority, provider or live-installation
configuration changes. This implements scenario inspection and basic corrections;
visual previews/images420 and selective AI revision/locks430 remain separate.

## Private editor and asynchronous lifecycle

The workshop shelf opens strict /workshop/drafts/:draftId routes. A common private
boundary owns session rechecks, expected-owner headers and client cancellation.
Pagehide synchronously removes the whole private subtree before history capture.
Owner replacement/revocation drops all editor data; stale transports cannot restore
it. Editor state holds metadata, revision summaries, source and selected tab.

Only the mounted Scenario tab loads a full package. A lightweight generation
progress endpoint returns original brief, job/step metadata and candidate digest.
Its PostgreSQL projection reads no full step input/prompt/output or candidate body;
metadata history also omits seeds. Full artifacts load only after deliberate
scenario/step/candidate inspection. Future character preview must keep this split.

409 triggers a session probe: same owner means a version conflict with input
preserved; a replaced/ended identity clears the private boundary. Unconfirmed
mutation answers retain exact nonce/base/content for retry. A successful correction
appends an immutable390revision, keeps object selection and restores focus.

## Generation and scenario navigation

The generation form covers intent, setting, tone, duration, party size/level and
include/exclude themes. Availability is the actual server result, with no fake AI
fallback. Job polling is bounded, serial and stopped on unmount/hidden tabs; every
server request reauthorizes access. Brief restoration does not overwrite fresh
input during polling. Failed retry selects its new child and reused earlier steps.
Cancelled/unknown jobs do not offer an unsupported retry. Unfinished step captions
reflect terminal status rather than claiming AI is still working.

Every saved step can be explicitly inspected as read-only partial preparation.
Completed proposals are explicit read-only sources; late proposals never replace
owner edits. A pipeline success is not narrative or compiler approval.

The scenario browser links opening, situations, cast/locations, motivations,
conflicts, clues, knowledge holders, disclosure, world truth, quests, prepared
encounters, visual briefs and session outlines. Shared-subject navigation never
claims a clue proves a statement. Facts/testimony/rumors/secrets and possible
future developments retain distinct labels. A field-by-field inspector reaches
nested sheets, statistics, scopes/relations, battlefield, quest triggers and all
outline notes. Local design keys stay internal. Invalid duplicate rows remain
individually reachable and editable; colliding names are disambiguated within a
group. Findings link to the nearest affected object with human explanations.

Basic scalar corrections preserve keys/reference structure and use existing390CAS.
Full structural editing, locks, selective regeneration, diffs and adoption belong
to430. A candidate or partial result cannot save as an owner revision through this
read-only inspector. A correction's uncertain answer retries the same snapshot.

## Language, layout and verification

The draft's language controls editor text, document language and title, including
sign-out dialog transitions. The landing shelf retains its browser language and
prior appearance. The draft shell is compact; actual desktop scenario content
starts around498px rather than below the first screen. Phone selections scroll
to their inspector. Tab arrows, deliberate-open focus, close/save focus, text
wrapping and320px layouts use existing visual tokens and controls.

Offline test-only fixtures provide complete Russian/English independent Bell
packages, scripted generation/failure/cancel and separate invitation identities.
Production imports no fixture. Browser tests cover linked reading, basic edits,
reload, unknown answers, CAS, reuse, partial proposals, access isolation,
revocation, stale replies and synchronous history privacy. Axe and measurable
layout checks cover opening/inspector/correction/form/completed-job/partial-step at
1440/768/390/320, with full and viewport screenshot inspection. There is one theme.

No live provider quality, paid generation, user play acceptance, default DB
migration, real credential change, deployment or publication is claimed here.
The0018accounting rollback bound from400 remains unchanged.

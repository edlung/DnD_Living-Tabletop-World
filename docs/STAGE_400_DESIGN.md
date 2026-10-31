# Stage 400 — Durable AI campaign preparation

Authority: accepted Stage 370/ADR 0038, Stage 390 technical verification and the
owner's delegated continuation of 2026-10-30. No provider/model, credentials,
canonical authority or product acceptance is changed by this stage.

## Seven structured steps

Concept, topology, cast/party, knowledge/clues, prepared encounters, first-session
situations/quests and later outline each own a strict output schema. Pure merges
preserve brief, language and all other sections. A seed is explicitly empty
preparation data, never a generated scenario. The provider prompt contains a
public supported-rules guide and a static named output schema. Only the user
payload carries the private brief/package. Embedded instructions cannot dispatch
commands, create accounts or add executable mechanics through this port.

Each validated step stores the complete resulting package separately from the
8 KiB diagnostic output excerpts. The compiler remains the readiness authority;
job SUCCEEDED means generation completed, not that a story is solvable or approved.
No deterministic local generator substitutes for a missing remote route.

## Durable jobs and canonical isolation

Migration 0017 stores immutable job identity, seed/base, exact prepared prompts,
dispatch markers, complete outputs and final candidates. Mutable control fields
hold state, next ordinal, lease and monotone fencing token. All operations are
owner/draft-qualified; scheduler discovery is a trusted internal scope inventory.
PostgreSQL calculates lease time. Shared session locks serialize worker decisions
against workshop revocation, and each mutation checks current session/fence/lease.

A durable dispatch marker commits before the provider is invoked. Lost dispatch
with no saved result is DISPATCH_UNKNOWN and cannot retry automatically. A stored
result survives a lost acknowledgement and is reused. Prepared-but-undispatched
inputs resume with their original trace/template. Every new input must match the
seed or previous completed result. Cancellation fences old workers and rejects
late output; already-dispatched possible charges remain in accounting.

Completed steps survive an explicit failed-job retry in a linked child job.
Unknown dispatch is never retried through that path. Finalization locks draft then
job and checks CAS, cancellation, session and fence in the same transaction as
revision append. A concurrent owner edit leaves a separate inspectable candidate.
It cannot replace the owner's revision. No pipeline operation receives a live
World Engine, creates membership or writes played world history.

## Real preparation sessions and accounting

Migration 0018 introduces explicit owner-to-approval grants and immutable real
preparation sessions bound to job, workshop auth session and fence. A workshop
subject has nullable campaign_id plus owner/draft identity; no fictitious campaign,
play session or evaluation run is created. Legacy campaign requests keep their
existing shape, eligibility, lock identities and accounting history.

Only campaign-preparation can use preparation sessions, and it cannot use play or
evaluation sessions. Each remote attempt rechecks durable eligibility, grant,
account/approval switches and explicit account UNLIMITED policy. Existing model,
billing, reservation, settlement, unknown-cost and stop checks remain. New subject
bucket keys coexist with unchanged legacy campaign locks. Operator spending
includes both subjects; campaign trace reads cannot retrieve workshop rows.

The preparation route defaults to unavailable and accepts one verified remote
provider. Configuration/key/approval/catalog alone does not grant workshop usage;
its owner needs the explicit preparation grant. The factory uses the same admitted
adapters, journal/finalizer bounds, one repair, caller cancellation and trusted
request settings. Preparation has its own LTW_AI_PREPARATION_TIMEOUT_MS bound
(default300,000 ms; range1,000–600,000), covering one repair within the same
whole-request deadline. Other capabilities retain their shorter timeouts.
It never changes credentials or selects a new model.

## HTTP and operation

Owner-only generation availability, enqueue, paged list, job/artifacts/candidate,
cancel, failed-job retry and trace reads use the independent workshop cookie and
expected-owner header. Responses whitelist public DTO fields, never sessions,
fences or worker IDs. Every poll reauthorizes durable access. Origin checks and
per-owner operational request limits remain. No progress stream is introduced.

The worker processes bounded discovered scopes, renews its lease and honors
cancellation. Shutdown aborts and waits for active work before closing accounting
and database pools. Runtime composition is invitation-mode only.

The operator explicitly enables `preparation-grant` for a workshop owner and
selected stored approval, alongside the explicit unlimited policy. Configuration
adds the same verified model to `campaign-preparation` in LTW_AI_ROUTES. Missing
setup is a visible unavailable state. No default development database or real
operator/credential row is changed by implementation tests.

## Evidence boundary

Offline tests use injected transports and explicitly scripted test fixtures;
production imports no specimen. They cover all seven steps, fault/restart/cancel,
lease takeover, lost acknowledgements, stale candidates, owner isolation and cost
accounting. Live-provider quality/cost must be recorded separately when an
explicitly eligible configured installation is available; offline validity never
claims live quality or human play acceptance. Carry unperformed live evidence to
the integrated Stage 450 obligation without fabricating a successful sample.

## Rollback bound

Migration0018 keeps old rows but adds workshop accounting shapes an earlier build
does not understand. Once preparation requests/attempts exist, application and
operator rollback below Stage400 is unsupported against that database, including
`--allow-newer-database`. Keep an0018-aware build for accounting recovery. A full
older-version restore needs a consistent matching backup and separate provider
cost reconciliation for work after that backup; never erase uncertain charges
or assume restored history proves an external request did not happen. No down
migration rewrites append-only accounting. This stage adds no canonical event type.

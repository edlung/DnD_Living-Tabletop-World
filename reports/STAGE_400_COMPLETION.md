# Stage400 — Durable AI campaign generation

Date:2026-10-30. Status:**TECHNICALLY_VERIFIED / CONTINUING_BY_OWNER_DIRECTION**.
Base:`7d0ba7e`; branch:`codex/stage-400-campaign-generation`.
Authority:accepted ADR0038 and
`reviews/OWNER_CAMPAIGN_CONTINUATION_2026-10-30.json`.
Scope:`work-orders/STAGE_400.md`; details:`docs/STAGE_400_DESIGN.md`.

## Result

Seven schema-validated AI steps now create campaign content through the existing
admitted provider: concept, topology, cast/party, knowledge/clues, encounters,
first-session situations/quests, and connected later outline. Pure merges preserve
brief/language and other sections. Full outputs and exact inputs are durable.
A job success is distinct from compiler readiness and narrative quality.

PostgreSQL jobs use nonce replay, leases/fencing, live workshop-session checks,
immutable steps/results/candidates and an atomic final revision attachment. Late
results cannot overwrite owner edits. Failed-job retry reuses completed steps;
unknown dispatch cannot retry. Saved outputs survive lost acknowledgements.
Cancellation fences late workers; uncertain possible charges remain accounted.

Preparation has a real workshop subject/session, nullable campaign ID, explicit
owner-to-approval grant and UNLIMITED account policy. It cannot borrow play/eval
eligibility. Existing model identity, unknown billing, stop, reservation,
settlement and finalizer rules remain. Legacy campaign locks stay identical.
The preparation route defaults to unavailable, with no local-generated substitute.
Its separate timeout defaults to300,000ms and remains bounded.

Owner-only APIs expose availability, enqueue, paged history, artifacts/candidate,
cancel, explicit retry and scoped traces. Every poll reauthorizes access. Internal
session/fence/worker fields are whitelisted out. Origin and operational request
limits remain. Production main wires the worker only beside invitation-mode auth.

## Changed files and rollout

Main boundaries: `packages/contracts/src/campaign/generation*.ts`, pure domain
merges; `packages/ai/src/preparation.ts` and shared lifecycle; server
`workshop/generation/`, `ai/preparation-{gateway,journal}.ts`, accounting subject,
preparation session and operator modules; migrations0017/0018; config/main,
README/.env.example, context/instructions and focused tests. The package manifest
lists every changed file.

Operator setup uses explicit monetary-policy and preparation-grant commands plus
the same verified model in campaign-preparation routing. No real operator grant,
credential/provider/model, default development DB, production dependency or
installation was changed. No paid provider call occurred.

Migration0018 introduces an explicit rollback bound: after workshop accounting
exists, older application/operator builds are unsupported against that DB even
with allow-newer-database. Keep an0018-aware build for recovery; an older consistent
backup restore requires provider-cost reconciliation. No historical row is erased
and no canonical event type was added.

## Verification and own adversarial pass

Full isolated `pnpm validate`: **PASS, exit0;3,100unit/321files,
284integration/47files,144Chromium journeys**. Format, lint, types, context budget
(1,194active files; zero over target), build, migrations and seed passed. The
throwaway database was dropped. The initial run stopped on two main-composition
lint errors; both were fixed before the successful full rerun. Original evidence
is preserved separately.

Focused tests also passed:19PostgreSQL generation/revision regressions;
16root contract/worker/HTTP cases;135AI configuration/gateway/operator unit cases;
119accounting/journal/preparation integration cases;72pure lifecycle/deadline
cases. These overlapping subsets are evidence, not additional totals.

The integrated seven-step test uses the actual PostgreSQL repository, worker,
admitted preparation gateway and injected Anthropic transport. It produces the
non-Ravenford READY revision, seven NULL-campaign requests/attempts, linked
artifacts/traces, zero live streams and zero additional calls on worker replay.

The adversarial pass covered forged ownership/session/provider fields, foreign
jobs/cursors/traces, revoked/expired auth and grants, finite policy, class/capability
mixing, route absence, input chaining, stale CAS, lease takeover, prepared-input
restart, cancellation-versus-finalization, stored-result replay, lost dispatch,
unknown COMMIT acknowledgement, unsupported output/one repair, caller timeout,
late output and private DTO/log boundaries. Large valid briefs bypass the generic
64KiB body default while keeping a technical size bound.

Fixed findings: restart initially allocated a new trace for an existing prepared
input; lost result acknowledgement initially marked a reusable result uncertain;
pre-transport cancellation initially claimed unknown dispatch; shared finalizer
UUID/text parameter typing initially broke trace persistence. Each regression was
retested, including earlier campaign journal cases. No unresolved invariant issue.

## Outstanding evidence and continuation

**Live provider sample, actual paid cost/latency and live narrative quality:
NOT_RUN.** Offline/scripted output is never called live AI evidence. Carry this
obligation to450 with the configured-installation/operator authorization boundary.
No owner human acceptance is claimed. Scenario/visual browser inspection,
selective revision and activation remain410–440. Their future boundaries are not
passed by these tests. The existing Vite large-chunk warning remains.

Under the owner's delegated technical-checkpoint instruction, continue to410.
The selected session model used same-model implementation helpers, with no
separate reviewer or approval role.

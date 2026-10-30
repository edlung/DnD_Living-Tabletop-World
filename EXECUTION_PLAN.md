# Living Tabletop World --- Execution Plan v0.3

> Current workflow: `docs/PROJECT_WORKFLOW.md` and `AGENT_WORKFLOW.md` supersede
> the historical model/role assignments below. The owner's 2026-10-30 AI-campaign
> request adds Stages 370–450; detailed design/checkpoint status is tracked there.

## Purpose

Turn the Ravenford vertical-slice specification into a gated engineering
program. Claude Opus 5.5 is the primary builder. GPT-6 Astra is an
independent adversarial reviewer at critical boundaries. Neither model
may silently redefine the product contract.

## Delivery Loop

Specification → Opus implementation → deterministic validation → Astra
review at defined gates → Opus remediation → retest → next stage.

Astra reports findings; it does not become the primary implementation
agent.

## Global Rules

-   `PRODUCT_BLUEPRINT.md`, `ARCHITECTURE.md`,
    `ARCHITECTURE_INVARIANTS.md`, and `RAVENFORD_SPEC.md` are
    authoritative.
-   Architecture invariants may change only through an explicit ADR
    approved by the project owner.
-   Each stage has a hard stop. Do not opportunistically implement later
    stages.
-   Prefer deterministic domain behavior before introducing AI.
-   AI cannot directly mutate canonical state.
-   AI may rank relevance; deterministic systems own legality and
    permissions where specified.
-   Every stage must leave the repository buildable, testable, and
    documented.

## Stages

Stage prerequisites are in `docs/IMPLEMENTATION_PREREQUISITES.md`; surface
introduction and recurring review obligations are in `docs/GATE_COVERAGE.md`.
Missing required checks cannot be reported as PASS. Every implementation
stage has one work order; Stage 190 is the independent Gate #5 review and
Stage 355 is the independent Gate #6 review.

### Stage 0 --- Repository Foundation

Repository structure, strict TypeScript/tooling, tests, migration
infrastructure, CI, module boundaries, structured logging, environment
validation, ADR workflow, context map, automated 700-line context-budget check,
and development docs. Use the complete checklist in `work-orders/OPUS_STAGE_000.md`.
No gameplay implementation.

**Gate:** install/restore, formatting, build, lint, typecheck, tests,
migration/bootstrap, context-budget validation, and CI pass.

### Stage 10 --- World Kernel

Campaign, World, WorldEntity, Location, Scene, WorldClock, WorldState,
commands, World Engine, domain events, projections. Seed only the
minimum Ravenford fixtures required for kernel tests. Before persistence/replay
implementation, settle the temporal/undo ADR required by
`docs/IMPLEMENTATION_PREREQUISITES.md`; implement only its kernel portion.

**Gate:** stable identity, deterministic replay, event ordering,
invalid-command rejection, auditability.

### Stage 20 --- Knowledge Boundary

Typed claims/evidence, knowledge scopes, perspective-aware projections,
and Ashen Circle secret fixtures.

**Astra Gate #1:** attack direct/indirect secret extraction through current
knowledge queries/projections, scoped NPC fixtures, related entities,
malformed/missing scopes, serialization, existing fallbacks/caches, and errors.
Memory retrieval and runtime NPC dialogue are future surfaces tracked in
`docs/GATE_COVERAGE.md`, with tests and independent review when introduced.

### Stage 30 --- Memory & Timeline

Session, Observation, Conversation, Discovery, Decision, Consequence,
WorldClock, temporal retrieval. NPCs cannot remember impossible events.
Add scope-leakage regressions for retrieval now; Gate #2 reviews the integrated path.

### Stage 40 --- Character & Rules Kernel

First obtain the ruleset/fixture ADR approval required by
`docs/IMPLEMENTATION_PREREQUISITES.md`; do not infer an edition or house rules.

Slice-required HP, AC, movement, skills, spell slots, conditions,
concentration, action/bonus/reaction; Investigation, Perception,
Longbow, Fireball, Counterspell, Healing Word, Misty Step.

**Gate:** deterministic legality tests for range, slots, reactions,
movement, concentration.

### Stage 50 --- Context Engine

Critical contextual projection (`/entities/:id/context` or equivalent):
visible state, available actions, legality, reasons, resolutions. Begin
with deterministic relevance heuristics.

### Stage 60 --- Investigation Vertical

Mira, Missing Caravan, caravan site, Broken Wagon Wheel, Goblin Weapon,
Strange Symbol, investigation, knowledge discovery, hypotheses.

### Stage 70 --- Contradiction Engine

Detect Mira/Thorne conflicting testimony without deciding who lies.

**Astra Gate #2:** attack fact/hypothesis separation, testimony
propagation, cross-NPC isolation, contradiction leakage, secret
inference.

### Stage 80 --- Combat Engine

Encounter, Combatant, Initiative, Turn, ActionEconomy, Target, Effect,
Battlefield; movement, range, cover, attack, damage, AoE, spells,
conditions.

### Stage 90 --- Reaction Engine

ReactionWindow is a first-class domain entity with eligibility, opening,
expiry, resolution, and traceability. Counterspell is mandatory. Implement
and test the declared temporal/undo policy for open reaction windows, including
explicit rejection of unsafe undo.

**Astra Gate #3:** double reaction, expiry, spent reaction, resolved
trigger, concurrency, undo/rewind with open window.

### Stage 100 --- AI Gateway

Provider abstraction, capability router, ContextBuilder, structured
output, AI trace. First use case: interpret DM natural language into a
proposed structured command. No mutation.

### Stage 110 --- AI Authoring

Proposal → schema/permission/applicable rules → continuity/lore → risk
classification → preview/confirmation → World Engine. Tomas Reed is the
acceptance case. Before enabling commit, implement the minimum validators
from `docs/IMPLEMENTATION_PREREQUISITES.md`, revalidate current state at commit,
and provide the safe authoring undo path. Unknown/destructive/invalid model
output is rejected atomically. Required checks cannot wait for Stage 120.

### Stage 120 --- Continuity Engine

Expand the Stage 110 validators across time, geography, identity, knowledge,
relationships, lore, and relevant economy/rules constraints. Add conflict
explanations and options; preserve the existing commit guards. Warn without
silently rewriting DM intent or bypassing protected invariants.

### Stage 130 --- NPC Intelligence

NPC dialogue/actions receive only scoped NPC context.

**Astra Gate #4:** jailbreak NPCs for DM truth, hidden context,
omniscience, other-NPC knowledge, and campaign secrets.

### Stage 140 --- AI Relevance

AI may rank already-computed available actions. Rules remain authority
on legality. Deterministic fallback is mandatory.

### Stage 150 --- Asset Identity

VisualIdentity, CanonicalReference, Asset, AssetVariant,
AssetGenerationRequest, entity linkage, versioning, lineage.

### Stage 160 --- World Visual State

Resolve presentation from canonical identity + time + weather/season +
events/damage + equipment/conditions + perspective. Demonstrate
Ravenford Day 1 vs Day 2.

### Stage 170 --- Chronicle

Select salient structured events and render Chronicle narrative with
source event IDs. Chronicle prose is not canonical state.

### Stage 180 --- Full Ravenford Integration

Automate the full scenario: arrival → investigation → DM authoring →
combat/Counterspell → return → time advance → Chronicle.

### Stage 190 --- Astra Gate #5 Full Red Team

Attack public/test surfaces without source modification: knowledge,
permissions, timeline, rules, races, ordering, rollback, NPC isolation,
hallucinated mutation, asset identity, world-history integrity. This is Gate #5;
use `handoffs/ASTRA_GATE_05_REQUEST.md` and `reviews/ASTRA_GATE_05_REPORT.md`.
There is no Opus implementation work order for Stage 190.

### Stage 200 --- UX Vertical Slice

Only after backend integration passes, replace debug UI with the real
experience using genuine Context, Knowledge, Combat, Reaction, Visual
State, and World Event contracts.

### Stage 210 --- World as Interface

Ravenford Market Square with minimal HUD and object-first contextual
interaction.

### Stage 220 --- Combat UX

Persistent battlefield + minimal anchor layer + ephemeral contextual UI;
spatial AoE and reactions; no mandatory permanent action bar.

### Stage 230 --- DM World Authoring UX

Natural-language intent → preview → change/accept/cancel → native world
entity.

### Stage 240 --- Product Validation

Uncoached usability test. Primary question: **Did the user interact with
the world or hunt through UI?**

### Stage 250 --- Vertical Slice Release

Release `Ravenford Vertical Slice v0.1` only after product,
architecture, adversarial, and usability gates pass.

A release candidate was prepared on 2026-10-05 and not released
(`reports/STAGE_250_RELEASE.md`). The release completes at Stage 360.

## Alpha Phase --- Stages 290--360 (added in v0.3)

Approved in outline by the project owner on 2026-10-05. The owner's
decisions and the questions still open are in
`docs/IMPLEMENTATION_PREREQUISITES.md` (Q4--Q11).

**Goal:** a closed alpha --- several uncoached sessions with real people,
in Russian, on a deployed build --- and then the v0.1 release. Stages
0--250 showed that the world keeps its integrity. Nothing yet shows that a
session feels like a living world: no person has played the slice, no live
model has run, and the client has had no independent review.

**Order:** language first, so that models are evaluated and the client is
rebuilt on real Russian content; then live AI, the cheapest test of
whether the world comes alive; then what several people need to play
together; then the visual work; then what a deployment needs.

### Stage 290 --- Language Foundation and Russian Ravenford

A campaign has one play language. Everything a Player or DM reads follows
it: client text, text the World Engine records, fixtures, deterministic
templates, AI output, and the lexical rules that check prose and search
memories. English stays supported and every existing suite keeps running
in English. Ravenford gains a Russian seed built on an owner-approved
glossary of names and terms. Text recorded in events must replay
identically, so how language enters history is settled in an ADR first.

**Gate:** existing suites pass unchanged in English; the Russian Ravenford
scenario passes end to end, including Chronicle hedging and memory recall;
a Russian player's view shows no English beyond the glossary's names. The
reviewed Chronicle and recall rules change here; Gate #6 reviews them.

### Stage 300 --- Live AI

Run real providers behind the existing gateway: correct the Anthropic
adapter for current models, add an adapter for OpenAI-compatible APIs
(DeepSeek), route each capability to its own model, and record latency,
tokens, and cost in traces under enforced budgets. Build an evaluation
harness with Russian cases for every AI use. The owner chooses the
NPC-dialogue model from a blind comparison. AI still only proposes; no
write path is added.

**Gate:** deterministic suites unchanged without keys; an evaluation
report with pass rates, latency, and cost per session for each model;
outage, invalid output, timeout, refusal, and exhausted budget fall back
as ADR 0017 requires.

### Stage 310 --- Live Session

Several people play at once without refreshing. The server tells connected
clients that the campaign changed; each client re-reads its own scoped
projections. A waiting reaction appears for its player at once. The DM can
keep a session moving when a player is away, and can find and undo earlier
authoring commits after a reload.

**Gate:** the change signal carries no world content and reveals nothing a
perspective could not already read; multi-client journeys for combat,
reactions, and authoring; reconnect and stale-client recovery.

### Stage 320 --- Visual Language and Scene

The owner picks a direction from prototypes of the key screens. Rebuild
the client around the scene: the place and who is in it fill the view, NPC
speech appears in the scene, the battlefield is a map, the Chronicle reads
as a book, and controls appear in context. Presentation only: no contract,
rule, or projection changes, and visual state stays outside world state.

### Stage 330 --- Images

Replace the placeholder generator with the OpenAI image adapter behind the
existing image port. Generate the fixed Ravenford cast and places once as
a curated, DM-approved set; generate on demand only what the DM authors in
play. Variants derive from the approved canonical reference. Add the DM's
approval flow to the client, cost limits, and durable content storage.

### Stage 340 --- Production Authentication

Decide and build production sign-in and campaign membership; development
personas stay refused in production. Sessions, revocation, rate limits,
and the DM's management of who may join.

**Gate:** the request check order of ADR 0009 holds; forged, expired,
revoked, and cross-campaign credentials fail closed; no credential reaches
logs, traces, URLs, or browser storage beyond what the ADR allows.

### Stage 350 --- Deployment

Deploy the slice to the owner's VPS: containers, TLS, static client
hosting, secrets from the environment, migrations on deploy, PostgreSQL
backups with a restore drill, health checks, logs, and a runbook. Nothing
is announced or released here.

### Stage 355 --- Astra Gate #6 Full-Stack Red Team

Attack the deployed build without source modification: sign-in and
sessions, perspective isolation in the client and over the change signal,
prompt injection against live models in Russian and English, the
language-dependent rules changed at Stage 290, image visibility, abuse and
cost limits, and backup/restore integrity. This is also the first
independent review of the client built in Stages 200--240. This is Gate
#6; use `handoffs/ASTRA_GATE_06_REQUEST.md` and
`reviews/ASTRA_GATE_06_REPORT.md`. There is no Opus implementation work
order for Stage 355.

### Stage 360 --- Playtests and Release v0.1

Run three to five uncoached sessions with real people (a DM and one to
three players) in Russian on the deployed build. Primary question, as in
Stage 240: **did they interact with the world or hunt through UI?** Record
observations apart from interpretation, obtain the owner's disposition,
remediate within bounds, and then complete the release that Stage 250
prepared. An AI stand-in pass may precede the sessions as a filter; it is
never acceptance.

## AI Campaign Program — Stages 370–450 (requested 2026-10-30)

The owner authorized implementation of this program in the project chat and
specified an unlimited monetary AI budget for text and images. Costs remain
observable; operational timeouts, cancellation and bounded retries remain.
Detailed contract: `docs/STAGE_370_DESIGN.md`; proposed architecture ADR 0038.
Current scope: `work-orders/STAGE_370.md`. Formal checkpoints still stop for
the owner's disposition. This program does not complete Stage 360's human
playtests or authorize a deployment, publication or release tag.

### Stage 370 — Campaign Contract

Define the package, ownership before a campaign exists, generation/recovery,
scenario and visual preview, selective editing and confirmed startup. Provide
a concrete non-Ravenford example and assign verification to every later surface.

**Checkpoint:** owner disposition of the detailed contract and proposed ADR.

### Stage 380 — Workshop Access and Unlimited Monetary Policy

Introduce separately authorized workshop identity/invitations and private draft
ownership. Implement explicit unlimited monetary authorization for owner-approved
text/image work while retaining accounting, credential isolation and operational
controls. Preserve finite historical records.

**Checkpoint:** cross-owner/campaign/session refusal and revocation coverage;
former monetary ceilings cannot stop unlimited-mode admission; cost evidence
and unknown-charge recovery remain correct.

### Stage 390 — Campaign Package and Compiler

Implement strict schemas, immutable revisions, stable IDs and a compiler using
supported World Engine decisions. Add campaign-specific scenario/quest content.
Keep current facts, scoped knowledge and future narrative plans distinct.

**Checkpoint:** a different campaign compiles without Ravenford data; invalid
references/mechanics/knowledge fail; no live mutation occurs.

### Stage 400 — Durable AI Generation

Add campaign preparation as a real capability/session. Persist the concept,
topology, cast, knowledge, encounters, first-session plan and later outline in
resumable jobs with cancellation, worker fencing and stale-output handling.

**Checkpoint:** offline fault/restart/race coverage and recorded live generation
quality; provider success alone never proves a playable campaign.

### Stage 410 — Scenario Preview

Provide the owner's linked opening, cast/motivations, truths, rumors, secrets,
clues, possible developments and session notes. Surface findings and dependencies.

**Checkpoint:** understandable owner journey in Russian/English; every player,
outsider and unrelated owner is refused access to private scenario content.

### Stage 420 — Visual Preview

Add draft-scoped image generation/choice and isolated materialization in the
existing scene/battlefield interface, with owner and selected-character views.

**Checkpoint:** same-revision scenery and selected bytes; no forbidden names,
metadata or images in player preview; live history remains untouched.

### Stage 430 — Selective Revision

Manual/AI edits, locks, dependency-aware comparison, image staleness and restoring
old content as a new revision. Late jobs cannot overwrite newer choices.

**Checkpoint:** targeted changes preserve locked/unaffected entities and images;
conflicts are explained and old confirmation becomes invalid.

### Stage 440 — Confirmed Campaign Startup

Implement the dedicated atomic World Engine bootstrap, idempotent provisioning,
exact image adoption, owned-campaign list and normal campaign entry/invitations.
Backups/replay include generated scenario, quests, identities and picture lineage.

**Checkpoint:** reviewed revision/hash equals initial play; crash/retry produces
one campaign and exposes no partial world; Ravenford still works independently.

### Stage 450 — Integrated Acceptance

Exercise investigation, social and combat campaigns through generation, both
previews, revision, startup and actual play. Run the adversarial accounting,
credential, knowledge, provider-context and race pass; obtain owner play acceptance.

**Checkpoint:** full verification evidence plus the owner's human disposition.

## Responsibility Split (historical)

-   Product authority: project owner + Product Blueprint.
-   Primary backend builder: Claude Opus 5.5.
-   Independent adversarial reviewer: GPT-6 Astra.
-   Runtime models: selected by capability through Model Router.
-   Visual generation: Asset Engine through approved image-generation
    capability.

## Stop Rule

Every work order names exactly one stage and ends with an explicit hard
stop. Completion of a stage is not permission to begin the next stage.

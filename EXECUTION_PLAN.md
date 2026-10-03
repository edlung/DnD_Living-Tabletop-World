# Living Tabletop World --- Execution Plan v0.2

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
stage has one work order; Stage 190 is the independent Gate #5 review.

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

## Responsibility Split

-   Product authority: project owner + Product Blueprint.
-   Primary backend builder: Claude Opus 5.5.
-   Independent adversarial reviewer: GPT-6 Astra.
-   Runtime models: selected by capability through Model Router.
-   Visual generation: Asset Engine through approved image-generation
    capability.

## Stop Rule

Every work order names exactly one stage and ends with an explicit hard
stop. Completion of a stage is not permission to begin the next stage.

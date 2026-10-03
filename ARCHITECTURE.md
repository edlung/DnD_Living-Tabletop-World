# Living Tabletop World — Architecture v0.1

## System Shape
```text
Player / DM / Spectator
          |
   Application API
          |
    Intent Gateway
          |
      World Engine  <--- canonical authority
      /    |    \
  Rules Knowledge  AI Orchestrator
      \    |    /
     Canonical State
          |
        Events
          |
      Projections
          |
    Presentation API
```
AI Orchestrator has no unrestricted repository write path.

## Bounded Contexts
- **world-core:** Campaign, World, Region, Location, Scene, WorldEntity, WorldClock, WorldState.
- **character:** canonical character data plus contextual projections.
- **rules:** checks, attacks, saves, movement, range, cover, targeting, resources, conditions, damage/healing, reactions.
- **knowledge:** claims, evidence, testimony, hypotheses, contradictions, scopes and perspective-aware relations.
- **memory:** sessions, observations, conversations, discoveries, decisions, consequences and temporal retrieval.
- **combat:** Encounter, Combatant, Initiative, Turn, ActionEconomy, BattlefieldState, Effects, Targets, ReactionWindow.
- **narrative:** quest projections, objectives, factions, relationships, rumors, secrets, hooks and arcs.
- **assets:** VisualIdentity, Asset, AssetVariant, canonical references, environment state and lineage.
- **ai-orchestration:** intent, context, relevance, memory retrieval, continuity, authoring, asset direction, narrative rendering and provider routing.

## Entity vs State
Stable WorldEntity identity is distinct from mutable state. Orin remains the same entity while location, relationships, knowledge, activity, equipment, damage and visual state evolve.

## Commands and Events
Commands express intent; events express accepted facts.
```text
DM natural language
 -> proposed CreateNPC command
 -> validation
 -> risk/confirmation
 -> World Engine
 -> NPC_CREATED / NPC_PLACED / KNOWLEDGE_ASSIGNED / ASSET_GENERATION_REQUESTED
```

## Event History
Use event-oriented history where temporal reconstruction, audit, Chronicle, rollback or reactions materially benefit. Full event sourcing is not mandatory for every CRUD table.

## Knowledge Architecture
Knowledge is perspective-aware. WORLD_TRUTH may differ from PARTY, CHARACTER, PUBLIC or NPC knowledge. Testimony remains testimony until supported or canonically resolved.

## NPC Context Isolation
`ContextBuilder(NPC)` receives only permitted identity, personality, memories, knowledge, relationships, scene, visible entities and recent events. Knowledge and willingness to disclose are separate.

## Context Engine
Inputs: perspective, selected entity/object, scene/world state, character state, recent actions, rules, permitted knowledge.
Outputs: visible state, relevant actions, legality, illegality reasons and presentation hints.

AI may rank relevance; Rules owns legality.

## Reaction Engine
```text
Domain event -> Reaction Matcher -> candidates -> deterministic eligibility
-> ReactionWindowOpened -> decision -> ReactionResolved/Expired
```
Counterspell is the first acceptance case.

## DM Authoring Pipeline
```text
DM intent -> Intent Interpreter -> Structured Command Proposal
-> Schema -> Permission -> Rules -> Lore/Continuity/Timeline
-> Risk Classification -> Preview/Confirmation -> World Engine -> Events
```
Risk levels: L0 presentation-only; L1 minor reversible; L2 meaningful detail; L3 canonical narrative/secret; L4 destructive/global.

## Continuity Engine
Checks time, geography, identity, knowledge, relationships, lore and relevant economy/rules constraints. It warns rather than silently rewriting authored intent.

## Visual State / Assets
```text
VisualState = identity + world time + season/weather + damage/events
            + equipment/conditions + perspective/presentation mode
```
Assets track entity, variant, state, canonical-reference status, lineage and version.

## Chronicle
Consumes structured events plus selected memories/knowledge. LLM prose remains traceable and non-authoritative.

## Persistence
Start with PostgreSQL for relational state, event/audit records and graph-like knowledge relations; vector index for semantic memory; object storage for assets. Dedicated graph DB is not required for the slice.

Hybrid retrieval combines semantic similarity, entity relations, temporal relevance, knowledge scope and narrative salience.

## API Boundary
Conceptual surfaces:
```text
GET  /world/current
GET  /scene/current
GET  /entities/:id/context
POST /actions
GET  /characters/:id
GET  /knowledge
GET  /memories
POST /dm/author
POST /combat/actions
GET  /chronicle
```
`/entities/:id/context` (or equivalent) is a critical World-as-Interface contract.

## Provider Routing
Use capability-oriented interfaces: reasoning, fast-context, continuity, NPC dialogue, narrative, vision, image generation. Domain code must not assume one permanent model.

## Observability
Record request ID, actor/perspective, knowledge scope, context source IDs, model/capability, proposed commands, validation results, latency and cost where available.

## Deployment
Start as a **modular monolith** with enforced module boundaries before considering service extraction.

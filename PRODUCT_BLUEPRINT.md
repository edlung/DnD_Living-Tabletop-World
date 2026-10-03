# Living Tabletop World — Product Blueprint v0.1

> **The world is the interface. AI makes it alive.**

## Product Vision
Living Tabletop World is an AI-native tabletop RPG platform where players primarily interact with the world itself rather than dashboards, menus, or an AI chatbot. It preserves D&D-like mechanical depth while revealing information contextually and progressively.

**North Star:** Don't make the player operate the game. Let them inhabit the world.

**Experience test:** The player should want to live in the world; the DM should want to create it.

## Five Pillars
1. **World as Interface** — objects in the world are interaction surfaces; Object → Context → Relevant Actions.
2. **World as Memory** — events, observations, conversations, discoveries and consequences remain recallable.
3. **World as Knowledge** — truth, evidence, testimony, rumors, hypotheses, contradictions and unknowns remain distinct and perspective-aware.
4. **World as Time** — persistent entities and locations evolve through canonical state over time.
5. **World as Authoring Tool** — the DM authors inside the world; natural-language intent becomes validated structured mutations.

## Perspectives
One Living World Model supports Player, DM, and later Spectator perspectives. These are permissioned projections of one world, not separate applications.

## Knowledge
Types: FACT, EVIDENCE, TESTIMONY, RUMOR, INFERENCE, HYPOTHESIS, CONTRADICTION, UNKNOWN, SECRET.
Scopes: WORLD_TRUTH, DM, PUBLIC, PARTY, CHARACTER, NPC.

**Critical rule:** player knowledge is not world truth. AI must not cross a knowledge boundary simply because its model context contains canonical truth.

## Character Experience
A complete canonical sheet always exists. Normal play uses contextual Character State projections for combat, exploration, social, downtime and investigation.

Progressive disclosure: World → Context → Detail → Full canonical data.
AI ranks relevance. Deterministic rules determine legality.

## Combat
The battlefield is part of the interface. Distance, range, elevation, cover, movement, targeting and AoE should be represented spatially whenever practical. Reactions are first-class gameplay events.

## AI Role
AI is infrastructure, not authority and not a mandatory chat surface. It may interpret intent, rank relevance, retrieve memories, surface contradictions, assist DM authoring, check continuity, direct asset generation, assist NPC performance and render structured events into Chronicle content.

AI does not directly mutate canonical state, decide deterministic rule legality, silently convert hypotheses into facts, or make player decisions.

## Persistent Visual Identity
Assets are entity-based. Canonical visual identities belong to entities such as Orin Stonebeard and Ravenford; portraits, expressions, interiors, weather states and flashbacks derive from those identities. Visual representation is never canonical gameplay state.

## Chronicle
Chronicle is generated from structured events, not an unbounded transcript, and remains traceable to source events.

## Ravenford Vertical Slice
**The Missing Caravan** proves contextual interaction, scoped NPC knowledge, investigation/evidence, contradictions, memory, one meaningful combat, reactions, DM natural-language authoring, world-time transition, persistent entities/assets and Chronicle generation.

The slice is intentionally deep rather than broad.

## Success Definition
A 30–45 minute Ravenford session must feel like interacting with a living tabletop world rather than operating a database-backed RPG dashboard.

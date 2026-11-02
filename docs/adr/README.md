# Architecture Decision Records

ADRs record material decisions and their tradeoffs. One decision per file: `NNNN-kebab-title.md`, numbered sequentially, created from [`0000-template.md`](0000-template.md).

## When to write one

- A material technical choice that later stages build on (tooling, persistence, boundaries, runtime). Builders choose the smallest reversible option consistent with `ARCHITECTURE_INVARIANTS.md` and record alternatives.
- Any product-semantics decision scheduled in `docs/IMPLEMENTATION_PREREQUISITES.md` (temporal/undo, ruleset, authoring validation).
- Any proposed change to an architecture invariant or material architecture contract.

## Authority and status

| Status               | Meaning                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Proposed`           | Written, not in force. Product decisions and invariant changes stay here until the project owner approves.                                                                                                                                       |
| `Accepted`           | In force. Technical decisions within a work order's scope may be accepted by the builder; the owner may revisit them. Product decisions and invariant changes are accepted **only** by the project owner, with the approval recorded in the ADR. |
| `Superseded by NNNN` | Replaced; kept for history.                                                                                                                                                                                                                      |
| `Rejected`           | Considered and declined; kept for history.                                                                                                                                                                                                       |

Never mark a product decision or invariant change `Accepted` on the owner's behalf. Accepted ADRs are not edited in substance; supersede them with a new ADR.

## Index

| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted (technical) |
| [0002](0002-toolchain-and-workspace.md) | Toolchain and workspace layout | Accepted (technical) |
| [0003](0003-persistence-and-migrations.md) | PostgreSQL access and forward-only SQL migrations | Accepted (technical) |
| [0004](0004-module-boundaries.md) | Module boundaries and dependency direction | Accepted (technical) |
| [0005](0005-server-runtime-foundations.md) | Server runtime foundations: config, logging, HTTP | Accepted (technical); HTTP part superseded by 0009 |
| [0006](0006-temporal-model-and-undo.md) | Temporal model, canonical history, and undo | Accepted (owner-approved product decision) |
| [0007](0007-world-kernel-model-and-event-store.md) | World Kernel model, command pipeline, and event store | Accepted (technical) |
| [0008](0008-knowledge-boundary.md) | Knowledge records, scopes, and perspective boundary | Accepted (owner-approved product decision) |
| [0009](0009-http-api-and-dev-authentication.md) | HTTP API framework, development authentication, response hygiene | Accepted (technical) |
| [0010](0010-memory-and-temporal-retrieval.md) | Memory, sessions, impossible memories, and temporal retrieval | Accepted (owner-approved product decision) |
| [0011](0011-ruleset-srd-5-2.md) | Ruleset: SRD 5.2.1 subset for the Ravenford slice | Accepted (owner-approved product decision) |
| [0012](0012-context-engine.md) | Context Engine: perception, entity context, actions, legality, relevance | Accepted (owner-approved product decision) |
| [0013](0013-investigation.md) | Investigation: player actions, clues, disclosure, hypotheses | Accepted (owner-approved product decision) |
| [0014](0014-contradictions-and-epistemic-integrity.md) | Contradictions, claims, and valid knowledge transitions | Accepted (owner-approved product decision) |
| [0015](0015-combat-engine.md) | Combat Engine: encounters, turns, attacks, spells, 0 HP | Accepted (owner-approved product decision) |
| [0016](0016-reaction-engine.md) | Reaction Engine: reaction windows and Counterspell | Accepted (owner-approved product decision) |
| [0017](0017-ai-gateway.md) | AI Gateway: providers, capability routing, scoped context, proposals, traces | Accepted (owner-approved product decision) |
| [0018](0018-ai-authoring.md) | AI authoring: proposals, validation, confirmation, commit, and undo | Accepted (owner-approved product decision) |
| [0019](0019-continuity-engine.md) | Continuity Engine: conflicts, explanations, options, relationships, lore claims | Accepted (owner-approved product decision) |
| [0020](0020-npc-intelligence.md) | NPC intelligence: scoped dialogue, guarded disclosure, Insight, monster turns | Accepted (owner-approved product decision) |
| [0021](0021-ai-relevance.md) | AI relevance: ranking already-computed context actions | Accepted (owner-approved product decision) |
| [0022](0022-asset-identity.md) | Asset identity: references, variants, generation, lineage, and visibility | Accepted (owner-approved product decision) |
| [0023](0023-world-visual-state.md) | World visual state: weather, day phases, and how things looked at a time | Accepted (owner-approved product decision) |
| [0024](0024-chronicle.md) | Chronicle: chapters from memories, traced prose, suggestions, and flashbacks | Accepted (owner-approved product decision) |
| [0025](0025-ravenford-integration.md) | Ravenford integration: semantics ledger, quest projection, scenario suite | Accepted (owner-approved product decision) |
| [0026](0026-ux-foundation.md) | Player/DM UX foundation, scoped sessions/sheets, browser lifecycle | Accepted (technical) |
| [0027](0027-world-as-interface.md) | World as Interface: object-first exploration, server-listed actions | Accepted (technical) |
| [0028](0028-combat-ux.md) | Combat UX: persistent battlefield, ephemeral options, reactions, DM operations | Accepted (technical) |
| [0029](0029-dm-authoring-ux.md) | DM authoring UX: preview, edit, confirm, cancel, undo with blockers | Accepted (technical) |
| [0030](0030-dm-session-tools.md) | DM session tools: time and weather, Chronicle and flashback, performing an NPC | Accepted (technical) |
| [0031](0031-play-language.md) | Play language: a campaign speaks one language; Russian Ravenford | Accepted (owner-approved product decision) |
| [0032](0032-live-ai.md) | Live AI: current-model adapters, per-capability routes, spending ceiling | Accepted (technical) |
| [0033](0033-live-session.md) | Live session: scoped change signal, presence, DM substitution, DM history | Accepted (owner product decision Q9; technical) |
| [0034](0034-visual-language.md) | Visual language: owner concepts, GPT-made art, scene-first client | Accepted (owner product decision Q8; technical) |
| [0035](0035-images.md) | Images: OpenAI via OpenRouter in play, curated set, purposes, PostgreSQL storage | Accepted (owner product decision Q6; technical) |
| [0036](0036-production-sign-in.md) | Production sign-in: single-use DM invitations and a cookie session | Accepted (owner product decision Q4; technical) |
| [0037](0037-deployment.md) | Deployment: one Compose project behind Caddy, verified locally | Accepted (owner product decision Q10; technical) |
| [0038](0038-ai-campaign-workshop.md) | AI campaign workshop: private revisions, scenario/visual preview, unlimited monetary policy, confirmed bootstrap | Accepted by owner disposition `reviews/STAGE_370_OWNER_DISPOSITION_2026-10-30.json`; reviewed proposal bytes frozen |
| [0039](0039-item-possession.md) | Item possession: catalog, carriers and in-play item actions | Accepted (owner product decision 2026-10-31; technical) |
| [0040](0040-table-dice.md) | Dice at the table: server rolls, a table log, 3D dice in the client | Accepted (owner-delegated product decision 2026-11-01) |
| [0041](0041-accounts.md) | Accounts: a login that holds a person's seats | Accepted (owner-delegated product decision 2026-11-02) |
| [0042](0042-table-display.md) | The table display and the table's join link | Accepted (owner-delegated product decision 2026-11-02) |
| [0043](0043-dm-screen.md) | The DM's screen: the DM's hand, a running fight, the session | Accepted (owner-delegated product decision 2026-11-02) |
| [0044](0044-online-play.md) | Online play and the player's companion | Accepted (owner-delegated product decision 2026-11-02) |
| [0045](0045-conditions-and-actions.md) | Conditions and actions: the SRD 5.2.1 rules of play | Accepted (owner-delegated product decision 2026-11-02) |
| [0046](0046-reactions-beyond-counterspell.md) | Reactions beyond Counterspell: opportunity attacks, attack reactions, rerolls | Accepted (owner-delegated product decision 2026-11-02) |
| [0047](0047-weapons.md) | Weapons: properties, masteries, unarmed strikes, two weapons, ammunition | Accepted (owner-delegated product decision 2026-11-02) |
| [0048](0048-hit-points.md) | Hit points: temporary, a lowered maximum, resistances, knocking out, objects | Accepted (owner-delegated product decision 2026-11-02) |
| [0049](0049-space-and-movement.md) | Space and movement: size, squeezing, speeds, height, jumping, falling, mounts, water | Accepted (owner-delegated product decision 2026-11-02) |
| [0050](0050-the-world-around.md) | The world around: light and sight, rests by the full rules, hazards, armor | Accepted (owner-delegated product decision 2026-11-02) |
| [0051](0051-srd-data.md) | The SRD data: import, attribution, catalogs, mechanics | Accepted (owner-delegated product decision 2026-11-02) |
| [0052](0052-spells-as-data.md) | Spells as data: the SRD's spells cast through the World Engine | Accepted (owner-delegated product decision 2026-11-02) |

Pending product decisions for later stages are tracked in `docs/IMPLEMENTATION_PREREQUISITES.md` and have no ADR yet. The temporal/undo decision is ADR 0006; minimum authoring validation (Stage 110) is ADR 0018; the Stage 120 continuity checks, relationships, and lore are ADR 0019; Stage 130's NPC dialogue, disclosure, Insight, and monster suggestions are ADR 0020; Stage 140's AI relevance is ADR 0021; Stage 150's asset identity is ADR 0022; Stage 160's world visual state is ADR 0023; Stage 170's Chronicle is ADR 0024; Stage 180's Ravenford integration and quest projection is ADR 0025; Stage 200's UX foundation is ADR 0026; Stage 210's object-first exploration is ADR 0027; Stage 220's combat UX is ADR 0028; Stage 230's DM authoring UX is ADR 0029; Stage 240's DM session tools are ADR 0030; Stage 290's play language is ADR 0031; Stage 300's live AI is ADR 0032; Stage 310's live session is ADR 0033; Stage 320's visual language is ADR 0034; Stage 340's production sign-in is ADR 0036; Stage 330's images are ADR 0035; Stage 350's deployment is ADR 0037; Stage 460's item possession is ADR 0039; Stage 510's table dice is ADR 0040; Stage 600's accounts are ADR 0041; Stage 610's table display is ADR 0042; Stage 620's DM screen is ADR 0043.

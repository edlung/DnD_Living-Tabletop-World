# Ravenford UI graphics production plan

Prepare a coherent, usable graphics package for the Ravenford vertical slice: world illustrations, character identities, UI graphics, screen layouts, and the states needed to play the complete session. Finished assets must work at their actual display size and preserve the world's rules and knowledge boundaries.

**Status:** planning proposal created at the owner's request on 2026-10-04. The graphics deliverables and allocations below are proposed additions to the existing stages. This document authorizes no production or implementation stage, changes no ADR or gate status, and does not interrupt current Opus work. Incorporate the relevant allocations into a stage's work order when that stage is authorized. Stage 200 remains the start of production UI implementation, after Gate 05 PASS.

## Sources and scope

The executable supporting packet is [Ravenford graphics development pack](graphics/README.md), requested for GPT-6.1 Sol / HIGH. It adds a documentation-only GFX00 preparation job and bounded production jobs within the stage sequence below. Model assignment is recorded in EFFORT_MATRIX.md; production application implementation remains with Opus.

Read [Product Blueprint](../PRODUCT_BLUEPRINT.md), [Ravenford Specification](../RAVENFORD_SPEC.md), [Architecture Invariants](../ARCHITECTURE_INVARIANTS.md), and the relevant stage in [Execution Plan](../EXECUTION_PLAN.md). [Gate Coverage](GATE_COVERAGE.md) and [Implementation Prerequisites](IMPLEMENTATION_PREREQUISITES.md) retain authority over acceptance and unresolved product decisions.

Use the visual concepts from the [original discussion](https://chatgpt.com/share/6ac102c5-03f0-83ed-b78a-ad40ef9621f0) as candidate references. They have not been imported or approved as production assets by this plan. The owner selects the reference images that represent the intended look; record stable copies and their provenance when visual production begins.

The scope is the existing Player/DM Ravenford session. Additional locations, a general inventory/economy, spectator UX, mobile UX, new game mechanics, and a cinematic or 3D production pipeline are not assumed. Desktop with mouse and keyboard is a proposed working target, to confirm before final layouts. Font coverage should support Latin and Cyrillic; this does not prescribe a localization feature.

## Production sequence within existing stages

The table schedules graphics deliverables alongside their consuming stages. It does not move later scene workflows into Stage 200 or introduce new numbered stages.

| Stage | Proposed graphics work | Concrete delivery and readiness check |
|---|---|---|
| **150 Asset Identity** | Establish the visual brief, select canonical world/character references, inventory assets, and produce representative samples before a batch. | A short visual guide, asset inventory, approved reference set, and exported samples for Ravenford, one NPC, and one clue. Register accepted assets through the Stage 150 identity/version/lineage contract. A reference must be reproducible as a variant without becoming a different entity. |
| **160 World Visual State** | Produce the minimum scene and entity variants required by the chosen Day 1/Day 2 demonstration. | A comparison sheet plus runtime assets mapped to canonical state. The selected change follows the domain state; an illustration cannot invent weather, damage, location, or knowledge. Reuse unchanged layers. |
| **170 Chronicle** | Prepare the chapter and flashback visual content that the backend needs. | Reusable scene image/crop, participant references, and historical asset selection for a minimal flashback. Text remains structured content. A player image and caption reveal only the selected scoped memory. Interactive Chronicle UI follows the UX allocation below. |
| **180 and Gate 05** | Validate the integrated asset usage and permitted metadata through backend/test surfaces. | Evidence for identity, scope, historical selection, lineage, and pending asset jobs under existing gates. Representative assets are available; this does not certify final UI appearance or usability. |
| **200 UX foundation** | Establish UI typography, color/spacing tokens, icon grammar, scalable frames, common controls, and shared shell layouts. | An editable UI kit, exported graphics, initial Player/DM shell, and common state sheet. Framework and runtime rendering choices belong to the authorized implementation. Do not implement the 210–230 journeys here. |
| **210 World as Interface** | Finish exploration/investigation layouts and compose the world art with contextual UI. Proposed allocation: also implement return/Day 2, Chronicle opening, and minimal flashback UI. | Mira, clue inspection, Orin, evidence/testimony/hypothesis/contradiction, memory recall, and return-to-Chronicle flows work with real projections. Full authorized detail stays reachable. |
| **220 Combat UX** | Produce combat layouts, tokens, targeting/range/cover overlays, permitted status markers, and reaction states. | Movement, targeting, ally AoE warning, CAST/IGNORE, stale/closed windows, and DM encounter controls use reviewed domain outcomes. Art and overlays agree with battlefield coordinates. |
| **230 DM authoring UX** | Finish authoring preview/edit/confirm/cancel, risk/continuity explanations, safe/unsafe undo, and NPC presentation. Proposed allocation: include DM time advancement and performance of Tomas. | A complete DM visual flow, clear pending/committed states, permitted Player View, and fallbacks during asset generation. Return/time controls connect to the Stage 210 player experience. |
| **240 Product validation** | Evaluate the integrated experience with actual participants. | Observe discovery, readability, reaction recognition, movement through the world, and access to detail in the existing 30–45 minute usability session. Record failures; visual polish does not substitute for behavioral evidence. |
| **250 Release** | Package the assets actually used by the release candidate. | Versioned exports, required source/provenance records, license records, and fresh-environment checks under the existing release work order. |

The additional allocations to 210 and 230 above are explicit proposals for the previously unresolved UX ownership. They should be accepted into those work orders before implementation. The Missing Caravan backend quest-projection allocation remains a separate planning question; graphics do not resolve it.

## Visual direction and representative samples

The first visual brief should fit into a small document with an annotated reference board. Capture the chosen rendering style, palette, materials, lighting, character proportions, framing, scene viewpoint, and the balance between world art and readable controls. Preserve selected earlier concepts instead of reopening the style without a concrete reason.

At Stage 150, produce one Ravenford scene, one NPC reference, and one clue sample at their intended sizes. Check identity consistency, object legibility, usable crop areas, and space for future contextual UI. Resolve whether character views use portraits, full figures, or both before producing the entire cast. The scene/camera approach must be compatible with the later spatial battlefield; do not let decorative perspective dictate rules.

At Stage 200, produce one representative shell layout with a contextual panel and keyboard focus, plus a small-size icon sheet. Establish the UI grammar on these examples before applying it to all later journeys. Detailed combat, authoring, and investigation mockups belong to their own authorized UX stages.

The owner chooses the visual direction and material changes to it. Routine crops, exports, and consistent variants can follow the accepted brief without separate approval for every asset. These are design decisions, not additional formal Astra gates.

## Minimum graphics inventory

This is a proposed initial inventory. Reconcile it against the actual Ravenford entities and supported actions at the consuming stage. Each required scene/object must have a deliberate representation; do not silently omit it because a dedicated illustration is expensive.

| Group | Initial package | Reuse and limits |
|---|---|---|
| **Locations** | Cover all seven named locations: Market Square, Golden Stag Inn, Orin's Alchemy, Merchant Guild, North Gate, Old Trade Road, Abandoned Caravan Site. | Prioritize detailed views for square, investigation site, Orin, North Gate, and battlefield. Agree whether the inn/guild need interiors or can use composed/exterior views for their actual interactions. No extra interior exploration is implied. |
| **Character identities** | Seven reference identities: Elowen, Mira, Orin, Thorne, the Tomas acceptance example, Goblin Raider, and Goblin Shaman. Provide the display crop/token needed by the relevant view. | The three raiders may share a visual archetype while retaining distinct entity IDs and visible token identifiers. Additional expressions and poses follow actual screen needs. |
| **Investigation objects** | Broken Wagon Wheel, Goblin Weapon, Strange Symbol, Tracks, Burned Cargo, with a readable selected/detail representation. | Reuse scene objects for detail where quality permits. Hidden significance and undiscovered evidence must not be painted into player-facing decorations or labels. |
| **World variants** | The minimum assets needed for the chosen Day 1/Day 2 change and supported historical flashback. | Use state-specific layers/crops when suitable. Do not generate every combination of weather, equipment, wounds, and time. |
| **UI foundations** | Typography, semantic color/spacing definitions, panels/frames, buttons, selection/focus, tooltips, icons, and permitted data displays. | Prefer a small consistent family over one-off decorations. Final icon count follows the implemented action inventory. |
| **Combat graphics** | Distinct tokens, selection/target markers, movement/range/AoE/cover overlays, permitted conditions, and a Counterspell prompt treatment. | Overlay geometry comes from the domain. Spell illustrations or particles are optional polish after required interactions work. |
| **Chronicle and authoring** | Reusable chapter/flashback composition and layouts for proposal, edit, confirm, conflict, commit, and undo outcomes. | Reuse world/character assets; keep dialogue, dates, status, and narrative text editable. The Tomas example is not a world entity until a valid authoring commit. |

## UI kit and required states

Create a shared token sheet for text hierarchy, spacing, surfaces, borders, focus, selection, and semantic status. Reserve ornamental type for short headings; body text, numbers, rules, and action labels must remain readable at actual size. Select font families only after checking required glyphs and distribution rights.

Create one icon language for navigation, interaction, investigation, memory, combat, and authoring. Combine unfamiliar icons with labels. Knowledge types such as TESTIMONY and HYPOTHESIS must remain distinguishable through wording or shape as well as color. Distinguish an illegal action, an unavailable implementation, a lower-ranked legal action, and a disabled pending control according to the actual API contract.

| Surface | States to design and later verify |
|---|---|
| Shared shell and controls | Default, hover, keyboard focus, selected, pending, empty, unavailable, failure/retry, and perspective change. |
| Context and investigation | Known/unknown topic, disclosed/undisclosed content, legal/illegal action with permitted reason, evidence detail, testimony, hypothesis, contradiction, and full-detail access. |
| Combat and reaction | Actor/target selection, valid/invalid target, ally within AoE, action pending, reaction offered, answer submitted, closed/expired/stale window, and encounter completed. |
| Authoring | Proposal, edited proposal, confirmation invalidated, warning/blocking conflict, committing, committed, cancelled, safe undo, and rejected unsafe undo. |
| Assets and Chronicle | Image loading, image unavailable, generation pending/failed, available historical variant, and missing permitted memory. |

A pending portrait must not prevent an accepted NPC from appearing with a neutral fallback. Image failure must not create a false gameplay result. A fallback must not reuse private data or a portrait cached for a different entity/perspective.

## Production and handoff workflow

1. **Inventory:** assign each asset a consuming scene, stage, intended display size, identity reference, and visibility requirement. Reuse the real Stage 150 identifiers and metadata contract when available; do not introduce a competing canonical schema in a design spreadsheet.
2. **Samples:** validate representative images and controls before batch production. Record the accepted references, revision, and unresolved issues.
3. **Production:** create cohesive variants from the accepted identities. Keep text, numerical values, hit areas, and gameplay geometry separate from painted backgrounds.
4. **Export:** retain editable/layered masters where available and export only the sizes/formats the consumer needs. Inspect transparent edges, crops, silhouettes, and scaled icons.
5. **Visual QA:** review contact sheets and actual-size scene compositions. Compare character variants side by side and inspect the Player and DM views separately.
6. **Integration:** Opus consumes the package in the authorized stage, maps assets to existing contracts, and adds the applicable behavior/E2E coverage. A mockup is not evidence that a workflow functions.
7. **Acceptance:** record what was checked, which revision was used, and any remaining limitations. Formal gate review remains independent under the existing workflow.

The handoff package contains the visual guide, asset inventory, accepted references, editable sources where available, runtime exports, state sheets/mockups, and a short QA record. Each exported resource needs an identifier, entity/reference mapping where relevant, variant, version/lineage, dimensions, crop/anchor information, consumer, and provenance/license record. Keep internal prompts and protected source metadata out of public asset delivery.

## Storage and export proposals

Keep design notes and a small inventory index under a dedicated design/documentation area. Store large masters, generated batches, and rejected variations outside active source context, with a local `AGENTS.md` explaining narrow lookup and the authoritative index. Use the repository/object-storage policy selected for assets at Stage 150; do not commit entire generation histories into application source.

Recommended format roles, to confirm with the consuming renderer:

- **SVG or code-native graphics:** icons, simple scalable frames, focus/selection markers, and geometry-driven overlays.
- **PNG masters/cutouts:** artwork requiring clean transparency or lossless intermediate export.
- **WebP or other supported runtime raster export:** scene/portrait delivery after visual comparison and load-size checks.
- **Font files and live text:** retain text as application content; do not bake UI labels, HP, secrets, or Chronicle prose into an image.

Exact dimensions, compression, font sizes, and loading budgets are implementation decisions to record before batch export. As a proposed layout test set, use 1280×720 and 1920×1080 with enlarged text; confirm the actual supported minimum at Stage 200. This is a working target, not an added mobile or accessibility certification requirement.

## Graphics acceptance checks

- The selected character remains recognizable across portraits, tokens, scenes, and historical variants. Asset versions and references are traceable.
- Players can identify interactive objects and distinguish focus, selection, and action availability without relying only on color.
- Labels, numbers, icons, and contextual controls remain readable at the supported viewport and text scale; artwork does not overlap essential controls.
- Objects and painted obstacles agree with the supported battlefield layout. UI never infers range, cover, legal targets, or line of sight from pixels.
- Legal suboptimal actions remain selectable. An ally warning does not become a prohibition; unavailable actions carry permitted explanations.
- Player-facing images, thumbnails, labels, filenames, captions, metadata, and caches do not reveal DM-only knowledge, hidden HP, private proposals, or future events. Perspective changes do not briefly show previous private content.
- Chronicle/flashback uses scoped memories and the correct historical visual state. Decorative embellishment does not turn a hypothesis into a fact.
- Loading, generation failure, stale actions, and pending authoring have understandable fallback states. Visual animation never determines reaction expiry or canonical completion.
- Runtime exports have no accidental baked UI text, transparent-edge defects, broken links, or unrecorded sources. Check load behavior on the actual build before finalizing export budgets.

## Ownership and decisions

The owner selects the visual direction, supported device target, and material product choices. A separately authorized visual-production task prepares references, art, layouts, and exports. Opus owns their integration in the authorized stage. Astra reviews the applicable invariant boundaries and evidence; this plan assigns no implementation to the formal reviewer and creates no parallel task automatically.

| Decision | Needed for | Proposed handling |
|---|---|---|
| Which earlier concepts define Ravenford's look | Stage 150 samples | Select existing references first; explore alternatives only if those do not resolve the brief. |
| Scene viewpoint and portrait/token representation | Stage 150 batch production | Compare representative world/character samples and ensure compatibility with spatial combat. |
| Runtime variant scope | Stage 160 | Choose one supported Day 2 demonstration and the variants needed by Ravenford, using the existing canonical model. |
| UI typography, scale, contrast, input, and device target | Stage 200 kit | Test one real-size shell/control sample before producing the full kit. |
| Return/Chronicle and DM time/performance ownership | Before relevant UX implementation | Proposed allocation: player journey in 210; DM time/performance controls in 230. Record the accepted assignment in existing work orders. |

The next bounded production task, when authorized with Stage 150, is the visual brief, inventory, and three representative world/NPC/clue samples. It ends with a concrete selection and export review before batch production. Preparation of this plan does not mark any asset or design choice approved, start image generation, or advance the development stage.

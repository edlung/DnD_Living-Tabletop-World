# Technical specification for Ravenford graphics

## Objective and authority

Deliver a usable visual package for the existing Ravenford Player/DM session: world and character art, investigation objects, graphics for contextual UI, state layouts, runtime-ready exports, and evidence for integration. Source requirements are [Ravenford](../../RAVENFORD_SPEC.md), [Product Blueprint](../../PRODUCT_BLUEPRINT.md), [invariants](../../ARCHITECTURE_INVARIANTS.md), and [the graphics plan](../UI_GRAPHICS_PLAN.md).

The owner's requested model is **GPT-6.1 Sol / HIGH**, scoped in [EFFORT_MATRIX.md](../../EFFORT_MATRIX.md). Numbered application stages remain assigned to Opus. Sol produces supporting design artifacts under one graphics work order at a time. Stage 200 is still the start of production UI implementation after Gate 05 PASS.

## Required coverage

| Requirement | Deliverable | Consuming job |
|---|---|---|
| World as interface | World objects with deliberate selection/focus treatments and contextual layouts; full permitted details reachable. | GFX50/GFX60 |
| Stable identity | Seven location references, seven character/archetype references, and identity-preserving variants. | GFX10/GFX20/GFX30 |
| Investigation | Five clue representations; distinct evidence, testimony, hypothesis, contradiction, and recall states. | GFX20/GFX60 |
| Spatial combat | Tokens, movement/range/AoE/cover markers, legal-target states, ally warning, and Counterspell states. | GFX70 |
| Authoring | Proposal/edit/confirmation/conflict/commit/undo states and neutral pending-image fallback. | GFX80 |
| Time and history | A supported Day 2 change, historical scene selection, and scoped Chronicle/flashback composition. | GFX30/GFX40/GFX60 |
| Operational quality | Editable sources when available, explicit provenance, exports, register, actual-size QA, and handoff. | Every production job |

The asset register is a design inventory, not a second world-state schema or authorization system. canonical_entity_id stays null until verified against the consuming stage. A design asset_id must never be submitted as a canonical command/entity ID by assumption.

## Minimum world package

Cover Market Square, Golden Stag Inn, Orin's Alchemy, Merchant Guild, North Gate, Old Trade Road, and Abandoned Caravan Site. A deliberate reusable exterior/composed view may satisfy a location without adding interior gameplay. Agree representation against its actual interaction before producing extra scenes.

Character references cover Elowen, Mira, Orin, Captain Thorne, the Tomas acceptance example, Goblin Raider, and Goblin Shaman. Three raider entities may reuse one archetype while retaining distinct tokens/identifiers at integration. Tomas artwork is an example or authoring output, not evidence that Tomas already exists in the player's world.

Clues are Broken Wagon Wheel, Goblin Weapon, Strange Symbol, Tracks, and Burned Cargo. Paint only visible content. Do not add cult insignia, hidden writing, conclusions, or a relationship between clues that the player has not discovered.

Each world object needs an approved reference or an explicit placeholder, the intended crop/anchor, and its scene use. Batch expressions, animation, extra costumes, weather combinations, and cinematic scenes are optional scope, not prerequisites for the slice.

## Visual language and UI kit

Deliver a visual guide defining palette, lighting, materials, proportions, composition, viewpoint, icon grammar, typography, and examples of permitted reuse. Keep one accepted identity reference per entity/archetype and record lineage for its derivatives.

The GFX50 UI kit includes:
- text roles: heading, body, action, annotation, numerical data, and warning;
- tokens for spacing, surface, border, focus, selection, and semantic feedback;
- scalable panel/frame, button, contextual action, tooltip/detail, progress/pending, and error treatments;
- icon families for supported interaction, investigation, memory, navigation, combat, and authoring;
- default, hover, keyboard focus, selected, pending, unavailable, failure/retry, and empty states.

Knowledge type and action legality must be distinguishable without color alone. Display lower-ranked legal actions without making them illegal. An ally AoE warning preserves the permitted choice. Show only the reasons allowed by the relevant projection.

Use the font's actual glyphs and live text, including Latin/Cyrillic coverage. Do not render HP, dates, labels, spell names, secrets, or narrative text as part of a background image. Font licensing remains unresolved until an actual source and permission record exists.

## Layout artifacts

At GFX50, produce editable common-shell/control layouts. GFX60–80 add their respective scene workflows. Static HTML/CSS/SVG or a design-tool source may be used under design/ravenford/mockups/; prefer a small offline artifact without installing a new framework. If dependencies are genuinely needed, record them within the design area and avoid root lockfile changes.

Mockups must be marked DESIGN PREVIEW and use deliberately permitted sample data. They must not connect to the game server, database, providers, or private APIs. Record unresolved runtime states explicitly. Visual previews do not replace the later real UI or its E2E checks.

Proposed comparison viewports are 1280×720 and 1920×1080; also inspect enlarged text. Confirm the supported minimum before finalizing GFX50. Export at intended display size and one higher-density variant where it benefits readability; do not generate arbitrary resolutions before the consumer is known.

## Export and resource requirements

| Resource | Source and export requirement |
|---|---|
| Icons and simple frames | Editable SVG or code-native source; stable viewBox, consistent geometry/stroke, no scripts or external references. Check small-size rendering. |
| World/character raster | Retain the original generation/edit output as provenance; export to the consumer-supported raster format after visual comparison. |
| Transparent cutouts | Use image generation/editing with transparency when supported; inspect against both light and dark backgrounds for halos and opaque edges. |
| Layered assets | Keep genuine editable layers when available. Never claim a flattened image is a layered source. |
| UI text and fonts | Live text, font source/permission record, required glyph coverage, and suitable fallback. |
| Spatial overlays | Geometry must be supplied by domain contracts at integration. Preview geometry is illustrative and clearly labeled. |

Exact sizes, compression, renderer, and load budgets are fixed with the authorized consuming stage. Record them in the brief/export notes before batch delivery. Sol may not choose a production framework or change the Stage 150 contract through an export decision.

Large sources and rejected generations stay outside active source context. A delivery path in the register must point to an actual retained export beneath design/ravenford/. If external storage is used for masters, record its stable reference in provenance and ensure Opus can access the agreed delivery package.

## Generation and iteration

Use the available image-generation capability for raster generation/editing and inspect the reference before editing. Discover its actual controls; do not claim selection of a particular image model, seed, quality, transparency mode, or layered format if the tool does not expose it. Read the applicable image-generation skill when executing that work.

For icons/frames use SVG or code-native graphics when they provide exact geometry. Generated screenshots may illustrate a direction, but do not become a finished UI kit.

Use accepted references in every identity-sensitive request. Record what changed and what must stay fixed, inspect the actual output, and revise a named defect. Once the current set meets its criteria, deliver it rather than repeatedly generating alternatives. Apply the owner's real generation/spend limits; the package invents no monetary allowance.

## Knowledge and state boundaries

- Player and DM previews must be composed separately from permitted sample data. Private information must not appear in image pixels, captions, filenames delivered to players, thumbnails, tooltips, public metadata, or cached previews.
- The register's intended_view is a design hint, not proof of runtime access control. Opus must use the actual scoped projections.
- Flashbacks use scoped memories and correct historical visual state. A hypothesis remains a hypothesis; artwork cannot establish canonical truth.
- Decorative obstacles do not create cover or line of sight. Art must agree with the supported battlefield.
- UI timing never closes a reaction independently. Pending/expired/closed/answered states follow the domain.
- An accepted NPC with a pending or failed portrait receives a neutral fallback. A failed image request does not cancel the canonical command or display another entity's private portrait.

## Delivery contract

Register fields are `asset_id`, `kind`, `label`, `canonical_entity_id`, `consumer_stages`, `intended_view`, `status`, `parent_asset_id`, `deliverables`, `provenance`, and `qa_report`. Keep initial rows; add derivatives with a real parent ID. Statuses are PLANNED, DRAFT, READY_FOR_REVIEW, READY_FOR_HANDOFF, or RETIRED. Intended view is UNRESOLVED, DESIGN_ONLY, PLAYER_IF_PERMITTED, or DM_ONLY; it is never a runtime ACL.

Each actual `deliverables` row contains `path`, `width`, `height`, `format`, and lowercase `sha256`. Delivery and QA paths are relative to `design/ravenford/` and stay inside it; for example, `exports/world/mira-v1.png` and `reports/GFX20_QA.md`. These examples are not existing assets. Compute dimensions and hashes from actual exports. READY_FOR_HANDOFF rows also need a nonempty provenance source/permission note, resolved intended view, and an existing QA report. A null canonical ID remains an explicit integration gap.

UI-family rows track family_id, status, and a relative evidence path. Their design report links the kit's real sources/exports. Fonts, tokens, layouts, and generated raster files remain distinct resources.

Each job supplies its named files, updated register entries, a QA report, and a handoff. Include actual dimensions, formats, hashes, reference/lineage, provenance, intended consumers, known limitations, and the checks performed. READY_FOR_HANDOFF is a design-delivery status, not owner approval or a formal gate result.

The QA record must distinguish visual observations from unperformed integration tests. Use NOT_RUN for runtime behavior until Opus exercises it. Do not fabricate usability participants, screenshots, provider outputs, file paths, approvals, or test results.

See [ACCEPTANCE.md](ACCEPTANCE.md) for check IDs and [the work order index](../../work-orders/sol-graphics/README.md) for exact job boundaries.

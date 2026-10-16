# 0034. Visual language: the owner's concepts, GPT-made art, scene-first client

- Status: Accepted (owner product decision Q8 of 2026-10-15; technical design by the session)
- Date: 2026-10-15
- Stage: 320
- Decision type: product (visual direction, art origin, art style for Stage 330) and technical.
- Owner approval: the owner supplied seven GPT-made concepts and decided that GPT makes all art
  (`reviews/OWNER_DECISIONS_10_2026-10-15.json`); the session adopts the design under the owner's
  delegation of 2026-10-15 (`reviews/OWNER_DECISIONS_9_2026-10-15.json`). Full design:
  `docs/STAGE_320_DESIGN.md`.

## Context

The client was a page of light panels with symbolic circles for people and no art. Q8 asked for a
visual direction; the session's first prototypes drew scenes by hand, which the owner rejected:
every picture must come from an OpenAI image model. The owner then gave the direction directly as
concepts (`docs/design/stage-320/owner-concepts/`).

## Decisions

1. **Direction.** The owner's concepts: the painted world fills the screen; dark glass panels with
   pale hairlines; serif type; engraved glyphs beside words; round portraits with rings; context
   instead of dashboards; the Chronicle as a book; the battle as a tilted diorama with figures and
   glowing rings. Tokens in `apps/web/src/styles/tokens.css` (design §3).
2. **Art origin.** Every picture is GPT-made. Code draws only exact game markup (grid, rings, path,
   area, bars, text, controls). No hand-drawn SVG or CSS illustration ships.
3. **Two art classes.** UI kit (app-level, states nothing about the world, shipped with the client,
   generated once through Codex CLI on the owner's ChatGPT subscription) and world images
   (campaign content, DM-approved, asset pipeline, Stage 330). A UI-kit picture never stands in for
   a world image; empty world slots show the neutral mist or silhouette and say so.
4. **Provenance.** `apps/web/src/assets/ui-kit.manifest.json` lists every shipped picture with its
   prompt, reference concepts, channel, date, original's SHA-256 and processing recipe; a test fails
   on a picture without an entry. Processing (`scripts/ui-kit/`, sharp) is mechanical only.
5. **Glyphs as masks.** GPT draws white line glyphs on black; processing turns them into alpha
   masks that CSS tints (`currentColor`), so state colours need no new art.
6. **Battlefield pieces show rules state.** Ground texture, a difficult patch, and one piece per
   cover level (low crates, boulder, wall) placed from the projection's squares; they mark the
   state, not the object's identity. An encounter's approved map, when one exists, replaces the
   ground.
7. **Tilted board.** Desktop shows the board with CSS `perspective` and `rotateX`, tokens and pieces
   upright; a Flat/Tilted control; phones and tablets start flat. Hit-testing and accessible names
   are unchanged.
8. **Type.** Self-hosted OFL fonts with Cyrillic: Cormorant Garamond (titles), Alegreya (UI, body),
   Bad Script (decorative Chronicle notes only).
9. **Shell.** Top bar, stage, dock with sheets, right panel for the selection, the Chronicle as a
   full-screen book; all panels stay mounted while hidden (drafts survive).
10. **Brand.** The product keeps its name; the concepts' placeholder "D&D NEXT" (a third-party
    trademark) is not used.
11. **Art style for Stage 330.** The concepts' painting style replaces "Parchment & Ink" for the
    curated Ravenford set and for in-play generation.

## Consequences

- Presentation only: no contract, rule, projection, route or authorization change; the client
  still computes no legality, cost, range or area; visual state stays in memory.
- Journeys that reach a control now inside a sheet open the sheet first and keep their assertions.
- The UI kit adds about 2–4 MB of pictures to the client build; fonts add about 1 MB (subset files
  load by unicode range).
- Concept elements outside the alpha (level-up, full spellbook, inventory equip grid, world map,
  relationship graph, triggers, voice input) get no surface (design §2).
- The earlier curated set in the engraving style is superseded and regenerated in Stage 330.

## Amendments

- 2026-10-16 (Stage 330, the Chronicle's pictures): three GPT pictures of the kit
  (`textures/chronicle-desk`, `ornaments/ribbon`, `ornaments/flashback-frame`; provenance in the
  manifest) complete the Chronicle of principle 6. Wherever the book opens as a spread (at least
  1024 × 600) it lies on the candle-lit desk, the spread's edges fading into the wood and the
  desk shaded under the title; chapter tabs are the red ribbon turned across each tab, shaded
  across its middle so the words keep 4.5:1 on every pixel
  (`tests/ui-kit/chronicle-art-contrast.test.ts`; accessible names unchanged); the flashback's
  vignette sits in the gold frame instead of the corner ornament. Code draws only shades.
- 2026-10-16 (Stage 330 on the final Stage 320 client): decision 7's hit-testing holds with Stage
  330's standing figures and name-plate layer: a standing figure takes the pointer for its square
  like a portrait, and a name plate, drawn above every figure, for its combatant's square.

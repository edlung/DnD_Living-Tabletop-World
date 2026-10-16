# Web client (`@ltw/web`)

Stage 200 is the shared Player/DM foundation (ADR 0026); Stage 210 adds
object-first exploration (ADR 0027). Stage 220 adds combat UX (ADR 0028); Stage 230 adds DM authoring UX (ADR 0029).
Stage 320 gives it the owner's visual language (ADR 0034, `docs/STAGE_320_DESIGN.md`): the shell,
the scene, conversation and details over GPT-made art (part A), the battlefield (part B), the
Chronicle as a book, the flashback as a scene and the DM's tools (part C). Browser code imports
only `@ltw/contracts` and presentation components from `@ltw/ui`; never domain, rules, or
providers.

| Concern                                                               | Read first                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry and build                                                       | `src/main.tsx` (fonts, dictionaries, stylesheets), `vite.config.ts`, `index.html`                                                                                                                                                                                            |
| Authentication and perspective lifecycle                              | `src/session/app.tsx`, `src/session/login.tsx` (sign-in over the key art)                                                                                                                                                                                                    |
| Shell: top bar, dock, sheets, Chronicle dialog, Escape and focus      | `src/shell/` (`top-bar.tsx`, `dock.tsx`, `sheet.tsx`, `chronicle-dialog.tsx`, `use-shell.ts` with `isDraftField`)                                                                                                                                                            |
| The Chronicle as a book; the flashback as a scene                     | `src/chronicle/` (`chronicle-book.tsx`, `chapter-pages.tsx`, `chapter-facts.ts`, `flashback-scene.tsx`, `generate-chapter.tsx`, `chapter-message.ts`)                                                                                                                        |
| GPT UI kit in the client: URL maps, glyphs, medallions, world images  | `src/visual/` (`ui-kit.ts`, `ui-kit-names.ts`, `glyph-map.ts`, `glyph.tsx`, `medallion.tsx`, `approved-images.ts`); `src/assets/AGENTS.md`                                                                                                                                   |
| HTTP and asynchronous isolation                                       | `src/api/client.ts`, `src/api/resource.ts`, `src/api/client.test.ts`                                                                                                                                                                                                         |
| Scene/selection orchestration                                         | `src/world/world.tsx`, `use-world-data.ts`                                                                                                                                                                                                                                   |
| Scene: approved image or mist, cartouche, party rail, medallions      | `src/world/scene.tsx`, `backdrop.tsx`, `scene-objects.tsx`, `party-rail.tsx`, `use-portrait.ts`, `combat-stage.tsx`                                                                                                                                                          |
| Places and Journal sheets                                             | `src/world/places-sheet.tsx`, `journal-sheet.tsx`, `recent-events.tsx`                                                                                                                                                                                                       |
| Entity context and on-demand full sheet                               | `src/world/entity-details.tsx`                                                                                                                                                                                                                                               |
| Contextual actions, conversation, results, hypotheses, recall         | `src/exploration/` (`context-actions.tsx`, `dialogue-panel.tsx` with `DialogueView`, `action-notice.tsx`, `action-bindings.ts`, `use-action.ts`)                                                                                                                             |
| Typed records with glyph, word and hue                                | `src/visual/knowledge-cards.tsx` over `@ltw/ui` `KnowledgeDetails`                                                                                                                                                                                                           |
| Battlefield, movement, area preview, reactions, DM encounter controls | `src/combat/` (`combat-panel.tsx`, `board/` with `geometry.ts` and `terrain-card.tsx`, `hud/`, `labels.ts`, `target-options.tsx`, `reaction-prompt.tsx`, `combat-art.ts`, `dm-controls.tsx`, `movement.ts`); `world/combat-stage.tsx`                                        |
| DM tools as sheets                                                    | `src/dm/dm-sheets.tsx`                                                                                                                                                                                                                                                       |
| DM authoring: intent, preview, edit, confirm, undo                    | `src/authoring/` (`authoring-panel.tsx`, `use-authoring.ts`, `proposal-review.tsx`, `who-sees.ts`, `proposal-editor.tsx`)                                                                                                                                                    |
| Live session: signal, background refresh, badge, presence, whose turn | `src/api/live.ts`, `live-protocol.ts`, `live-context.ts`, `src/session/use-live-session.ts`, `live-status.tsx`, `world/party-rail.tsx`                                                                                                                                       |
| DM acting for a player: skip the turn, act as, the acting bar         | `src/combat/stand-in-controls.tsx`, `stand-in.ts`, `src/session/acting-bar.tsx`, `src/exploration/use-action.ts`                                                                                                                                                             |
| DM history and its undo; the day control                              | `src/dm/dm-history.tsx`, `history-pages.ts`, `use-history-undo.ts`, `history-text.ts`; `src/dm/world-controls.tsx`, `world-time.ts`                                                                                                                                          |
| Visual design                                                         | `src/styles/tokens.css` (design §3), `fonts.css`, then the one stylesheet of the area (`shell`, `scene`, `stage`, `details`, `tools`, `dm-tools`, `combat`, `combat-panels`, `board`, `battle-layout`, `chronicle`, `chronicle-pages`, `flashback`, `sign-in`, `responsive`) |
| Browser journeys                                                      | `../../tests/e2e/AGENTS.md`                                                                                                                                                                                                                                                  |

- Credentials live only in memory. No tokens or world projections in URLs,
  browser storage, logs, or a service worker.
- Perspective, refresh, location, and selection changes replace their request
  subtree. Clear old data synchronously; abort alone is not a race guard.
- A restricted view must not retain unselected DM character identities in
  dropdown options, hidden content, or failure states.
- Display server legality and epistemic types without reinterpreting them.
  Only server-listed actions with a binding in `action-bindings.ts` or
  `combat/combat-bindings.ts` are executable. The client never computes legality,
  cost, range, or area; movement routes are advisory and the server decides.
- AI feedback (ADR 0032, C): say what an AI request waits for (a reply, a
  chapter); say honestly when no words, no narrator (or text that failed the
  chronicle's checks) or no assistant came, never
  promise a trace or a later reply; never send a null trace ID as an authoring
  source; discard a reply that arrives for a listener the DM has since changed.
- No invented canonical scene images or placeholders with fictional state.
  An unavailable approved image has a neutral visual fallback.
- Live session (ADR 0033): the session screen owns the one live connection, read with
  `fetch` (never `EventSource`; the credential stays in the header). `useResource` re-reads
  in the background on its signals, and once more `TRAILING_REREAD_MS` after every read
  completed (`GenerationReads`; that trailing read schedules none): never remount, clear, or
  flash a shown view for a signal, and keep drafts, selections and unsubmitted intent. Announce turn changes in the
  turn banner's live region only, never on every refresh.
- DM table tools (ADR 0033 §6–8): "Skip the turn" and "Act as <name>" render only in the DM
  perspective's encounter controls and ask for a reason first; acting switches the DM to that
  character's perspective with a visible bar and "Stop acting", and every command sent while
  acting records the reason (`dm/substitutions`) under its own client command ID before it is
  submitted. Presence is shown beside the name and decides nothing. The DM history is read
  from the server in the DM perspective only (never kept in browser storage) and replaces
  ADR 0029 §8's screen-local undo; undo uses the existing routes. The day control offers the
  next day's morning after the current world time.
- Visual language (ADR 0034): every picture comes from the GPT-made UI kit (`src/visual/ui-kit.ts`)
  or is an approved world image from the asset API (`approved-images.ts`, object URLs revoked with
  the world screen). Code draws only exact markup — hairlines, rings, glows, scrims, bars, text,
  controls — never illustration. Glyphs are alpha masks in `currentColor`, decorative, beside a
  word or inside a control with an accessible name (icon-only controls show it as a tooltip). A
  UI-kit picture never stands in for a world image: no approved place image shows the mist and
  says so; no portrait shows the silhouette. Stylesheets use only `tokens.css` values.
- Shell (design §5.1, §7): one sheet at a time; a closed sheet, the last selection's details panel
  and the Chronicle stay mounted, `hidden`, so drafts and unsubmitted intent survive closing, every
  refresh and the viewer's own actions (the panel is keyed by the entity, never by `revision`;
  it re-reads in the background with `useRereadOn`). Escape closes the topmost sheet or panel and
  returns focus, but never from inside a text field that holds a draft (`isDraftField`); the
  Chronicle is a native modal dialog. Open sheets and the stage's view are in-memory visual state
  only. The result of an action (`ActionNotice`) is a sibling of the stage above every sheet and
  panel (just above an open sheet on wider screens), so a refusal and its Retry are never
  covered; on a phone it sits above the tab bar and every scrolling surface keeps its measured
  height (`--outcome-h`) as bottom padding and scroll padding, so no control stays under it.
- Conversation (design §5.3): while the conversation with the selected NPC shows, its options
  (talk, ask, show evidence) live in its panel only and the selection's panel collapses them to
  "Go to the conversation"; the panel re-reads the NPC's context after the viewer's own actions;
  an unavailable option shows the server's reason; a refused talk closes the conversation. The
  spoken line is in the panel's polite live region (it exists before anything is said) and the
  result leaves it out, so it is announced once.
- Chronicle (design §5.6, ADR 0024): `chronicle/chronicle-book.tsx` — the GPT book spread scaled
  to the viewport (one parchment page below 1024 px wide or 600 px high), chapters as ribbon
  tabs (`bookmark` glyph), the left page (title, the main place's approved image as it was at
  the chapter's end or the mist and its note, prose exactly as written, each passage's sources
  as a margin note: entries, epistemic types, event types in words, references on demand), the
  right page (key moments, what was learned as typed records in page inks, people met); the DM
  writes a chapter from the header. A flashback plays as a scene over the book (sepia vignette,
  the line, attribution and type, Return; Escape returns first, then closes the book). Which
  prose a chapter holds is said honestly ("Told as the plain record" for the template).
- DM tools (design §5.7): the proposal card lists what will be added (check glyphs) and who will
  see it (`who-sees.ts`, read from the proposed commands only), with Confirm, Edit and Cancel;
  acknowledgements and the open editor belong to one revision; a new card scrolls into view in
  its sheet. Time and weather shows the day counter, phase and weather glyphs and the next-day
  control; History shows when, status, the undo preview and Undo.
- Battlefield (design §5.5, ADR 0028, ADR 0034 §6–7): every square, cover level, difficult
  square, position, side, state, condition, hit point and initiative comes from the scoped
  `EncounterView`; a combatant the projection does not name is "Unidentified creature N"
  (`combat/labels.ts` over `@ltw/ui` `combatantLabels`: numbered in turn order, then position),
  never its ID, in tokens, the turn order, cards, options, the banner and square names; plates
  keep the number when the words shorten. A cover piece stands at its square's back edge, behind
  and above anyone there, with a cover badge on the figure; the terrain card shows the looked-at
  square's cover and difficult ground; each condition has its own glyph. The board is drawn
  from `combat/board/geometry.ts` (tested): tilted on a wide screen (CSS `perspective` and
  `rotateX`, figures and pieces upright), flat below 1200 px, a Flat/Tilted control, zoom on a
  phone; each square is the same button, order and name (`square-name.ts`) in both views, and
  figures sit inside their square's button. Pictures: the GPT ground, difficult patch, cover
  pieces, silhouette or approved portrait (the viewed place's `present[]`), catalog art keyed by
  the rules catalog ID; code draws only hairlines, rings, glows, path, area, bars, plates. The
  turn tray exists only while the viewer may act and holds the server-listed options of what is
  chosen plus End turn; the side panel describes them. The turn banner (the one live
  announcement of a turn) and the reaction prompt (focused once per window) live in
  `world/combat-stage.tsx`, over the scene view too.
- After the viewer's own action the world screen's views re-read in the background
  (`use-world-data.ts`): nothing empties or flashes; perspective changes and "Refresh world"
  still remount and read afresh.
- Root `pnpm build` compiles libraries/server and bundles the web client into
  `apps/web/build`. Vite proxies `/api` to the local server in development.

# Web client (`@ltw/web`)

Stage 200 is the shared Player/DM foundation (ADR 0026); Stage 210 adds
object-first exploration (ADR 0027). Stage 220 adds combat UX (ADR 0028); Stage 230 adds DM authoring UX (ADR 0029).
Stage 320 gives it the owner's visual language (ADR 0034, `docs/STAGE_320_DESIGN.md`): the shell,
the scene, conversation and details over GPT-made art (part A), the battlefield (part B), the
Chronicle as a book, the flashback as a scene and the DM's tools (part C). Stage 340 part B adds
production sign-in in the browser (ADR 0036): the join page, the cookie session, signed out, the
DM's Players sheet. Stage 330 part B adds world pictures beyond the portrait (ADR 0035): the DM's
image controls, figures in the scene and on the battlefield, the battle map, an object's picture.
Browser code imports only `@ltw/contracts` and presentation components from `@ltw/ui`; never
domain, rules, or providers.

| Concern                                                                | Read first                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry and build                                                        | `src/main.tsx` (first `schema-config.ts`: zod jitless, no eval probe under the deployment's policy; then fonts, dictionaries, stylesheets), `vite.config.ts`, `index.html`                                                                                                                                                   |
| Authentication and perspective lifecycle                               | `src/session/app.tsx`, `src/session/use-sign-in.ts` (what the page shows before a world), `src/session/login.tsx` (the personas' form)                                                                                                                                                                                       |
| Production sign-in: join page, cookie session, signed out, signing out | `src/session/sign-in-flow.ts`, `invitation-link.ts` (one-shot token holder), `sign-in-watch.ts` (a tab re-checks), `deliberate-choice.ts`, `sign-in-screens.tsx`, `sign-out-dialog.tsx`, `sign-in-kind.ts`; `src/api/client.ts` (`Connection`), `src/api/live.ts`; `src/main.tsx`                                            |
| Shell: top bar, dock, sheets, Chronicle dialog, Escape and focus       | `src/shell/` (`top-bar.tsx`, `dock.tsx`, `sheet.tsx`, `chronicle-dialog.tsx`, `use-shell.ts` with `isDraftField`, `reserved-height.ts`)                                                                                                                                                                                      |
| The Chronicle as a book; the flashback as a scene                      | `src/chronicle/` (`chronicle-book.tsx`, `chapter-pages.tsx`, `chapter-facts.ts`, `picture-note.ts`, `flashback-scene.tsx`, `generate-chapter.tsx`, `chapter-message.ts`)                                                                                                                                                     |
| GPT UI kit in the client: URL maps, glyphs, medallions, world images   | `src/visual/` (`ui-kit.ts`, `ui-kit-names.ts`, `glyph-map.ts`, `glyph.tsx`, `medallion.tsx`, `approved-images.ts`); `src/assets/AGENTS.md`                                                                                                                                                                                   |
| HTTP and asynchronous isolation                                        | `src/api/client.ts`, `src/api/resource.ts`, `src/api/client.test.ts`                                                                                                                                                                                                                                                         |
| Scene/selection orchestration                                          | `src/world/world.tsx`, `use-world-data.ts`                                                                                                                                                                                                                                                                                   |
| Scene: approved image or mist, cartouche, party rail, medallions       | `src/world/scene.tsx`, `backdrop.tsx`, `scene-objects.tsx`, `party-rail.tsx`, `use-portrait.ts`, `combat-stage.tsx`                                                                                                                                                                                                          |
| Places and Journal sheets                                              | `src/world/places-sheet.tsx`, `journal-sheet.tsx`, `recent-events.tsx` with `memory-order.ts` (latest first); `entity-words.ts` (names)                                                                                                                                                                                      |
| Character dialog: card, sheet tabs, pack (Stage 500)                   | `src/character/` (`hero-dialog.tsx`, `character-card.tsx`, `overview-tab.tsx`, `skills-tab.tsx`, `spells-tab.tsx`, `words.ts`), `src/world/hero-dialog-slot.tsx`, `src/items/inventory-panel.tsx`; rule numbers come from the server's `derived`, never computed here                                                        |
| Dice: feed, 3D dice, sound, Dice sheet, sheet roll buttons (Stage 510) | `src/dice/AGENTS.md`; ADR 0040                                                                                                                                                                                                                                                                                               |
| Entity context and on-demand full sheet                                | `src/world/entity-details.tsx`                                                                                                                                                                                                                                                                                               |
| Contextual actions, conversation, results, hypotheses, recall          | `src/exploration/` (`context-actions.tsx`, `dialogue-panel.tsx` with `DialogueView`, `action-notice.tsx`, `action-bindings.ts`, `use-action.ts`)                                                                                                                                                                             |
| Typed records with glyph, word and hue                                 | `src/visual/knowledge-cards.tsx` over `@ltw/ui` `KnowledgeDetails`                                                                                                                                                                                                                                                           |
| Battlefield, movement, area preview, reactions, DM encounter controls  | `src/combat/` (`combat-panel.tsx`, `board/` with `geometry.ts`, `plates.tsx` and `terrain-card.tsx`, `hud/`, `labels.ts`, `target-options.tsx`, `reaction-prompt.tsx`, `combat-art.ts`, `dm-controls.tsx`, `movement.ts`); `world/combat-stage.tsx`                                                                          |
| DM tools as sheets                                                     | `src/dm/dm-sheets.tsx`                                                                                                                                                                                                                                                                                                       |
| The DM's Players sheet: invite, the link shown once, revoke            | `src/dm/players-sheet.tsx`, `players-lists.tsx`, `use-players.ts`, `players.ts`                                                                                                                                                                                                                                              |
| The DM's image controls: approve, discard, generate again, replace     | `src/images/AGENTS.md` (`lineage.ts`, `dm-images.ts`, `entity-images.tsx`, `request-form.tsx`, `image-cards.tsx`, `images-sheet.tsx`, `words.ts`)                                                                                                                                                                            |
| DM authoring: intent, preview, edit, confirm, undo                     | `src/authoring/` (`authoring-panel.tsx`, `use-authoring.ts`, `proposal-review.tsx`, `who-sees.ts`, `proposal-editor.tsx`)                                                                                                                                                                                                    |
| Live session: signal, background refresh, badge, presence, whose turn  | `src/api/live.ts`, `live-protocol.ts`, `live-context.ts`, `src/session/use-live-session.ts`, `live-status.tsx`, `world/party-rail.tsx`                                                                                                                                                                                       |
| DM acting for a player: skip the turn, act as, the acting bar          | `src/combat/stand-in-controls.tsx`, `stand-in.ts`, `src/session/acting-bar.tsx`, `src/exploration/use-action.ts`                                                                                                                                                                                                             |
| DM history and its undo; the day control                               | `src/dm/dm-history.tsx`, `history-pages.ts`, `use-history-undo.ts`, `history-text.ts`; `src/dm/world-controls.tsx`, `world-time.ts`                                                                                                                                                                                          |
| Visual design                                                          | `src/styles/tokens.css` (design §3), `fonts.css`, then the one stylesheet of the area (`shell`, `scene`, `stage`, `details`, `tools`, `dm-tools`, `combat`, `combat-panels`, `board`, `battle-layout`, `figures`, `board-plates`, `images`, `chronicle`, `chronicle-pages`, `flashback`, `sign-in`, `players`, `responsive`) |
| Browser journeys                                                       | `../../tests/e2e/AGENTS.md`; against a deployment `../../tests/deploy/` (`deploy/verify/browser-journey.sh`)                                                                                                                                                                                                                 |

- Credentials live only in memory. No tokens or world projections in URLs,
  browser storage, logs, or a service worker. A development persona's token is typed in and
  sent as `Authorization` (`credentials: 'omit'`); production sign-in's session is an HttpOnly
  cookie script never reads: requests send no `Authorization` and `credentials: 'same-origin'`.
- Production sign-in (ADR 0036 §7 and its part B amendment, `docs/STAGE_340_DESIGN.md` part B
  notes and "Part B review fixes"): which sign-in the server has is learned from
  `GET /auth/session` (404: the personas' form), sent once from `main.tsx`, never from an effect.
  An invitation's token leaves the address and this history entry (`history.replaceState`) before
  anything is requested and waits in a one-shot holder (`invitation-link.ts`) — never React
  state, props, a promise's result or a module binding; it is sent only when the person presses
  "Take your seat", in the body of `POST /auth/redeem`. A signed-in browser is asked before an
  invitation replaces its sign-in (409): keeping is first, primary and focused, replacing waits
  for a deliberate moment (`deliberate-choice.ts`), and the question's own holder is cleared on
  keep, replace, success and failure. Once the seat is taken, the sign-in kept, or the person goes
  back to the start, the join page gives way to a fresh start page (`location.replace('/')`): the
  browser's navigation timing entry keeps the address it opened with. Every other failure is one
  fixed message, never a reason.
  Any 401 of a session — the live stream's `unauthenticated` included — shows "You are signed
  out"; so does a sign-in changed in another tab, which the tab finds by asking the server again
  (`sign-in-watch.ts`) on any 403 or 404, a live refusal or `gone`/`forbidden` close, `online`
  and the tab shown again, or when a later identity read names someone else. Signing out asks
  first. The Players sheet exists only in the DM perspective with production sign-in; its new
  link is shown once and held in memory only.
- Perspective, refresh, location, and selection changes replace their request
  subtree. Clear old data synchronously; abort alone is not a race guard.
- A restricted view must not retain unselected DM character identities in
  dropdown options, hidden content, or failure states.
- Names (Stage 360, `world/entity-words.ts`): a person the view sees unnamed is "Stranger" in the
  scene, details and conversation; names that collide in the viewer's directory are told apart by
  kind, then by number (`distinctNames`) in asked subjects, leads, the DM's topics and the Journal.
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
  `fetch` (never `EventSource`; the credential stays in the header, or the session cookie). `useResource` re-reads
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
  the world screen; `useHeldImage` holds a picture's place while it loads and falls back once it
  is known missing or unreadable). Code draws only exact markup — hairlines, rings, glows, scrims, bars, text,
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
  height (`--outcome-h`, `shell/reserved-height.ts`) as bottom padding and scroll padding, so no
  control stays under it. The Chronicle dialog opens and closes in a layout effect (before
  anything that would take focus reacts) and gives each page back its scroll position when it
  opens again. A reaction asked of the viewer closes an open book (its chapter and place kept)
  so the question can take focus (`world/world.tsx`).
- Conversation (design §5.3): while the conversation with the selected NPC shows, its options
  (talk, ask, show evidence) live in its panel only and the selection's panel collapses them to
  "Go to the conversation"; the panel re-reads the NPC's context after the viewer's own actions;
  an unavailable option shows the server's reason; a refused talk closes the conversation. The
  spoken line is in the panel's polite live region (it exists before anything is said) and the
  result leaves it out, so it is announced once.
- Chronicle (design §5.6, ADR 0024): `chronicle/chronicle-book.tsx` — the GPT book spread scaled to
  the viewport and lying on the GPT candle-lit desk (`chronicle-desk`; one parchment page, no desk,
  below 1024 px wide or 600 px high), chapters as tabs of the GPT red ribbon (`ribbon`, turned
  across each tab, shaded across its middle; `bookmark` glyph), the left page (title, the main
  place's approved image as it was at the chapter's end or the mist and its note, prose exactly as
  written, each passage's sources as a margin note: entries, epistemic types, event types in words,
  references on demand), the right page (key moments, what was learned as typed records in page
  inks, people met); the DM writes a chapter from the header. A flashback plays as a scene over the
  book (sepia vignette in the GPT gold `flashback-frame`, the line, attribution and type, Return;
  Escape returns first, then closes the book); behind it the pages stay laid out, unseen and
  `inert`, so they keep their place. Which prose a chapter holds is said honestly ("Told as the
  plain record" for the template). The chapter first shown stays shown: a chapter written meanwhile
  (live signal) never replaces the page being read, its ribbon says "New" until opened. A place's
  picture says "no approved picture" only when its presentation has no image; while an approved one
  loads or after its fetch failed, the mist makes no claim (`picture-note.ts`). Text areas carry a
  "lighten" veil to `--page-floor`, so every page ink reads at 4.5:1 or better on the darkest
  parchment (`tests/ui-kit/parchment-contrast.test.ts` measures the GPT pictures); the ribbon tabs'
  words and the title on the desk keep 4.5:1 too (`tests/ui-kit/chronicle-art-contrast.test.ts`).
- DM tools (design §5.7): the proposal card lists what will be added (check glyphs) and who will
  see it (`who-sees.ts`, read from the proposed commands only), with Confirm, Edit and Cancel;
  acknowledgements and the open editor belong to one revision; a new card scrolls into view in
  its sheet. Time and weather shows the day counter, phase and weather glyphs and the next-day
  control; History shows when, status, the undo preview and Undo (disabled, its reason as its
  description, while the preview says the world refuses it). Performing an NPC frames only
  spoken words as the NPC's ("{npc} says", "Spoken, not a recorded fact."); a refusal, "no words
  are available" or a failure is a plain status in the panel's own voice.
- Battlefield (design §5.5, ADR 0028, ADR 0034 §6–7): every square, cover level, difficult square,
  position, side, state, condition, hit point and initiative comes from the scoped `EncounterView`;
  a combatant the projection does not name is "Unidentified creature N" (`combat/labels.ts` over
  `@ltw/ui` `combatantLabels`: numbered in turn order, then position), never its ID, in tokens, the
  turn order, cards, options, the banner and square names; plates keep the number when the words
  shorten, and lie in a layer of their own above every figure and cover piece
  (`combat/board/plates.tsx`; `geometry.ts` `plateAnchor`, `plateRoom`), each where it lay in its
  token (which keeps its room), so a figure in front never hides the plate of a combatant behind it
  (`tests/e2e/battlefield-plates.spec.ts`). A cover piece stands at its square's back edge, behind
  and above anyone there, with a cover badge on the figure; the terrain card shows the looked-at
  square's cover and difficult ground; each condition has its own glyph. The board is drawn from
  `combat/board/geometry.ts` (tested): tilted on a wide screen (CSS `perspective` and `rotateX`,
  figures and pieces upright), flat below 1200 px, a Flat/Tilted control, zoom on a phone; each
  square is the same button, order and name (`square-name.ts`) in both views, and figures sit
  inside their square's button: what is drawn of a figure (round portrait, the standing figure's
  body, pips, badge) takes the pointer for that square in both views, so an upright figure is
  chosen where it stands and a pip shows its condition's name; its name plate, drawn in the plates'
  layer, takes the pointer for the same square (a press chooses it, the pointer lights it). On the
  tilted board an occupied square's own plate lies over its centre: browser tests point at a square
  where it shows (`clickSquare`, `clickWhereShown`). Pictures: the place's approved battle map or
  the GPT ground, difficult patch, cover pieces, the approved figure, else the approved portrait or
  the silhouette (the viewed place's `present[]`), catalog art keyed by the rules catalog ID; code
  draws only hairlines, rings, glows, path, area, bars, plates. The turn tray exists only while the
  viewer may act and holds the server-listed options of what is chosen plus End turn; the side
  panel describes them, and below 1200 px (panel out of view) the tray also shows each option's
  cost, range note or reason and the ally warning, as visible echoes of the panel (`optionNotes`,
  `warnsOfAlly`; its height kept as `--tray-h`). The turn banner (the one live announcement of a
  turn) and the reaction prompt live in `world/combat-stage.tsx`, over the scene view too: the
  banner's live words say only whose turn it is (it shows "Your reaction is needed" outside them),
  the prompt announces itself by taking focus once per window (after the Chronicle closes, if it
  was open), and when it goes away with focus in it, focus returns to the banner.
- World pictures beyond the portrait (Stage 330 part B, ADR 0035 §4): a person or creature with
  an approved `figure` stands as it in the scene (`visual/miniature.tsx`, `world/scene-objects.tsx`)
  and on the battlefield — upright when tilted, inside the medallion when flat
  (`combat/board/token.tsx`) — and keeps the portrait medallion otherwise; the board's ground is
  the encounter place's approved `battleMap` (`combat/board/board-ground.tsx`), shown while the
  viewed place's presentation lists the combatants, else the UI kit's ground; a thing or a place
  with an approved image shows it as a plate in its panel, a person keeps the round portrait.
  The HUD, the party rail and the conversation keep portraits.
- The DM's image controls (`src/images/AGENTS.md`): the selection's panel and the Images sheet,
  DM perspective only (`DmImagesContext`); candidates, requests and notes never reach a lower
  perspective; a job shows its lineage state and fixed failure reason, nothing invented; the
  note field says it reaches the image model. What a command did is worded from the lineage read
  after it; its controls wait until then; a lost answer shows with Retry wherever the image
  controls are; focus never falls to the page when a command takes away its card.
- After the viewer's own action the world screen's views re-read in the background
  (`use-world-data.ts`): nothing empties or flashes; perspective changes and "Refresh world"
  still remount and read afresh.
- Root `pnpm build` compiles libraries/server and bundles the web client into
  `apps/web/build`. Vite proxies `/api` to the local server in development.

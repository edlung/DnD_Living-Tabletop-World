# Web client (`@ltw/web`)

Stage 200 is the shared Player/DM foundation (ADR 0026); Stage 210 adds
object-first exploration (ADR 0027). Stage 220 adds combat UX (ADR 0028); Stage 230 adds DM authoring UX (ADR 0029). Browser code imports only `@ltw/contracts`
and presentation components from `@ltw/ui`; never domain, rules, or providers.

| Concern                                                               | Read first                                                                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Entry and build                                                       | `src/main.tsx`, `vite.config.ts`, `index.html`                                                                                      |
| Authentication and perspective lifecycle                              | `src/session/app.tsx`, `src/session/login.tsx`                                                                                      |
| HTTP and asynchronous isolation                                       | `src/api/client.ts`, `src/api/resource.ts`, `src/api/client.test.ts`                                                                |
| Scene/selection orchestration                                         | `src/world/world.tsx`                                                                                                               |
| Authorized scene and approved image                                   | `src/world/scene.tsx`, `src/world/scene-image.tsx`                                                                                  |
| Entity context and on-demand full sheet                               | `src/world/entity-details.tsx`                                                                                                      |
| Event references through scoped memories                              | `src/world/recent-events.tsx`                                                                                                       |
| Contextual actions, hypotheses, recall                                | `src/exploration/` (`context-actions.tsx`, `action-bindings.ts`, `use-action.ts`)                                                   |
| Battlefield, movement, area preview, reactions, DM encounter controls | `src/combat/` (`combat-panel.tsx`, `target-options.tsx`, `reaction-prompt.tsx`, `dm-controls.tsx`, `movement.ts`)                   |
| DM authoring: intent, preview, edit, confirm, undo                    | `src/authoring/` (`authoring-panel.tsx`, `use-authoring.ts`, `proposal-review.tsx`, `proposal-editor.tsx`)                          |
| Live session: signal, background refresh, badge, presence, whose turn | `src/api/live.ts`, `live-protocol.ts`, `live-context.ts`, `src/session/use-live-session.ts`, `live-status.tsx`                      |
| DM acting for a player: skip the turn, act as, the acting bar         | `src/combat/stand-in-controls.tsx`, `stand-in.ts`, `src/session/acting-bar.tsx`, `src/exploration/use-action.ts`                    |
| DM history and its undo; the day control                              | `src/dm/dm-history.tsx`, `history-pages.ts`, `use-history-undo.ts`, `history-text.ts`; `src/dm/world-controls.tsx`, `world-time.ts` |
| Visual design                                                         | `src/styles/base.css`, `scene.css`, `details.css`, `responsive.css`, `live.css`, `dm.css`                                           |
| Browser journeys                                                      | `../../tests/e2e/AGENTS.md`                                                                                                         |

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
- Root `pnpm build` compiles libraries/server and bundles the web client into
  `apps/web/build`. Vite proxies `/api` to the local server in development.

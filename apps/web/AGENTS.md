# Web client (`@ltw/web`)

Stage 200 is the shared Player/DM foundation (ADR 0026); Stage 210 adds
object-first exploration (ADR 0027). Combat and authoring workflows are later stages. Browser code imports only `@ltw/contracts`
and presentation components from `@ltw/ui`; never domain, rules, or providers.

| Concern                                  | Read first                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Entry and build                          | `src/main.tsx`, `vite.config.ts`, `index.html`                                    |
| Authentication and perspective lifecycle | `src/session/app.tsx`, `src/session/login.tsx`                                    |
| HTTP and asynchronous isolation          | `src/api/client.ts`, `src/api/resource.ts`, `src/api/client.test.ts`              |
| Scene/selection orchestration            | `src/world/world.tsx`                                                             |
| Authorized scene and approved image      | `src/world/scene.tsx`, `src/world/scene-image.tsx`                                |
| Entity context and on-demand full sheet  | `src/world/entity-details.tsx`                                                    |
| Event references through scoped memories | `src/world/recent-events.tsx`                                                     |
| Contextual actions, hypotheses, recall   | `src/exploration/` (`context-actions.tsx`, `action-bindings.ts`, `use-action.ts`) |
| Visual design                            | `src/styles/base.css`, `scene.css`, `details.css`, `responsive.css`               |
| Browser journeys                         | `../../tests/e2e/AGENTS.md`                                                       |

- Credentials live only in memory. No tokens or world projections in URLs,
  browser storage, logs, or a service worker.
- Perspective, refresh, location, and selection changes replace their request
  subtree. Clear old data synchronously; abort alone is not a race guard.
- A restricted view must not retain unselected DM character identities in
  dropdown options, hidden content, or failure states.
- Display server legality and epistemic types without reinterpreting them.
  Only server-listed actions with a binding in `action-bindings.ts` are
  executable; combat/reaction options stay read-only until Stage 220.
- No invented canonical scene images or placeholders with fictional state.
  An unavailable approved image has a neutral visual fallback.
- Root `pnpm build` compiles libraries/server and bundles the web client into
  `apps/web/build`. Vite proxies `/api` to the local server in development.

# Browser journeys

Start with `playwright.config.ts` and `support/session.ts`, then the one journey.
Run `pnpm test:e2e` after installing Playwright Chromium. Both servers are owned
by Playwright: Vite on 4310 and the real seeded HTTP application on 4311.

- `apps/server/src/testing/ui-server.ts` composes the real World Engine and dev
  personas over deterministic in-memory storage. No external AI provider runs.
- These are browser journeys through real HTTP projections, not mocked domain
  behavior. Route interception is limited to delayed/failed transport cases.
- Stage 200 baseline campaigns stay read-only. Each Stage 210 mutation journey
  owns a campaign from `fixtures/investigation-campaigns.json`, prepared by
  `ui-investigation-campaigns.ts` through real commands. Never share one mutable
  campaign between tests or depend on another test's order or state.
- Keep secrets in server/test fixtures. Node-side checks may import the shared
  knowledge-boundary fixture; client source must never import it.
- `fixtures/hidden-character.json` is a secret browser-boundary sentinel seeded
  through a real DM command. Its name and ID must disappear from the complete
  DOM, including perspective options, outside the DM perspective.
- The UI server also gives Mira the approved reference sheet via a real DM
  command, proving that authorized NPC sheets stay reachable for the DM.
- `ui-campaigns.ts` prepares a separate `ui-combat` campaign with the existing
  ambush fixture and a real open Counterspell window. Encounter journeys only
  read its scoped status; no browser test executes combat actions.
- Investigation checks use scripted d20 results of 15. The unknown-concept
  campaign omits initial caravan-related visible knowledge and visible
  memories; it tests server-driven action visibility before and after learning.
- Generated traces/screenshots belong in ignored `test-results/`;
  inspect a failed journey narrowly, never load generated artifacts wholesale.

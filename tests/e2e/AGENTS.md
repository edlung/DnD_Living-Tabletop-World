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
  ambush fixture and a real open Counterspell window and stays read-only. Each
  Stage 220 combat mutation journey owns a campaign from
  `fixtures/combat-campaigns.json`, prepared by `ui-combat-campaigns.ts`.
- Investigation checks use scripted d20 results of 15. The unknown-concept
  campaign omits initial caravan-related visible knowledge and visible
  memories; it tests server-driven action visibility before and after learning.
- Generated traces/screenshots belong in ignored `test-results/`;
  inspect a failed journey narrowly, never load generated artifacts wholesale.
- Stage 230 authoring journeys each own a campaign from `fixtures/authoring-campaigns.json`
  (`ui-authoring-campaigns.ts`). The browser-test server routes `reasoning` to the
  deterministic offline interpreter, so "Add a young guard near North Gate…" proposes
  Tomas Reed with no external provider. Namespace player command IDs per campaign (IDs
  are unique per actor across campaigns); scan rendered text, not stylesheets, for UI words.
- AI feedback (`ai-feedback.spec.ts`, ADR 0032 checkpoint C): `ui-ai-feedback` adds a second
  character (Bram Holt) for the stale-reply check, and `ui-ai-no-start` never gets a durable AI
  request start in `ui-server.ts`, so its intents, replies and chapters carry a null trace ID. Only
  dialogue delays are intercepted; the answers are the real server's.
- Live session (`live-*.spec.ts`, ADR 0033): two browsers share each campaign of
  `fixtures/live-campaigns.json` (`ui-live-campaigns.ts`) and never press "Refresh world".
  The live stream never ends while a page lives, so response-body collectors skip it
  (`isLiveStream` in `support/session.ts`); its frames are held to the fixed grammar by the
  server tests. Only the stream's transport is touched: the reconnect journey cuts the open
  stream (`window.stop()`) and fails reconnects through `LIVE_URL`, and the stale-window
  journey in `combat-reactions.spec.ts` keeps its player's stream down so that only the
  backend learns of the close.
- DM table tools (ADR 0033 §6–8): `live-stand-in.spec.ts` (the DM skips an absent player's turn
  while her screen follows; the DM acts as Elowen with a reason, the history lists the attack
  and undoes it) and `dm-history.spec.ts` (an authoring commit listed after a reload with a
  working undo; no history for a player or in a lower perspective) own campaigns of
  `fixtures/live-campaigns.json`. `authoring-undo.spec.ts` undoes from the history list that
  replaced the review's screen-local undo, with the same assertions. Helpers: `support/dm.ts`.
- Specs that import server test support (`support/investigation.ts` → `scenario/secrets.ts`)
  load workspace packages from their builds: run `pnpm build` before `pnpm test:e2e` after a
  contract change (`pnpm validate` does).

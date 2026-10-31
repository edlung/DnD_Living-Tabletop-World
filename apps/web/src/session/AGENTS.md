# Game sign-in and mounted identity

Read `../AGENTS.md`, ADR 0036 and the current work order for authentication changes.

- `invitation-link.ts` clears `/join` fragments before render/requests and holds the
  token once in a closure. Never use React state/props, storage or logs for tokens.
- `sign-in-flow.ts` keeps normal invitation redemption deliberate. Existing game
  sessions are replaced only after the explicit replacement question.
- `use-sign-in.ts` fences every connection generation. Late API/logout callbacks
  cannot clear a newer world. Native pagehide must synchronously remove private DOM
  before a history snapshot; restoration re-probes the server.
- `mounted-game.ts` retains only the first observed actor for one connection.
  A logout question captures that metadata once when it opens; no later identity
  fetch may silently replace the guard. Always bind the mounted campaign.
- `sign-out-dialog.tsx` keeps Stay focused and Escape safe. Release its request when
  the dialog/connection ends; a guarded409 clears the old world, preserving the new
  browser cookie. Server401/sign-out responses never expire a newer credential.
- Workshop authentication is independent. Game entry from activation still uses the
  normal invitation flow and never grants workshop authority to a game membership.

# Work Order — Stage 695: Voice

Authority: owner approval 2026-11-02 (`reviews/OWNER_FULL_GAME_2026-11-02.json`), program
`docs/FULL_GAME_PLAN.md` (Milestone D, Stage 695, decision 8); ADR 0060 (written first). Branch
`claude/full-game-d`. The relay's ports on the shared VPS are the owner's to open: nothing here opens
them.

## Sub-stages (one commit each, the suite green at each)

- 695a — The room on the server: who is in the campaign's voice (online sessions, the DM and players
  with a character, eight at most), the signaling stream and post relaying offers, answers and
  candidates only between two members in the room, the DM's mute and removal, short-lived relay
  credentials when a relay is configured.
- 695b — The speakers' screens: the voice panel online (join, leave, mute, push to talk, the
  microphone's choice, a refused microphone explained, "in the same room as another"), the WebRTC
  mesh with echo cancellation, who talks shown, reconnection.
- 695c — The relay's set-up for the VPS, ready and documented but not started (coturn, its secret in
  `deploy/.env`, the ports the owner opens), and the DM's controls in the room.

## Status (2026-11-04)

- 695a done: `server/src/voice/` (the room in memory, the stream, the signal post, the DM's mute and
  removal, `relayCredentials`), `LTW_TURN_URLS`/`LTW_TURN_SECRET` (`platform/config/voice-relay.ts`),
  leaving online play ends the room.
- 695b done: `web/src/voice/` on the Chat sheet; the room opens before the microphone, so an
  unanswered question still listens; the page's `Permissions-Policy` now lets this origin ask for
  the microphone (before, no page could). Proved between two browsers with a tone standing in for
  the microphone (`tests/e2e/voice.spec.ts`).
- 695c done: the relay's pass-through (`compose.yaml`, `.env.example`, `verify/smoke.sh`) and
  RUNBOOK §14; the relay itself waits for the owner's word on its ports.

## Checks at each sub-stage

Format, lint, typecheck, context budget, unit and integration tests, build; the browser suite, voice
proved between two browsers with a fake microphone (what each hears is checked by its connection's
statistics, never by ear); the layout audit (1440, 768, 390, 320; light and dark; RU and EN).

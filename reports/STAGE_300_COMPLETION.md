# Stage 300 — Live AI

- Date: 2026-10-05 (Europe/Oslo). Status: **IMPLEMENTED; OWNER CHOICE OF THE NPC-DIALOGUE MODEL PENDING.**
- Work order: `work-orders/OPUS_STAGE_300.md`. Builder: Claude Sonnet 5.5. Decisions: ADR 0032.
- Owner inputs: keys in `.env.local` (Anthropic, DeepSeek, OpenRouter); spending ceiling accepted as $30 for the stage
  (suggested in chat, not contradicted); actual spend of the evaluation runs below.

## What changed

Claude adapter fixed (forced tool use is a 400 on current models); DeepSeek adapter; per-capability routes
(`LTW_AI_ROUTES`); a fail-closed daily spending ledger; `.env.local` loaded by the server scripts;
the intent prompt tells a model to answer a non-game request with an empty list; the evaluation harness
(`pnpm eval:ai`, `apps/server/src/testing/eval/`). Unit tests cover the adapter, routes, and ledger without network.

## Evidence

Live run of 2026-10-05 (`reports/evidence/stage-300/eval-report.md`, raw `eval-results.json`). Total spend of
all evaluation runs, including reruns: about $1 (ledger prices). Estimated cost of a 45-minute session
(about 60 NPC replies, 5 DM intents, 2 chapters, 100 rankings): Sonnet dialogue ≈ $0.45, DeepSeek dialogue ≈ $0.23.

## Owner decision needed

Read `reports/evidence/stage-300/blind-npc-dialogue.md` (18 pairs, labels hidden) and say which voice you prefer;
the key is in `blind-key.json`. Then set `LTW_AI_ROUTES` accordingly (`.env.example`).

## Limitations

- One run per case; no repeats, so pass rates show sanity, not statistics. Latency is from one machine and evening traffic.
- No ceiling per campaign (ADR 0032 §4). The live path is not covered by hosted CI (no keys there, by design).
- Sonnet 5.5 declines names in Chronicle prose despite the instruction; the Russian checks do not catch it.
- The client has no streaming or "replying" indicator beyond the existing resolving notice.
- OpenRouter is for images (Stage 330) and is not wired yet.

Stop here; Stage 310 requires explicit owner authorization.

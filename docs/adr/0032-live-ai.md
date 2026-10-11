# 0032. Live AI: current-model adapters, per-capability routes, spending ceiling, evaluation

- Status: Accepted (technical; the model assignment follows the owner's decision of 2026-10-05, Q5)
- Date: 2026-10-05
- Stage: 300
- Decision type: technical. Product semantics unchanged: AI still only proposes (ADRs 0017, 0018, 0020, 0021, 0024).

## Context

Until now no live model had run. A live check on 2026-10-05 found that the Anthropic adapter's
forced tool call (`tool_choice` of type `tool`) is rejected by `claude-opus-5-5` with a 400, so with a
key every call would have fallen back silently to templates. DeepSeek V4.1 Flash (`deepseek-flash`)
accepts forced function calls with `thinking` disabled.

## Decisions

1. **Claude adapter** uses `tool_choice: auto`, names the tool in the system text, sends
   `output_config.effort` (not for Haiku 4.5, which rejects it), and treats a refusal or a reply without
   the tool call as `BAD_RESPONSE`, so the gateway's repair and fallback policy (ADR 0017 §5) applies.
   It stays on `fetch`: no SDK dependency for one endpoint.
2. **OpenAI-compatible adapter** (`openai-compatible-provider.ts`) serves DeepSeek: a forced function
   call, thinking disabled, usage from `usage`. Errors carry a code and a fixed message only.
3. **Routes.** `LTW_AI_ROUTES` gives each capability an ordered `provider:model` list, ending in
   `local` where an offline fallback is wanted. Unset, the previous default holds (Anthropic then local).
4. **Spending ceiling.** Every remote call passes a ledger priced from the providers' published rates
   (DeepSeek at its peak rate; cache discounts ignored, so it overestimates). At the daily ceiling
   (`LTW_AI_DAILY_BUDGET_USD`, default $5) calls are refused as `UNAVAILABLE` and the capability falls
   back. A ceiling per campaign is not implemented: requests carry no campaign to the provider layer.
5. **Evaluation.** `pnpm eval:ai` runs Russian cases against live providers (never in validation):
   DM intents (including a destructive request, a non-game request, and an injection), 18 NPC
   replies per model (three NPCs, six scenarios including three injections) checked against the Russian
   boundary markers, Chronicle prose, and relevance. Results and the blind comparison are in
   `reports/evidence/stage-300/`.

## Measured (2026-10-05; details in `reports/STAGE_300_COMPLETION.md`)

- DM intents: Opus 5.5 6/6, DeepSeek Flash 6/6, Sonnet 5.5 5/6 (it invents a command for a
  request that is not a game change). Opus median 4.1 s, DeepSeek 1.2 s.
- NPC replies: Sonnet 5.5 18/18 and DeepSeek Flash 18/18, no leaked marker under injection;
  median 2.5 s against 1.2 s; about $0.004 against $0.0004 per reply. Which one voices NPCs better is
  the owner's blind choice, not a metric.
- Chronicle: all three produce valid, hedged Russian prose; Opus reads best, DeepSeek is terse, and
  Sonnet declined a name despite the instruction.
- Relevance: DeepSeek Flash answered in 1.1–2.1 s, so a 2 s budget misses some; 3 s is recommended with it.
  Haiku 4.5 took 2.3 s and is no better.

## Consequences

**Correction (2026-10-11):** §4 describes an implemented best-effort in-process ledger, not a strict
spending ceiling. It has no durable reservations, resets on restart, and does not account for
failed/missing-usage responses. Required per-campaign limits and per-attempt computed costs remain
unimplemented. Stage 300 independent acceptance is pending; this ADR is not evidence of approval
for paid calls. See `docs/PROJECT_WORKFLOW.md` and the correction in the completion report.

- The default model names (`claude-opus-5-5`) apply to every capability unless routes are set; set routes.
- A cheaper model for NPC replies is a configuration change, not a code change.
- Prompt injection resistance still rests on context isolation (ADR 0020 §3), not on the model.

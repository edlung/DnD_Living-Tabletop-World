# Catalog verification: Anthropic `claude-sonnet-5-5` (2026-10-12)

Authorization: owner, 2026-10-12, in a Claude Code session ("1,2,3 даю согласие. Выполняй"),
answering a request to verify the Sonnet 5.5 pricing catalog
(`reviews/STAGE_300_OWNER_DECISIONS_5_2026-10-12.json`). Read-only documentation lookup: no
provider request, no API key, no paid call.

Verified by: orchestration session, Claude Code, `claude-opus-5-5`. Retrieved 2026-10-12 from
Anthropic's official documentation (first-party Claude API only; Bedrock, Google Cloud and Foundry
are out of scope).

## Sources

| ID  | URL                                                              | Used for                                                                               |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| S1  | https://platform.claude.com/docs/en/about-claude/pricing         | Prices, cache multipliers, long context, data residency, batch, tool-use system prompt |
| S2  | https://platform.claude.com/docs/en/about-claude/models/overview | Model ID, alias, snapshot semantics, limits                                            |
| S3  | https://platform.claude.com/docs/en/api/messages/create          | Response `model` values, `stop_reason` values, `usage` schema                          |

## Verified facts

| Fact                                  | Value                                                                                 | Source                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Claude API model ID                   | `claude-sonnet-5-5`                                                                   | S2                                                      |
| Alias                                 | `claude-sonnet-5-5` (the alias row repeats the ID; dateless IDs are pinned snapshots) | S2                                                      |
| Response `model`                      | `claude-sonnet-5-5` is a listed value of the response `model` enum                    | S3                                                      |
| Context window                        | 1,000,000 tokens                                                                      | S2                                                      |
| Max output (synchronous Messages API) | 128,000 tokens (300k only on Batches with a beta header)                              | S2                                                      |
| Base input                            | $2 / MTok                                                                             | S1                                                      |
| 5-minute cache write                  | $2.50 / MTok (1.25x)                                                                  | S1                                                      |
| 1-hour cache write                    | $4 / MTok (2x)                                                                        | S1                                                      |
| Cache hits and refreshes              | $0.10 / MTok (0.05x on Claude Opus 5.5 and Claude Sonnet 5.5)                         | S1                                                      |
| Output (thinking is billed as output) | $10 / MTok                                                                            | S1, S3 (`output_tokens` is the inclusive billing total) |
| Long-context tier                     | None: Claude 4.6+ models except Haiku 5.5 bill the full 1M context at standard rates  | S1                                                      |
| US-only inference (`inference_geo`)   | 1.1x on every token category                                                          | S1                                                      |
| Batch API                             | 50% off (not used)                                                                    | S1                                                      |
| Tool-use system prompt                | 286 tokens for `tool_choice` auto/none; forced choice not listed (rejected)           | S1                                                      |
| Server tools                          | Extra per-use charges (web search per search); not used                               | S1                                                      |

### Response `usage` schema (S3)

Counts: `input_tokens`, `output_tokens`, `cache_creation_input_tokens` (number or null),
`cache_read_input_tokens` (number or null), `cache_creation.ephemeral_5m_input_tokens`,
`cache_creation.ephemeral_1h_input_tokens`, `output_tokens_details.thinking_tokens` (a read-only
decomposition included in `output_tokens`), `server_tool_use.web_search_requests`,
`server_tool_use.web_fetch_requests`. Labels: `service_tier` (`standard`, `priority`, `batch` or
null), `inference_geo` (string or null; the example shows `global`). Total input is
`input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.

`stop_reason` values: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`,
`refusal`, `model_context_window_exceeded`. `stop_details` is set only for refusals.

## Discrepancy found

The Claude API skill's cached model table (dated 2026-10-06) lists Sonnet 5.5 cache reads at
$0.20 / MTok. The live pricing page (S1) lists $0.10 / MTok (0.05x of $2). The catalog uses S1.

## Fields outside the public schema

Responses received by Claude Code on this machine (Opus/Fable review receipts, subscription
traffic) also carried `usage.iterations` (array of entries with `type: "message"` and token
counts), `usage.speed` (`standard`) and `usage.fallback_credit` (null). S3 does not document them
for the Messages response; `speed` belongs to fast mode (not offered for Sonnet 5.5) and
`iterations`/`fallback_credit` to server-side refusal fallbacks (not requested). Whether API-key
traffic carries them is unverified. The catalog either allowlists them conservatively (see below)
or a first live response carrying them fails closed as unverified billing.

## Derived catalog values

- Canonical model and only accepted alias and response model: `claude-sonnet-5-5`.
- Pricing version: `anthropic-claude-sonnet-5-5-2026-10-12` (micro-dollars per token:
  input 2, 5m cache write 2.5, 1h cache write 4, cache read 0.1, output 10).
- No context tiers.
- `maxInputTokens` 1,000,000 (no verified tokenizer byte bound, so the reservation's input bound
  is the full context window); `maxOutputTokens` 128,000; request size within the Messages API
  limit (32 MB per the Claude API skill; an application limit may be lower).
- Reservation per attempt = 1,000,000 × the highest permitted input-class rate + `max_tokens` ×
  $10/MTok. With 5-minute caching only: $2.50 + `max_tokens` × $0.00001 (for example $2.541 at
  4,096 output tokens).
- Usage labels: `service_tier` must be `standard`; `inference_geo` must be `global` (the request
  never sets `inference_geo`; any other value implies a different price and fails closed).
- Server tools are disabled: `server_tool_use` counts must be zero or absent.
- Conservative handling of the non-schema fields, if the catalog mechanism can express it:
  `speed` = `standard`; `fallback_credit` = null; `iterations` accepted only when every entry has
  `type: "message"` and the entries' counts equal the top-level counts. Otherwise fail closed.

## Request constraints for Sonnet 5.5 (Claude API skill, migration notes)

Forced `tool_choice` (`any`/`tool`) returns 400; `thinking: {type: "disabled"}` returns 400
(omit `thinking` for adaptive, or send `{type: "between_tools"}` at effort `high` or below);
non-default `temperature`/`top_p`/`top_k` return 400; no assistant prefill. Default effort is
`high`; adaptive thinking spends output tokens within `max_tokens`.

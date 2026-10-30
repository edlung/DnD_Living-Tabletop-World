import type { ROUTE_CAPABILITIES } from '../platform/config/ai-routes.ts';

/**
 * Per-capability Anthropic request settings (docs/adr/0032-live-ai.md, checkpoint C). Sonnet 5.5
 * thinks adaptively (the request sends no `thinking`, which it would reject as disabled) and its
 * thinking spends output tokens inside `max_tokens`; its default effort is `high`. Left at the
 * default, thinking risks truncation, which is invalid output and a paid repair. Each capability
 * therefore sends an explicit effort and a `max_tokens` with room for thinking plus its answer:
 *
 * - relevance (`fast-context`): `low`, 2,048, a short ranking inside its latency budget;
 * - NPC dialogue: `low`, 4,096, a short in-character reply;
 * - DM intent (`reasoning`): `medium`, 8,192, a structured proposal with references;
 * - Chronicle (`narrative`): `medium`, 12,288, several cited, hedged paragraphs.
 *
 * These are initial settings, to revisit after a live evaluation. They are trusted code, not
 * configuration: `max_tokens` bounds each reservation (`pricing.ts`), and the verified catalog
 * entry allowlists exactly these effort values.
 */
export interface RequestSettings {
  readonly effort: 'low' | 'medium';
  readonly maxTokens: number;
}

export const ANTHROPIC_REQUEST_SETTINGS: Readonly<
  Record<(typeof ROUTE_CAPABILITIES)[number], RequestSettings>
> = Object.freeze({
  'fast-context': Object.freeze({ effort: 'low', maxTokens: 2_048 }),
  'npc-dialogue': Object.freeze({ effort: 'low', maxTokens: 4_096 }),
  reasoning: Object.freeze({ effort: 'medium', maxTokens: 8_192 }),
  narrative: Object.freeze({ effort: 'medium', maxTokens: 12_288 }),
  'campaign-preparation': Object.freeze({ effort: 'medium', maxTokens: 32_768 }),
});

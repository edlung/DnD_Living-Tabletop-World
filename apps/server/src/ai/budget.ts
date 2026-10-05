import { ProviderError, type AiProvider } from '@ltw/ai';

/**
 * Spending limits for live providers (docs/adr/0032-live-ai.md §4). Prices are US dollars per
 * million tokens, input and output, from the providers' published rates on 2026-10-05; cache
 * discounts are ignored, so the ledger overestimates and a ceiling is conservative. DeepSeek is
 * priced at its peak rate, which is twice the off-peak one.
 */
export const PRICES: Readonly<Record<string, readonly [input: number, output: number]>> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
  'deepseek-flash': [0.3, 1.2],
  'deepseek-v4-pro': [1.32, 3.96],
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [input, output] = PRICES[model] ?? [10, 50];
  return (inputTokens * input + outputTokens * output) / 1_000_000;
}

/** Spend per UTC day and per model; a ceiling that is reached stops further paid calls. */
export class SpendLedger {
  readonly #byDay = new Map<string, number>();
  readonly #byModel = new Map<string, number>();

  readonly dailyCeilingUsd: number;
  readonly #today: () => string;

  constructor(
    dailyCeilingUsd: number,
    today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {
    this.dailyCeilingUsd = dailyCeilingUsd;
    this.#today = today;
  }

  get spentToday(): number {
    return this.#byDay.get(this.#today()) ?? 0;
  }

  get exhausted(): boolean {
    return this.spentToday >= this.dailyCeilingUsd;
  }

  record(model: string, usd: number): void {
    this.#byDay.set(this.#today(), this.spentToday + usd);
    this.#byModel.set(model, (this.#byModel.get(model) ?? 0) + usd);
  }

  byModel(): ReadonlyMap<string, number> {
    return this.#byModel;
  }
}

/** Fails closed: once the ceiling is reached, the call is refused and the gateway falls back. */
export function budgeted(provider: AiProvider, ledger: SpendLedger): AiProvider {
  return {
    id: provider.id,
    generate: async (request) => {
      if (ledger.exhausted) throw new ProviderError('UNAVAILABLE', 'spending ceiling reached');
      const response = await provider.generate(request);
      if (response.usage) {
        ledger.record(
          response.model,
          costUsd(response.model, response.usage.inputTokens, response.usage.outputTokens),
        );
      }
      return response;
    },
  };
}

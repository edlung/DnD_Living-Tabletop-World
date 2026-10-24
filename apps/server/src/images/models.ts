/**
 * The in-play image models (docs/adr/0035-images.md §1; owner decision Q6: OpenAI image models
 * only, through OpenRouter). Trusted code, not configuration: `LTW_IMAGE_MODEL` may only choose
 * among these, and each carries the worst case one call is reserved at in the image ledger
 * (`ledger.ts`) before it is sent. A reservation is not a price: each call settles to the cost
 * OpenRouter reports for it, and keeps the whole reservation when no cost is reported.
 */
export const IMAGE_MODELS = {
  /** The default: the full OpenAI image model. */
  'openai/gpt-5.4-image-2': { reserveMicros: 500_000n },
  /** The configured cheaper alternative. */
  'openai/gpt-5-image-mini': { reserveMicros: 200_000n },
} as const satisfies Readonly<Record<string, { readonly reserveMicros: bigint }>>;

export type ImageModel = keyof typeof IMAGE_MODELS;

export const DEFAULT_IMAGE_MODEL: ImageModel = 'openai/gpt-5.4-image-2';

export const isImageModel = (model: string): model is ImageModel =>
  Object.hasOwn(IMAGE_MODELS, model);

/** OpenRouter's chat completions endpoint, which returns images for image-output models. */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** The provider name recorded with every asset this generator produced. */
export const OPENROUTER_OPENAI_PROVIDER = 'openrouter-openai';

/** Which generator the server's asset worker runs (`LTW_IMAGE_GENERATOR`). */
export const IMAGE_GENERATORS = ['placeholder', 'openrouter-openai'] as const;
export type ImageGeneratorKind = (typeof IMAGE_GENERATORS)[number];

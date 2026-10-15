/**
 * Reading OpenRouter's answer to an image request (docs/STAGE_330_DESIGN.md, `openrouter-openai`):
 * the first image of the first choice as a base64 data URL of a PNG, JPEG or WebP, the cost
 * OpenRouter reports, and the model and generation ID it names. Nothing is fetched from a URL and
 * nothing of the answer is ever logged; a malformed answer yields no image.
 */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Decoded bytes accepted from one data URL: generous for 1,536 px, far below memory trouble. */
export const MAX_DECODED_BYTES = 24 * 1024 * 1024;

/** A reported cost is recorded as reported, up to this many dollars (beyond is nonsense). */
const MAX_REPORTED_DOLLARS = 1_000_000;

export interface ImageAnswer {
  readonly image: { readonly bytes: Uint8Array; readonly mediaType: string } | null;
  /** The provider declined: a moderation or content-filter answer, or a refusal message. */
  readonly refused: boolean;
  /** The provider's reported cost in microdollars, when it reported a believable one. */
  readonly costMicros: bigint | null;
  readonly returnedModel: string | null;
  readonly providerRequestId: string | null;
}

type Json = Readonly<Record<string, unknown>>;

const object = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const identifier = (value: unknown): string | null =>
  typeof value === 'string' && IDENTIFIER.test(value) ? value : null;

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/;

/**
 * A reported cost in dollars as integer microdollars, rounded up; null when it is no cost at all.
 * A high one is still recorded (capped), never dropped: counting too much is safe, too little not.
 */
export function costMicrosOf(value: unknown): bigint | null {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return null;
  if (value > MAX_REPORTED_DOLLARS) return BigInt(MAX_REPORTED_DOLLARS) * 1_000_000n;
  // Nanodollars first, so that binary noise below a microdollar never rounds a whole one up.
  const nanos = Math.round(value * 1e9);
  return BigInt(Math.ceil(nanos / 1e3));
}

function decodeDataUrl(url: unknown): ImageAnswer['image'] {
  if (typeof url !== 'string' || url.length > Math.ceil(MAX_DECODED_BYTES / 3) * 4 + 64)
    return null;
  const match = DATA_URL.exec(url);
  const [, mediaType, base64] = match ?? [];
  if (mediaType === undefined || base64 === undefined || base64.length % 4 !== 0) return null;
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DECODED_BYTES) return null;
  return { bytes, mediaType };
}

const MODERATION = /moderation|content[ _-]?policy|content[ _-]?filter|safety|flagged/i;

/** Whether an error object says the provider refused the content. */
export function refusalError(error: unknown): boolean {
  const fields = object(error);
  if (!fields) return false;
  if (fields['code'] === 403) return true;
  return ['code', 'type', 'message'].some((key) => {
    const value = fields[key];
    return typeof value === 'string' && MODERATION.test(value);
  });
}

export function readImageAnswer(body: unknown): ImageAnswer {
  const root = object(body);
  const usage = object(root?.['usage']);
  const choices = root?.['choices'];
  const choice = object(Array.isArray(choices) ? (choices[0] as unknown) : null);
  const message = object(choice?.['message']);
  const images = message?.['images'];
  const first = object(Array.isArray(images) ? (images[0] as unknown) : null);
  const image = decodeDataUrl(object(first?.['image_url'])?.['url']);
  const refusal = message?.['refusal'];
  const refused =
    image === null &&
    (choice?.['finish_reason'] === 'content_filter' ||
      (typeof refusal === 'string' && refusal.trim() !== '') ||
      refusalError(root?.['error']));
  return {
    image,
    refused,
    costMicros: costMicrosOf(usage?.['cost']),
    returnedModel: identifier(root?.['model']),
    providerRequestId: identifier(root?.['id']),
  };
}

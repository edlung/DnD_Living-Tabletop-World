import { ImageGenerationError, type ImageBrief, type ImageGenerator } from '@ltw/ai';
import sharp from 'sharp';

import type { ImageLedger } from '../images/ledger.ts';
import { createOpenRouterImageGenerator } from '../images/openrouter-generator.ts';
import type { StyleReferences } from '../images/style-references.ts';
import { Secret } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { fakeFetch, type FetchCall } from './fake-fetch.ts';

/**
 * Test support (excluded from builds): the `openrouter-openai` generator against OpenRouter
 * stubbed at the HTTP boundary (docs/adr/0035-images.md §1). Briefs, provider answers, a test-only
 * key that must never reach a log, and the generator built over an injected `fetch`.
 */
export const TEST_KEY = 'sk-or-v1-TEST-ONLY-4f1c9e7a-never-in-a-log';
export const JOB = { campaignId: 'ravenford', requestId: 'http:dm-ravenford:tomas#0' } as const;
export const STYLE: StyleReferences = {
  person: [new Uint8Array([1, 1, 1]), new Uint8Array([2, 2, 2])],
  place: [new Uint8Array([3, 3, 3]), new Uint8Array([4, 4, 4])],
  object: [new Uint8Array([5, 5, 5])],
};

/** The generator over a stubbed provider; its log lines go to `lines`. */
export function providerGenerator(
  respond: (call: FetchCall) => Response | Promise<Response>,
  options: { readonly ledger: ImageLedger; readonly lines: string[]; readonly timeoutMs?: number },
): { generator: ImageGenerator; calls: FetchCall[] } {
  const transport = fakeFetch(respond);
  const generator = createOpenRouterImageGenerator({
    apiKey: new Secret(TEST_KEY),
    model: 'openai/gpt-5.4-image-2',
    ledger: options.ledger,
    styleReferences: STYLE,
    timeoutMs: options.timeoutMs ?? 5_000,
    logger: createLogger({
      service: 'images-test',
      level: 'debug',
      destination: { write: (chunk: string) => options.lines.push(chunk) },
    }),
    fetch: transport.fetchImpl,
  });
  return { generator, calls: transport.calls };
}

export const brief = (changes: Partial<ImageBrief> = {}): ImageBrief => ({
  seed: JOB.requestId,
  subject: {
    entityId: 'tomas-reed',
    kind: 'npc',
    name: 'Томас Рид',
    description: 'Молодой стражник у Северных ворот, 22 года.',
  },
  variant: 'reference',
  purpose: 'image',
  label: null,
  note: null,
  basedOn: null,
  reference: null,
  ...changes,
});

export const derived = (changes: Partial<ImageBrief> = {}): ImageBrief =>
  brief({
    variant: 'derived',
    label: 'figure',
    purpose: 'figure',
    basedOn: 'sha256:aa',
    reference: { bytes: new Uint8Array([9, 8, 7, 6]), mediaType: 'image/webp' },
    ...changes,
  });

export const picture = (width: number, height: number, format: 'png' | 'jpeg' | 'webp' = 'png') =>
  sharp({ create: { width, height, channels: 3, background: { r: 140, g: 90, b: 50 } } })
    .toFormat(format)
    .toBuffer();

export const dataUrl = (bytes: Uint8Array, mediaType = 'image/png') =>
  `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`;

/** An OpenRouter chat completion with one image (or none), as its documentation shows it. */
export const answer = (url: string | null, extra: Record<string, unknown> = {}) => ({
  id: 'gen-1760000000-abc',
  model: 'openai/gpt-5.4-image-2',
  choices: [
    {
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: '',
        ...(url === null ? {} : { images: [{ type: 'image_url', image_url: { url } }] }),
      },
    },
  ],
  usage: { prompt_tokens: 1200, completion_tokens: 4200, cost: 0.0412 },
  ...extra,
});

export const bodyOf = (call: FetchCall | undefined) =>
  JSON.parse(call?.body ?? 'null') as {
    model: string;
    modalities: string[];
    messages: [
      { role: string; content: string },
      {
        role: string;
        content: [
          { type: 'text'; text: string },
          ...{ type: string; image_url: { url: string } }[],
        ];
      },
    ];
    usage: { include: boolean };
  };

/** The failure code a generation ended with, or `SUCCEEDED`. */
export const failureOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ImageGenerationError ? error.code : 'NOT_AN_IMAGE_ERROR';
  }
  return 'SUCCEEDED';
};

/** BigInts as strings, for scanning recorded values as text. */
export const asText = (value: unknown) =>
  JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === 'bigint' ? String(inner) : inner,
  );

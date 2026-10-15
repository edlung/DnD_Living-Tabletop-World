import { randomUUID } from 'node:crypto';

import {
  ImageGenerationError,
  type GeneratedImage,
  type ImageBrief,
  type ImageGenerator,
  type ImageJob,
} from '@ltw/ai';
import type { AssetFailure } from '@ltw/contracts';

import type { Secret } from '../platform/config/config.ts';
import type { Logger } from '../platform/logging/logger.ts';
import type { ImageChargeOutcome, ImageLedger } from './ledger.ts';
import {
  IMAGE_MODELS,
  OPENROUTER_CHAT_URL,
  OPENROUTER_OPENAI_PROVIDER,
  type ImageModel,
} from './models.ts';
import { readImageAnswer, refusalError, type ImageAnswer } from './openrouter-response.ts';
import { reencodeImage } from './reencode.ts';
import type { StyleReferences } from './style-references.ts';
import { STYLE_PROMPT, subjectGroup, taskText } from './style.ts';

/**
 * The `openrouter-openai` generator (docs/adr/0035-images.md §1; docs/STAGE_330_DESIGN.md): an
 * OpenAI image model through OpenRouter's chat completions with image output, for the images the
 * DM requests in play. Each call:
 *
 * 1. builds the request from the brief only (`style.ts`): the fixed style prompt, the task text,
 *    for a reference two curated style references, for a derived variant the entity's approved
 *    canonical reference as the input image;
 * 2. reserves the model's worst case in the image ledger, and makes no call when it is denied
 *    (`UNAVAILABLE`, the neutral fallback stays);
 * 3. posts with `redirect: 'error'` within a bounded time, the key read from its `Secret` only
 *    for the header;
 * 4. validates the answer (`openrouter-response.ts`) and re-encodes it (`reencode.ts`);
 * 5. settles the reservation to the reported cost, or keeps it whole when none is reported.
 *
 * Refusals map to `REFUSED`, timeouts to `TIMEOUT`, anything else to `PROVIDER_ERROR`. Logs carry
 * fixed messages, HTTP statuses and failure codes only: never the key, the request, the answer,
 * the entity, or an amount.
 */
export interface OpenRouterImageOptions {
  readonly apiKey: Secret;
  readonly model: ImageModel;
  readonly ledger: ImageLedger;
  readonly styleReferences: StyleReferences;
  /** The bound of one call, from the reservation to the end of the answer. */
  readonly timeoutMs: number;
  readonly logger: Logger;
  /** Injected in tests; resolved per call otherwise, so the test trap is the one used. */
  readonly fetch?: typeof fetch;
}

/** The largest answer read: a 1,536 px image as base64 JSON is far below it. */
const MAX_ANSWER_BYTES = 40 * 1024 * 1024;
/** The most of an error answer read, only to tell a refusal from another failure. */
const MAX_ERROR_BYTES = 64 * 1024;

interface Body {
  readonly model: string;
  readonly modalities: readonly string[];
  readonly messages: readonly unknown[];
  readonly usage: { readonly include: true };
}

const dataUrl = (bytes: Uint8Array, mediaType: string) =>
  `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`;

/** What the provider takes as an input image; a placeholder SVG is no picture of anyone. */
const INPUT_MEDIA_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** The exact request body for a brief (exported for the request-shape tests). */
export function requestBody(
  brief: ImageBrief,
  model: ImageModel,
  styleReferences: StyleReferences,
): Body {
  const images: string[] = [];
  if (brief.variant === 'derived') {
    // Identity first: the canonical reference is the input image (ADR 0035 §1). Without one the
    // provider could only invent a look, so no call is made: the DM first approves a real one.
    if (brief.reference === null) {
      throw new ImageGenerationError('UNAVAILABLE', 'the canonical reference is not stored');
    }
    if (!INPUT_MEDIA_TYPES.has(brief.reference.mediaType)) {
      throw new ImageGenerationError('UNAVAILABLE', 'the canonical reference is no picture');
    }
    images.push(dataUrl(brief.reference.bytes, brief.reference.mediaType));
  } else {
    for (const style of styleReferences[subjectGroup(brief.subject.kind)].slice(0, 2)) {
      images.push(dataUrl(style, 'image/webp'));
    }
  }
  const styles = brief.variant === 'derived' ? 0 : images.length;
  return {
    model,
    modalities: ['image', 'text'],
    messages: [
      { role: 'system', content: STYLE_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: taskText(brief, styles) },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
    usage: { include: true },
  };
}

class Failure extends Error {
  readonly code: AssetFailure;
  readonly outcome: ImageChargeOutcome;
  readonly answer: ImageAnswer | null;

  constructor(code: AssetFailure, outcome: ImageChargeOutcome, answer: ImageAnswer | null = null) {
    super(code);
    this.code = code;
    this.outcome = outcome;
    this.answer = answer;
  }
}

/** Reads at most `limit` bytes of a body; a longer one is cancelled and refused. */
async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Failure('PROVIDER_ERROR', 'failed');
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

const parseJson = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    return null;
  }
};

/** The failure a non-OK HTTP status stands for; a 400 is read (bounded) for a refusal. */
async function statusFailure(response: Response): Promise<Failure> {
  if (response.status === 403) {
    void response.body?.cancel().catch(() => undefined);
    return new Failure('REFUSED', 'refused');
  }
  if (response.status === 408) {
    void response.body?.cancel().catch(() => undefined);
    return new Failure('TIMEOUT', 'timeout');
  }
  if (response.status === 400) {
    const body = await readBounded(response, MAX_ERROR_BYTES).catch(() => new Uint8Array());
    const error = (parseJson(body) as { error?: unknown } | null)?.error;
    return refusalError(error)
      ? new Failure('REFUSED', 'refused')
      : new Failure('PROVIDER_ERROR', 'failed');
  }
  void response.body?.cancel().catch(() => undefined);
  return new Failure('PROVIDER_ERROR', 'failed');
}

export function createOpenRouterImageGenerator(options: OpenRouterImageOptions): ImageGenerator {
  const { apiKey, model, ledger, styleReferences, timeoutMs } = options;
  const logger = options.logger.child({ module: 'images', provider: OPENROUTER_OPENAI_PROVIDER });

  const settle = async (
    chargeId: string,
    outcome: ImageChargeOutcome,
    answer: ImageAnswer | null,
  ) => {
    try {
      await ledger.settle(chargeId, {
        outcome,
        costMicros: outcome === 'not-sent' ? null : (answer?.costMicros ?? null),
        returnedModel: answer?.returnedModel ?? null,
        providerRequestId: answer?.providerRequestId ?? null,
      });
    } catch {
      // The reservation stays whole: never less than what may have been spent.
      logger.warn({ outcome }, 'image charge not settled; its reservation stays');
    }
  };

  /** Posts the body and returns the answer; every failure is a `Failure` with its outcome. */
  const call = async (
    body: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<ImageAnswer> => {
    let response: Response;
    try {
      const send = options.fetch ?? globalThis.fetch;
      response = await send(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal,
      });
    } catch {
      throw signal.aborted
        ? new Failure('TIMEOUT', 'timeout')
        : new Failure('PROVIDER_ERROR', 'failed');
    }
    if (!response.ok) {
      logger.warn({ status: response.status }, 'image provider answered with an error');
      throw await statusFailure(response);
    }
    let answer: ImageAnswer;
    try {
      answer = readImageAnswer(parseJson(await readBounded(response, MAX_ANSWER_BYTES)));
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw signal.aborted
        ? new Failure('TIMEOUT', 'timeout')
        : new Failure('PROVIDER_ERROR', 'failed');
    }
    if (answer.image === null) {
      throw answer.refused
        ? new Failure('REFUSED', 'refused', answer)
        : new Failure('PROVIDER_ERROR', 'failed', answer);
    }
    return answer;
  };

  const generate = async (
    brief: ImageBrief,
    signal?: AbortSignal,
    job?: ImageJob,
  ): Promise<GeneratedImage> => {
    if (job === undefined) {
      throw new ImageGenerationError('UNAVAILABLE', 'an image job is needed to account for it');
    }
    const body = JSON.stringify(requestBody(brief, model, styleReferences));
    const bounded = AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      ...(signal === undefined ? [] : [signal]),
    ]);
    // A function, not a narrowed property: the signal may abort during any wait.
    const stopped = () => bounded.aborted;
    if (stopped()) throw new ImageGenerationError('TIMEOUT', 'image generation timed out');

    const chargeId = randomUUID();
    let reserved: Awaited<ReturnType<ImageLedger['reserve']>>;
    try {
      reserved = await ledger.reserve({
        chargeId,
        campaignId: job.campaignId,
        requestId: job.requestId,
        provider: OPENROUTER_OPENAI_PROVIDER,
        model,
        reserveMicros: IMAGE_MODELS[model].reserveMicros,
      });
    } catch {
      logger.warn('image ledger unavailable; no image call made');
      throw new ImageGenerationError('UNAVAILABLE', 'the image ledger is unavailable');
    }
    if (reserved !== 'reserved') {
      logger.warn({ denied: reserved }, 'image budget denied; no image call made');
      throw new ImageGenerationError('UNAVAILABLE', 'no image budget for this call');
    }
    if (stopped()) {
      await settle(chargeId, 'not-sent', null);
      throw new ImageGenerationError('TIMEOUT', 'image generation timed out');
    }
    let headers: Record<string, string>;
    try {
      headers = {
        authorization: `Bearer ${apiKey.reveal()}`,
        'content-type': 'application/json',
      };
    } catch {
      await settle(chargeId, 'not-sent', null);
      throw new ImageGenerationError('UNAVAILABLE', 'the image provider key is unavailable');
    }

    let answer: ImageAnswer;
    try {
      answer = await call(body, headers, bounded);
    } catch (error) {
      const failure = error instanceof Failure ? error : new Failure('PROVIDER_ERROR', 'failed');
      await settle(chargeId, failure.outcome, failure.answer);
      logger.warn({ code: failure.code }, 'image generation failed');
      throw new ImageGenerationError(failure.code, 'the image provider produced no image');
    }
    let bytes: Uint8Array;
    try {
      bytes = await reencodeImage(answer.image?.bytes ?? new Uint8Array(), brief.purpose);
    } catch (error) {
      await settle(chargeId, 'failed', answer);
      logger.warn({ code: 'PROVIDER_ERROR' }, 'image generation failed');
      throw error instanceof ImageGenerationError
        ? error
        : new ImageGenerationError('PROVIDER_ERROR', 'the provider sent no usable image');
    }
    if (answer.costMicros !== null && answer.costMicros > IMAGE_MODELS[model].reserveMicros) {
      // Recorded as reported; the reservation was too small for this call.
      logger.warn('image call cost more than its reservation');
    }
    await settle(chargeId, 'generated', answer);
    return { bytes, mediaType: 'image/webp', model };
  };

  return { id: OPENROUTER_OPENAI_PROVIDER, generate };
}

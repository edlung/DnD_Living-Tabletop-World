import { randomBytes } from 'node:crypto';

import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';

import { RecordingImageLedger } from '../testing/fake-image-ledger.ts';
import { hanging, jsonResponse, type FetchCall } from '../testing/fake-fetch.ts';
import {
  JOB,
  TEST_KEY as KEY,
  answer,
  asText,
  bodyOf,
  brief,
  dataUrl,
  derived,
  failureOf,
  picture,
  providerGenerator,
} from '../testing/image-provider.ts';
import { OPENROUTER_CHAT_URL } from './models.ts';
import { costMicrosOf } from './openrouter-response.ts';
import { MAX_EDGE_PX } from './reencode.ts';
import { STYLE_PROMPT } from './style.ts';

/**
 * The `openrouter-openai` generator against a provider stubbed at the HTTP boundary
 * (docs/adr/0035-images.md §1; docs/STAGE_330_DESIGN.md): the exact request, the answer's
 * validation and re-encoding, the mapping of every failure to the existing codes, and a key that
 * never reaches a log. Reservations and settlements: `openrouter-spending.test.ts`.
 */
let lines: string[];
let ledger: RecordingImageLedger;

beforeEach(() => {
  lines = [];
  ledger = new RecordingImageLedger();
});

const generatorWith = (
  respond: (call: FetchCall) => Response | Promise<Response>,
  timeoutMs = 5_000,
) => providerGenerator(respond, { ledger, lines, timeoutMs });

/** Real images, seeds and imports: generous under a loaded machine (the unit default is 5 s). */
const SLOW_MS = 30_000;

describe('the request', { timeout: SLOW_MS }, () => {
  it('posts the style prompt, the task and two style references for a new reference', async () => {
    const png = await picture(64, 64);
    const { generator, calls } = generatorWith(() => jsonResponse(answer(dataUrl(png))));
    await generator.generate(brief(), undefined, JOB);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(OPENROUTER_CHAT_URL);
    expect(call?.init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(call?.init.headers).toEqual({
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
    });
    const body = bodyOf(call);
    expect(body.model).toBe('openai/gpt-5.4-image-2');
    expect(body.modalities).toEqual(['image', 'text']);
    expect(body.usage).toEqual({ include: true });
    expect(body.messages[0]).toEqual({ role: 'system', content: STYLE_PROMPT });
    const [text, ...images] = body.messages[1].content;
    expect(text.text).toContain('SUBJECT: a person or creature.');
    expect(text.text).toContain('Молодой стражник у Северных ворот, 22 года.');
    expect(text.text).toContain('style references');
    expect(images.map((image) => image.image_url.url)).toEqual([
      dataUrl(new Uint8Array([1, 1, 1]), 'image/webp'),
      dataUrl(new Uint8Array([2, 2, 2]), 'image/webp'),
    ]);
  });

  it('gives a derived variant its canonical reference as the only input image', async () => {
    const png = await picture(64, 64);
    const { generator, calls } = generatorWith(() => jsonResponse(answer(dataUrl(png))));
    await generator.generate(derived(), undefined, JOB);
    const [text, ...images] = bodyOf(calls[0]).messages[1].content;
    expect(images.map((image) => image.image_url.url)).toEqual([
      dataUrl(new Uint8Array([9, 8, 7, 6]), 'image/webp'),
    ]);
    expect(text.text).toContain('approved canonical reference');
    expect(text.text).toContain('tabletop miniature');
    expect(text.text).not.toContain('style reference');

    await generator.generate(derived({ purpose: 'image', label: 'night-rain' }), undefined, JOB);
    const night = bodyOf(calls[1]).messages[1].content[0].text;
    expect(night).toContain('at night');
    expect(night).toContain('in steady rain');
  });

  it('names neither the entity nor its ID, and quotes the DM’s note only when typed', async () => {
    const png = await picture(64, 64);
    const { generator, calls } = generatorWith(() => jsonResponse(answer(dataUrl(png))));
    await generator.generate(brief(), undefined, JOB);
    await generator.generate(brief({ note: 'В плаще городской стражи.' }), undefined, JOB);
    for (const call of calls) {
      for (const secret of ['Томас', 'Рид', 'tomas-reed', 'ravenford', KEY]) {
        expect(call.body).not.toContain(secret);
      }
    }
    expect(bodyOf(calls[0]).messages[1].content[0].text).not.toContain('direction');
    expect(bodyOf(calls[1]).messages[1].content[0].text).toContain(
      JSON.stringify('В плаще городской стражи.'),
    );
  });

  it('makes no call for a derived variant whose canonical reference is not stored', async () => {
    const { generator, calls } = generatorWith(() => jsonResponse(answer(null)));
    expect(await failureOf(generator.generate(derived({ reference: null }), undefined, JOB))).toBe(
      'UNAVAILABLE',
    );
    // A placeholder reference is no picture of anyone: the DM first approves a real one.
    const placeholder = derived({
      reference: { bytes: new TextEncoder().encode('<svg/>'), mediaType: 'image/svg+xml' },
    });
    expect(await failureOf(generator.generate(placeholder, undefined, JOB))).toBe('UNAVAILABLE');
    expect(await failureOf(generator.generate(brief()))).toBe('UNAVAILABLE');
    expect(calls).toHaveLength(0);
    expect(ledger.reserved).toHaveLength(0);
  });
});

describe('the answer', { timeout: SLOW_MS }, () => {
  it('is re-encoded to WebP within 1,536 px, whatever image format it was', async () => {
    for (const [format, mediaType] of [
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['webp', 'image/webp'],
    ] as const) {
      const large = await picture(2_400, 1_600, format);
      const { generator } = generatorWith(() => jsonResponse(answer(dataUrl(large, mediaType))));
      const image = await generator.generate(brief(), undefined, JOB);
      expect(image.mediaType).toBe('image/webp');
      expect(image.model).toBe('openai/gpt-5.4-image-2');
      const meta = await sharp(image.bytes).metadata();
      expect(meta.format).toBe('webp');
      expect(Math.max(meta.width, meta.height)).toBe(MAX_EDGE_PX);
      expect(image.bytes.byteLength).toBeLessThanOrEqual(1_500_000);
    }
  });

  it('refuses anything but a PNG, JPEG or WebP image sent inline', async () => {
    const png = await picture(64, 64);
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();
    for (const url of [
      dataUrl(gif, 'image/gif'),
      dataUrl(png, 'image/svg+xml'),
      'https://example.invalid/image.png',
      `data:image/png;base64,${Buffer.from('not an image at all').toString('base64')}`,
      'data:image/png;base64,***',
      dataUrl(gif, 'image/png'),
    ]) {
      const { generator } = generatorWith(() => jsonResponse(answer(url)));
      expect(await failureOf(generator.generate(brief(), undefined, JOB)), url.slice(0, 30)).toBe(
        'PROVIDER_ERROR',
      );
    }
  });

  it('turns the reported cost into microdollars, rounded up, and disbelieves the rest', () => {
    expect(costMicrosOf(0.0412)).toBe(41_200n);
    expect(costMicrosOf(0.04)).toBe(40_000n);
    expect(costMicrosOf(0)).toBe(0n);
    expect(costMicrosOf(0.0000001)).toBe(1n);
    // A high cost is recorded, capped, never dropped: counting too much is the safe side.
    expect(costMicrosOf(1_000)).toBe(1_000_000_000n);
    expect(costMicrosOf(Number.POSITIVE_INFINITY)).toBe(1_000_000_000_000n);
    for (const nonsense of [-1, Number.NaN, '0.05', null]) {
      expect(costMicrosOf(nonsense)).toBeNull();
    }
  });
});

describe('failures', { timeout: SLOW_MS }, () => {
  it('map refusals, timeouts and provider errors to the existing codes', async () => {
    const cases: [string, (call: FetchCall) => Response | Promise<Response>, string][] = [
      [
        '403 moderation',
        () => jsonResponse({ error: { code: 403, message: 'flagged' } }, 403),
        'REFUSED',
      ],
      [
        '400 content policy',
        () => jsonResponse({ error: { code: 'moderation_blocked', message: 'x' } }, 400),
        'REFUSED',
      ],
      [
        '400 other',
        () => jsonResponse({ error: { code: 400, message: 'bad input' } }, 400),
        'PROVIDER_ERROR',
      ],
      ['401', () => jsonResponse({ error: { code: 401 } }, 401), 'PROVIDER_ERROR'],
      ['402 credits', () => jsonResponse({ error: { code: 402 } }, 402), 'PROVIDER_ERROR'],
      ['408', () => jsonResponse({ error: { code: 408 } }, 408), 'TIMEOUT'],
      ['429', () => jsonResponse({ error: { code: 429 } }, 429), 'PROVIDER_ERROR'],
      ['502', () => jsonResponse({ error: { code: 502 } }, 502), 'PROVIDER_ERROR'],
      [
        'content filter',
        () =>
          jsonResponse(
            answer(null, { choices: [{ finish_reason: 'content_filter', message: {} }] }),
          ),
        'REFUSED',
      ],
      [
        'refusal text',
        () =>
          jsonResponse(
            answer(null, {
              choices: [{ finish_reason: 'stop', message: { refusal: 'I cannot.' } }],
            }),
          ),
        'REFUSED',
      ],
      ['text only', () => jsonResponse(answer(null)), 'PROVIDER_ERROR'],
      [
        'error in a 200',
        () => jsonResponse({ error: { code: 502, message: 'upstream' } }),
        'PROVIDER_ERROR',
      ],
      ['not JSON', () => new Response('<html>', { status: 200 }), 'PROVIDER_ERROR'],
      [
        'unreachable',
        () => {
          throw new TypeError('fetch failed');
        },
        'PROVIDER_ERROR',
      ],
      [
        'a redirect',
        () => {
          throw new TypeError('unexpected redirect');
        },
        'PROVIDER_ERROR',
      ],
    ];
    for (const [name, respond, code] of cases) {
      ledger = new RecordingImageLedger();
      const { generator } = generatorWith(respond);
      expect(await failureOf(generator.generate(brief(), undefined, JOB)), name).toBe(code);
      // Every call that may have been sent is settled, never released.
      expect(
        ledger.settled.map(({ settlement }) => settlement.outcome),
        name,
      ).toHaveLength(1);
      expect(ledger.settled[0]?.settlement.outcome, name).not.toBe('not-sent');
    }
  });

  it('time out within the bound, keeping the whole reservation', async () => {
    const { generator } = generatorWith(hanging, 50);
    expect(await failureOf(generator.generate(brief(), undefined, JOB))).toBe('TIMEOUT');
    expect(ledger.settled).toEqual([
      {
        chargeId: ledger.reserved[0]?.chargeId,
        settlement: {
          outcome: 'timeout',
          costMicros: null,
          returnedModel: null,
          providerRequestId: null,
        },
      },
    ]);
  });

  it('refuse an answer larger than any image', async () => {
    const huge = 'A'.repeat(41 * 1024 * 1024);
    const { generator } = generatorWith(() => new Response(huge, { status: 200 }));
    expect(await failureOf(generator.generate(brief(), undefined, JOB))).toBe('PROVIDER_ERROR');
  });
});

describe('the key', { timeout: SLOW_MS }, () => {
  it('never reaches a log, an error, or the ledger, on any path', async () => {
    const png = await picture(64, 64);
    const responders: ((call: FetchCall) => Response | Promise<Response>)[] = [
      () => jsonResponse(answer(dataUrl(png))),
      () => jsonResponse({ error: { code: 403, message: `echo ${KEY}` } }, 403),
      () => jsonResponse({ error: { message: `bad key ${KEY}` } }, 400),
      () => jsonResponse({ error: { code: 401, message: KEY } }, 401),
      () => jsonResponse(answer(`data:image/png;base64,${Buffer.from(KEY).toString('base64')}`)),
      () => {
        throw new TypeError(`connect failed for ${KEY}`);
      },
      () => new Response(randomBytes(64), { status: 500 }),
    ];
    const seen: string[] = [];
    for (const respond of responders) {
      const { generator } = generatorWith(respond);
      try {
        await generator.generate(brief(), undefined, JOB);
      } catch (error) {
        seen.push(String(error), JSON.stringify(error), (error as Error).stack ?? '');
        expect((error as Error).cause).toBeUndefined();
      }
    }
    seen.push(...lines, asText(ledger.reserved), asText(ledger.settled));
    expect(lines.length).toBeGreaterThan(0);
    for (const text of seen) expect(text).not.toContain(KEY);
  });
});

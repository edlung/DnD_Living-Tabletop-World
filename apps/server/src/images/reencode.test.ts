import { randomBytes } from 'node:crypto';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { MAX_EDGE_PX, MAX_STORED_BYTES, hasAllowedSignature, reencodeImage } from './reencode.ts';

/**
 * Re-encoding a provider's image (docs/STAGE_330_DESIGN.md): a WebP of at most 1,536 px and
 * 1.5 MB with no metadata, processed like the curated set (a figure's black to transparency, a
 * battle map to 4:3); anything else fails as `PROVIDER_ERROR`.
 */
const solid = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } });

const codeOf = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'SUCCEEDED',
    (error: unknown) => (error as { code?: string }).code ?? 'NO_CODE',
  );

/** Real images, seeds and imports: generous under a loaded machine (the unit default is 5 s). */
const SLOW_MS = 30_000;

describe('re-encoding', { timeout: SLOW_MS }, () => {
  it('fits a large image of any accepted format within 1,536 px and 1.5 MB, without metadata', async () => {
    for (const format of ['png', 'jpeg', 'webp'] as const) {
      const input = await solid(3_000, 2_000, '#8c5a32')
        .withMetadata({ exif: { IFD0: { Copyright: 'SECRET-PROVENANCE' } } })
        .toFormat(format)
        .toBuffer();
      const output = await reencodeImage(input, 'image');
      const meta = await sharp(output).metadata();
      expect(meta.format, format).toBe('webp');
      expect([meta.width, meta.height], format).toEqual([MAX_EDGE_PX, 1_024]);
      expect(output.byteLength).toBeLessThanOrEqual(MAX_STORED_BYTES);
      expect(meta.exif, format).toBeUndefined();
      expect(Buffer.from(output).toString('latin1')).not.toContain('SECRET-PROVENANCE');
    }
    // Never enlarged.
    const small = await reencodeImage(await solid(300, 200, '#123456').png().toBuffer(), 'image');
    expect((await sharp(small).metadata()).width).toBe(300);
  });

  it('lowers the quality before giving up, and gives up on what never fits', async () => {
    const noise = await sharp(randomBytes(512 * 512 * 3), {
      raw: { width: 512, height: 512, channels: 3 },
    })
      .png()
      .toBuffer();
    const best = await reencodeImage(noise, 'image');
    const tighter = await reencodeImage(noise, 'image', best.byteLength - 1);
    expect(tighter.byteLength).toBeLessThan(best.byteLength);
    expect(await codeOf(reencodeImage(noise, 'image', 1_000))).toBe('PROVIDER_ERROR');
  });

  it('cuts a figure out of its flat black background', async () => {
    const body = await solid(200, 300, '#c08040').png().toBuffer();
    // A dark detail inside the figure stays opaque: only black reachable from the edge goes.
    const eye = await solid(10, 10, '#000000').png().toBuffer();
    const figure = await solid(600, 600, '#000000')
      .composite([
        { input: body, left: 200, top: 150 },
        { input: eye, left: 295, top: 200 },
      ])
      .png()
      .toBuffer();
    const cut = await reencodeImage(figure, 'figure');
    const meta = await sharp(cut).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBeLessThanOrEqual(202);
    expect(meta.height).toBeLessThanOrEqual(302);
    const { data, info } = await sharp(cut).raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    const eyeX = Math.round(info.width / 2);
    const eyeY = Math.round((info.height * 55) / 300);
    expect(alphaAt(eyeX, eyeY)).toBe(255);

    // A large figure is scaled down before its background is cut out.
    const large = await solid(4_000, 4_000, '#000000')
      .composite([
        { input: await solid(1_000, 2_000, '#c08040').png().toBuffer(), left: 1_500, top: 1_000 },
      ])
      .png()
      .toBuffer();
    const scaled = await sharp(await reencodeImage(large, 'figure')).metadata();
    expect(Math.max(scaled.width, scaled.height)).toBeLessThanOrEqual(MAX_EDGE_PX);
    expect(scaled.hasAlpha).toBe(true);
  });

  it('crops a battle map to the encounter grid’s 4:3, whatever shape it came in', async () => {
    for (const [width, height] of [
      [1_600, 900],
      [900, 1_600],
      [1_200, 900],
    ] as const) {
      const map = await reencodeImage(
        await solid(width, height, '#556b2f').png().toBuffer(),
        'battle-map',
      );
      const meta = await sharp(map).metadata();
      expect(meta.width / meta.height, `${String(width)}x${String(height)}`).toBeCloseTo(4 / 3, 2);
    }
  });

  it('refuses what is not a PNG, JPEG or WebP image', async () => {
    const gif = await solid(8, 8, '#ffffff').gif().toBuffer();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
    for (const input of [gif, svg, Buffer.from('not an image'), new Uint8Array()]) {
      expect(await codeOf(reencodeImage(input, 'image'))).toBe('PROVIDER_ERROR');
    }
  });

  it('looks at the signature before any decoder runs (Gate 07, G07-09)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><script>1</script></svg>',
    );
    const tiff = await solid(8, 8, '#112233').tiff().toBuffer();
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
    for (const bytes of [svg, tiff, gif, Buffer.alloc(0), randomBytes(64)]) {
      expect(hasAllowedSignature(bytes)).toBe(false);
      expect(await codeOf(reencodeImage(bytes, 'image'))).toBe('PROVIDER_ERROR');
    }
    for (const format of ['png', 'jpeg', 'webp'] as const) {
      const bytes = await solid(8, 8, '#112233').toFormat(format).toBuffer();
      expect(hasAllowedSignature(bytes)).toBe(true);
    }
  });
});

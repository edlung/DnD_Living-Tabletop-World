import { describe, expect, it } from 'vitest';

import type { ImageBrief } from './images.ts';
import { ImageGenerationError, imageFailureCode } from './images.ts';
import {
  PLACEHOLDER_MODEL,
  createPlaceholderImageGenerator,
  placeholderSvg,
} from './placeholder-images.ts';

/** The local placeholder generator (owner decision, ADR 0022 §3). */
const brief = (changes: Partial<ImageBrief> = {}): ImageBrief => ({
  seed: 'authoring.p1#0',
  subject: {
    entityId: 'secret-entity',
    kind: 'npc',
    name: 'Sable SECRETNAME',
    description: 'SECRETDESCRIPTION',
  },
  variant: 'reference',
  purpose: 'image',
  label: null,
  note: 'SECRETNOTE',
  basedOn: null,
  reference: null,
  ...changes,
});

describe('the placeholder image generator', () => {
  it('is deterministic and makes every request its own image', async () => {
    const generator = createPlaceholderImageGenerator();
    const first = await generator.generate(brief());
    expect(first.mediaType).toBe('image/svg+xml');
    expect(first.model).toBe(PLACEHOLDER_MODEL);
    expect(generator.id).toBe('local');
    expect((await generator.generate(brief())).bytes).toEqual(first.bytes);
    expect(placeholderSvg(brief({ seed: 'authoring.p1#1' }))).not.toBe(placeholderSvg(brief()));
    // A derived variant is framed, and differs from its reference.
    const derived = placeholderSvg(
      brief({ variant: 'derived', label: 'night', basedOn: 'sha256:00' }),
    );
    expect(derived).not.toBe(placeholderSvg(brief()));
    expect(derived).toContain('stroke-width');
  });

  it('draws no text, reads no name, description, or note, and holds no script', () => {
    const svg = placeholderSvg(brief());
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    for (const forbidden of [
      'SECRET',
      'Sable',
      '<text',
      '<script',
      'href',
      'on',
      '<foreignObject',
    ]) {
      expect(svg.replace(/<rect|width|height|none/g, '')).not.toContain(forbidden);
    }
    // Changing what the brief says about the entity changes nothing drawn, nor do the purpose
    // and the reference bytes it was given (ADR 0035).
    expect(
      placeholderSvg(
        brief({
          subject: { entityId: 'other', kind: 'location', name: 'Other', description: null },
          note: null,
          purpose: 'battle-map',
          reference: { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/webp' },
        }),
      ),
    ).toBe(svg);
  });

  it('reports failures by code', () => {
    expect(imageFailureCode(new ImageGenerationError('REFUSED', 'no'))).toBe('REFUSED');
    expect(imageFailureCode(new Error('boom'))).toBe('PROVIDER_ERROR');
  });
});

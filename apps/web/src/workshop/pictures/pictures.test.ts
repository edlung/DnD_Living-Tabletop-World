import type { DraftImageSubject, DraftVisualManifest } from '@ltw/contracts';
import { LanguageProvider } from '@ltw/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { usePictureActions } from './actions.ts';
import { PictureForm } from './form.tsx';
import { pictureSlot } from './words.ts';

const subject: DraftImageSubject = {
  entityId: 'character',
  name: 'Traveler',
  kind: 'character',
  appearance: 'Default unrelated appearance',
  style: 'Default unrelated style',
  allowedPurposes: ['image', 'figure'],
  referenceHash: null,
  briefs: [
    {
      purpose: 'image',
      appearance: 'Red cloak with a silver clasp',
      style: 'Watercolor on parchment',
    },
    { purpose: 'figure', appearance: 'Standing traveler', style: 'Whole figure, clear silhouette' },
  ],
};
const actions: ReturnType<typeof usePictureActions> = {
  state: 'idle',
  conflict: null,
  busy: false,
  send: vi.fn(),
  retry: vi.fn(),
  reset: vi.fn(),
};
const manifest: DraftVisualManifest = {
  revision: 1,
  version: 0,
  packageDigest: 'digest',
  digest: 'manifest',
  entries: [],
  createdAt: '2026-10-30T12:00:00Z',
};

describe('draft picture preparation', () => {
  it('uses only the supported reference and derived slots', () => {
    expect(pictureSlot('id', 'image')).toEqual({
      entityId: 'id',
      purpose: 'image',
      variant: 'reference',
      label: null,
    });
    expect(pictureSlot('id', 'figure')).toEqual({
      entityId: 'id',
      purpose: 'figure',
      variant: 'derived',
      label: 'figure',
    });
    expect(pictureSlot('id', 'battle-map')).toEqual({
      entityId: 'id',
      purpose: 'battle-map',
      variant: 'derived',
      label: 'battle-map',
    });
  });
  it('shows the exact per-purpose brief instead of the fallback notes or narrative', () => {
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, {
        language: 'en',
        children: createElement(PictureForm, {
          draftId: 'draft',
          subject,
          manifest,
          available: true,
          actions,
        }),
      }),
    );
    expect(html).toContain('Red cloak with a silver clasp');
    expect(html).toContain('Watercolor on parchment');
    expect(html).not.toContain('Default unrelated');
    expect(html).not.toContain('Whole figure');
    expect(html).toContain('Note to the image model (optional)');
  });
  it('keeps a missing route visibly blocked before submitting a new job', () => {
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, {
        language: 'en',
        children: createElement(PictureForm, {
          draftId: 'draft',
          subject,
          manifest,
          available: false,
          actions,
        }),
      }),
    );
    expect(html).toMatch(/type="submit" disabled=""/);
    expect(actions.send).not.toHaveBeenCalled();
  });
});

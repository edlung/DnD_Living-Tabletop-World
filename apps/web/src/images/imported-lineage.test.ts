import type { AssetLineageResponse, AssetView } from '@ltw/contracts';
import { LanguageProvider } from '@ltw/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import '../i18n/ru-images.ts';
import { ApprovedCard, type Context } from './image-cards.tsx';
import { entityImages, pendingWork, repeatCommand } from './lineage.ts';

const uuid = '46fbcc0c-530c-4e60-8734-b974c40b3c4f';
const digest = `sha256:${'a'.repeat(64)}`;
const imported: AssetView = {
  assetId: 'imported-portrait',
  requestId: 'bootstrap-adoption',
  entityId: 'ferryman',
  purpose: 'image',
  variant: 'reference',
  label: null,
  audience: 'players',
  version: 1,
  derivedFrom: null,
  contentHash: digest,
  mediaType: 'image/webp',
  generator: { provider: 'original-provider', model: 'original-model' },
  status: 'CANONICAL',
  origin: {
    draftId: uuid,
    revision: 7,
    candidateId: uuid,
    jobId: uuid,
    sourceSignature: digest,
    referenceHash: null,
    manifestDigest: digest,
  },
};
const lineage: AssetLineageResponse = {
  assets: [imported],
  requests: [],
  canonical: [{ entityId: 'ferryman', assetId: imported.assetId }],
  descriptions: [],
  wishes: [],
};
const context: Context = {
  name: 'Arden',
  place: 'details',
  subject: (text) => text,
  full: (text) => text,
};

describe('canonical images imported from preparation', () => {
  it('shows an approved image without inventing an in-play request, worker state or pending work', () => {
    expect(entityImages(lineage, 'ferryman')).toEqual({
      approved: [{ asset: imported, request: null }],
      candidates: [],
      working: [],
      failed: [],
      canonical: true,
    });
    expect(pendingWork(lineage)).toEqual([]);
    expect(repeatCommand(imported, null)).toEqual({
      type: 'RequestAsset',
      entityId: 'ferryman',
      variant: 'reference',
      audience: 'players',
    });
  });

  it('describes the actual preparation source to the DM in both languages without printing opaque IDs', () => {
    const card = createElement(ApprovedCard, {
      shown: { asset: imported, request: null },
      context,
      onReplace: () => {},
    });
    const english = renderToStaticMarkup(
      createElement(LanguageProvider, { language: 'en', children: card }),
    );
    const russian = renderToStaticMarkup(
      createElement(LanguageProvider, { language: 'ru', children: card }),
    );
    expect(english).toContain('Imported from campaign preparation');
    expect(english).toContain('Source revision: 7');
    expect(russian).toContain('Перенесено из подготовки кампании');
    expect(russian).toContain('Исходная версия: 7');
    expect(english).not.toContain(uuid);
    expect(english).not.toContain('Your note to the image model');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { WorkshopClient } from '../client.ts';
import { DraftPreviewApi } from './api.ts';
import { previewEntitySchema, previewViewSchema } from './schemas.ts';
import { previewMatches, previewQuery, previewScopeKey } from './scope.ts';

const characterId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const ref = { entityId: characterId, kind: 'character' as const, name: 'Traveler' };
const scope = { revision: 2, perspective: 'CHARACTER' as const, characterId };
const view = {
  revision: 2,
  language: 'en',
  campaignName: 'World',
  worldName: 'World',
  manifestDigest: 'digest',
  directory: [ref],
  locations: [],
  scene: null,
  perspective: { kind: 'CHARACTER' as const, character: ref },
};
const presentation = {
  entityId: characterId,
  kind: 'character',
  observed: true,
  status: 'active',
  vitals: null,
  conditions: [],
  equipment: [],
  weather: null,
  tags: [],
  image: null,
  figure: null,
  battleMap: null,
};
const entity = {
  revision: 2,
  entity: ref,
  perspective: view.perspective,
  knowledge: [],
  presentation: {
    perspective: `CHARACTER:${characterId}`,
    worldTime: 0,
    phase: 'dawn',
    presentation,
  },
};

describe('scoped draft preview transport', () => {
  it('pins revision and character while keeping camera separate from the holder', () => {
    const query = new URLSearchParams(
      previewQuery(scope, { locationId: otherId, encounterId: otherId }),
    );
    expect(Object.fromEntries(query)).toEqual({
      revision: '2',
      perspective: 'CHARACTER',
      characterId,
      locationId: otherId,
    });
    expect(previewQuery({ revision: 3, perspective: 'OWNER' }, { encounterId: otherId })).toContain(
      `encounterId=${otherId}`,
    );
    expect(previewScopeKey(scope)).not.toBe(previewScopeKey({ ...scope, characterId: otherId }));
    expect(previewScopeKey(scope)).not.toBe(previewScopeKey({ ...scope, revision: 3 }));
    expect(previewMatches(scope, { ...view, revision: 3 })).toBe(false);
    expect(previewMatches(scope, { ...view, perspective: { kind: 'OWNER' } })).toBe(false);
    expect(
      previewMatches(scope, {
        ...view,
        perspective: { kind: 'CHARACTER', character: { ...ref, entityId: otherId } },
      }),
    ).toBe(false);
  });

  it('rejects owner chrome, prepared participants and knowledge provenance in character DTOs', () => {
    expect(previewViewSchema.safeParse(view).success).toBe(true);
    for (const extra of [
      { assessment: {} },
      { prepared: { encounterId: otherId } },
      { characters: [ref] },
    ])
      expect(previewViewSchema.safeParse({ ...view, ...extra }).success).toBe(false);
    expect(previewEntitySchema.safeParse(entity).success).toBe(true);
    expect(
      previewEntitySchema.safeParse({ ...entity, ownerDescription: 'Hidden future presence' })
        .success,
    ).toBe(false);
    const knowledge = {
      knowledgeId: otherId,
      knowledgeType: 'RUMOR',
      scope: { kind: 'PUBLIC' },
      statement: 'They say the river sings.',
      subjects: [ref],
      attributedTo: null,
      relations: [],
      knownSince: null,
    };
    expect(previewEntitySchema.safeParse({ ...entity, knowledge: [knowledge] }).success).toBe(true);
    expect(
      previewEntitySchema.safeParse({
        ...entity,
        knowledge: [{ ...knowledge, claim: { secret: true } }],
      }).success,
    ).toBe(false);
  });

  it('rejects a broader response rather than rendering it and binds image bytes to exact scope', async () => {
    const request = vi.fn((path: string) =>
      Promise.resolve(
        path.includes('/content/')
          ? new Response(new Blob(['png'], { type: 'image/png' }))
          : Response.json({ ...view, perspective: { kind: 'OWNER' } }),
      ),
    );
    const client = new WorkshopClient('owner', vi.fn(), request);
    const api = new DraftPreviewApi(client, 'draft', scope);
    await expect(api.view({}, new AbortController().signal)).rejects.toThrow('PREVIEW_UNAVAILABLE');
    expect((await api.image('sha256:hash', new AbortController().signal)).type).toBe('image/png');
    expect(request.mock.calls[1]?.[0]).toBe(
      `/drafts/draft/preview/content/sha256%3Ahash?revision=2&perspective=CHARACTER&characterId=${characterId}`,
    );
  });

  it('checks the nested projection perspective and selected entity too', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        Response.json({ ...entity, presentation: { ...entity.presentation, perspective: 'DM' } }),
      ),
    );
    const api = new DraftPreviewApi(new WorkshopClient('owner', vi.fn(), request), 'draft', scope);
    await expect(api.entity(characterId, new AbortController().signal)).rejects.toThrow(
      'PREVIEW_UNAVAILABLE',
    );
  });
});

import type { CampaignRevision } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { bellCampaign } from '../../../../../packages/domain/src/campaign/testing/bell.ts';
import { testCampaignIdentities } from '../../../../../packages/domain/src/campaign/testing/identities.ts';
import { campaignContentDigest } from '../packages/content.ts';
import { PreviewMaterializer } from './materializer.ts';
import {
  previewContext,
  previewDirectory,
  projectPreview,
  projectPreviewEntity,
  projectPreviewSheet,
} from './projection.ts';

const ownerId = '30000000-0000-4000-8000-000000000001';
function revision(): CampaignRevision {
  const content = bellCampaign();
  const identities = testCampaignIdentities(content);
  return {
    draftId: '30000000-0000-4000-8000-000000000002',
    revision: 1,
    basedOnRevision: 0,
    content,
    identities,
    digest: campaignContentDigest(content, identities),
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt: '2026-10-30T12:00:00.000Z',
  };
}

describe('isolated draft perspective projection', () => {
  it('shows party identities and initial knowledge, omitting all owner secrets and future fights', async () => {
    const input = revision();
    const worlds = new PreviewMaterializer();
    const materialized = await worlds.load(input, ownerId);
    const query = {
      revision: 1,
      perspective: 'CHARACTER',
      characterId: input.identities.entities['alena'] ?? '',
    } as const;
    const context = previewContext(input, ownerId, query, materialized, null);
    if (!context) throw new Error('missing preview');
    const view = projectPreview(context, query);
    expect(view).not.toBeNull();
    expect(Object.keys(view ?? {}).sort()).toEqual(
      [
        'revision',
        'language',
        'campaignName',
        'worldName',
        'perspective',
        'manifestDigest',
        'directory',
        'locations',
        'scene',
      ].sort(),
    );
    expect(context.snapshot.state.roster.size).toBe(0);
    expect(context.snapshot.state.encounter).toBeNull();
    expect(context.snapshot.history.some((event) => event.type === 'CharacterAssigned')).toBe(
      false,
    );
    const ids = view?.directory.map((entity) => entity.entityId);
    expect(ids).toEqual(
      expect.arrayContaining(input.content.party.map((key) => input.identities.entities[key])),
    );
    expect(ids).not.toContain(input.identities.entities['ice-crab']);
    expect(ids).not.toContain(input.identities.entities['sunken-tower']);
    expect(ids).not.toContain(input.identities.entities['resonator']);
    const knowledge = projectPreviewEntity(context, input.identities.entities['iva'] ?? '');
    expect(knowledge?.knowledge.some((record) => record.scope.kind === 'PARTY')).toBe(true);
    expect(knowledge).not.toHaveProperty('ownerDescription');
    const all = JSON.stringify({ view, knowledge });
    expect(all).not.toContain(
      input.content.knowledge.find((record) => record.key === 'device-truth')?.statement,
    );
    expect(all).not.toContain(
      input.content.knowledge.find((record) => record.key === 'iva-confession')?.statement,
    );
    expect(all).not.toContain('sluice-crab');
    expect(all).not.toContain('origin');
    expect(all).not.toContain('localKey');
    const perceived = view?.directory.find(
      (entity) => entity.entityId === input.identities.entities['copper-dust'],
    );
    expect(perceived?.name).toBeNull();
  });

  it('camera navigation to a known remote place creates no travel or observations', async () => {
    const input = revision();
    const materialized = await new PreviewMaterializer().load(input, ownerId);
    const query = {
      revision: 1,
      perspective: 'CHARACTER',
      characterId: input.identities.entities['alena'] ?? '',
      locationId: input.identities.entities['lighthouse'] ?? '',
    } as const;
    const context = previewContext(input, ownerId, query, materialized, null);
    if (!context) throw new Error('missing preview');
    const before = JSON.stringify(context.snapshot);
    const remote = projectPreview(context, query);
    expect(remote?.scene?.location.observed).toBe(false);
    expect(remote?.scene?.location.weather).toBeNull();
    expect(remote?.scene?.location.battleMap).toBeNull();
    expect(remote?.scene?.present).toEqual([]);
    expect(JSON.stringify(context.snapshot)).toBe(before);
    expect(context.snapshot.state.entities.get(query.characterId)?.placement?.locationId).toBe(
      input.identities.entities['dock'],
    );
    expect(
      projectPreview(context, { ...query, locationId: input.identities.entities['sluice'] }),
    ).toBeNull();
    expect(
      projectPreview(context, { ...query, locationId: '30000000-0000-4000-8000-999999999999' }),
    ).toBeNull();
  });

  it('restricts full sheets to self and treats hidden entities like absent ones', async () => {
    const input = revision();
    const materialized = await new PreviewMaterializer().load(input, ownerId);
    const query = {
      revision: 1,
      perspective: 'CHARACTER',
      characterId: input.identities.entities['alena'] ?? '',
    } as const;
    const context = previewContext(input, ownerId, query, materialized, null);
    if (!context) throw new Error('missing preview');
    expect(projectPreviewSheet(context, query.characterId)?.sheet.hitPoints.max).toBeGreaterThan(0);
    expect(projectPreviewSheet(context, input.identities.entities['borin'] ?? '')).toBeNull();
    expect(projectPreviewEntity(context, input.identities.entities['ice-crab'] ?? '')).toBeNull();
    expect(projectPreviewEntity(context, '30000000-0000-4000-8000-999999999999')).toBeNull();
  });

  it('exposes a static prepared layout only to the owner while preserving initial history', async () => {
    const input = revision();
    const encounterId = input.identities.encounters['sluice-crab'] ?? '';
    const worlds = new PreviewMaterializer();
    const initial = await worlds.load(input, ownerId);
    const before = JSON.stringify(initial.snapshot);
    const branch = await worlds.load(input, ownerId, encounterId);
    const query = { revision: 1, perspective: 'OWNER', encounterId } as const;
    const context = previewContext(input, ownerId, query, branch, null);
    if (!context) throw new Error('missing owner branch');
    const view = projectPreview(context, query);
    expect(view?.perspective.kind).toBe('OWNER');
    if (!view || !('prepared' in view)) throw new Error('missing owner layout');
    expect(view.prepared?.layout.combatants).toHaveLength(4);
    expect(Object.keys(view.prepared?.layout ?? {}).sort()).toEqual(['battlefield', 'combatants']);
    expect(JSON.stringify(view.prepared)).not.toMatch(
      /initiative|round|currentCombatantId|reactionWindow|order/,
    );
    expect(JSON.stringify(initial.snapshot)).toBe(before);
    expect(initial.snapshot?.state.encounter).toBeNull();
    expect(
      previewContext(
        input,
        ownerId,
        {
          revision: 1,
          perspective: 'CHARACTER',
          characterId: input.identities.entities['alena'] ?? '',
        },
        branch,
        null,
      ),
    ).toBeNull();
  });

  it('does not reuse worlds across owner/revision/branch boundaries and refuses wrong scope', async () => {
    const input = revision();
    const worlds = new PreviewMaterializer(2);
    const first = await worlds.load(input, ownerId);
    expect(await worlds.load(input, ownerId)).toBe(first);
    expect(await worlds.load(input, '30000000-0000-4000-8000-000000000003')).not.toBe(first);
    expect(await worlds.load({ ...input, revision: 2 }, ownerId)).not.toBe(first);
    expect(await worlds.load(input, ownerId)).not.toBe(first);
    expect(
      previewContext(input, ownerId, { revision: 2, perspective: 'OWNER' }, first, null),
    ).toBeNull();
    const owner = previewContext(
      input,
      ownerId,
      { revision: 1, perspective: 'OWNER' },
      first,
      null,
    );
    if (!owner) throw new Error('missing owner');
    expect(
      projectPreview(owner, {
        revision: 1,
        perspective: 'CHARACTER',
        characterId: input.identities.entities['alena'] ?? '',
      }),
    ).toBeNull();
    expect(previewDirectory(owner)).toHaveLength(input.content.entities.length);
  });
});

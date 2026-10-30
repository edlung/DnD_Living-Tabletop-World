import { describe, expect, it } from 'vitest';

import { bootstrapCampaignAssetSchema, bootstrapCampaignCommandSchema } from '@ltw/contracts';

import { assetViolations } from '../assets/integrity.ts';
import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { createHarness, expectAccepted } from '../kernel/testing/kernel-harness.ts';
import { MAX_CLUES_PER_METHOD } from '../investigation/records.ts';
import { bootstrapCommand, bootstrapHash, OWNER } from './testing/bootstrap.ts';
import { testCampaignIdentities } from './testing/identities.ts';

async function history() {
  const h = createHarness();
  expectAccepted(await h.submit(bootstrapCommand(true), { actor: OWNER, commandId: 'boot' }));
  return h.history();
}

describe('bootstrap replay and durable proof integrity', () => {
  it.each(['PreparedPartyEstablished', 'AssetAdopted', 'CampaignBootstrapped'] as const)(
    'rejects %s attributed to a system actor',
    async (type) => {
      const events = (await history()).map((event) =>
        event.type === type
          ? {
              ...event,
              causation: { ...event.causation, actor: { ...OWNER, kind: 'system' as const } },
            }
          : event,
      );
      expect(() => replay(events)).toThrow(CorruptHistoryError);
    },
  );

  it('rejects an adopted derived picture whose proof names different reference bytes', async () => {
    const events = (await history()).map((event) =>
      event.type === 'AssetAdopted' && event.payload.variant === 'derived'
        ? {
            ...event,
            payload: {
              ...event.payload,
              origin: { ...event.payload.origin, referenceHash: bootstrapHash(90) },
            },
          }
        : event,
    );
    expect(() => replay(events)).toThrow(CorruptHistoryError);
  });

  it('rejects a final provenance record that names another source draft', async () => {
    const events = (await history()).map((event) =>
      event.type === 'CampaignBootstrapped'
        ? {
            ...event,
            payload: {
              ...event.payload,
              source: { ...event.payload.source, draftId: '20000000-0000-4000-8000-000000000090' },
            },
          }
        : event,
    );
    expect(() => replay(events)).toThrow(CorruptHistoryError);
  });

  it('reports detached or changed adopted proof in snapshots, including settled lineage', async () => {
    const state = replay(await history()),
      asset = state.assets.assets.get('boot#0~asset');
    if (!asset?.origin) throw new Error('ADOPTED_ASSET_MISSING');
    const changed = {
        ...asset,
        status: 'RETRACTED' as const,
        origin: { ...asset.origin, draftId: '20000000-0000-4000-8000-000000000090' },
      },
      broken = {
        ...state,
        assets: {
          ...state.assets,
          canonical: new Map(),
          assets: new Map(state.assets.assets).set(changed.assetId, changed),
        },
      };
    expect(assetViolations(broken)).toContain(
      `asset ${asset.assetId} has invalid adopted provenance`,
    );
    const detached = { ...state };
    Reflect.deleteProperty(detached, 'bootstrap');
    expect(assetViolations(detached)).toContain(
      `asset ${asset.assetId} has invalid adopted provenance`,
    );
    expect(checkWorldIntegrity(detached)).toContain(
      'prepared party exists without bootstrap provenance',
    );
  });

  it('leaves no stream if an initial operation fails after provisional entities and knowledge exist', async () => {
    const h = createHarness(),
      command = bootstrapCommand(),
      clue = command.content.clues[0];
    if (!clue) throw new Error('CLUE_MISSING');
    for (let index = 0; index < MAX_CLUES_PER_METHOD; index++)
      command.content.clues.push({ ...clue, key: `extra-clue-${index}` });
    command.identities = testCampaignIdentities(command.content);
    expect(bootstrapCampaignCommandSchema.safeParse(command).success).toBe(true);
    expect(await h.submit(command, { actor: OWNER })).toMatchObject({
      status: 'rejected',
      code: 'INVALID_CLUE',
    });
    expect(await h.engine.load('test-campaign')).toBeNull();
    expect(await h.engine.commandLog('test-campaign')).toEqual([]);
  });

  it('uses the real generator bounds and refuses unknown payload fields and unbounded selections', () => {
    const command = bootstrapCommand(true),
      asset = command.selectedAssets[0];
    if (!asset) throw new Error('ASSET_MISSING');
    expect(
      bootstrapCampaignAssetSchema.safeParse({
        ...asset,
        generator: { provider: 'bad\nprovider', model: 'model' },
      }).success,
    ).toBe(false);
    expect(
      bootstrapCampaignAssetSchema.safeParse({
        ...asset,
        generator: { provider: 'valid-provider', model: 'x'.repeat(101) },
      }).success,
    ).toBe(false);
    expect(bootstrapCampaignAssetSchema.safeParse({ ...asset, hidden: true }).success).toBe(false);
    expect(
      bootstrapCampaignCommandSchema.safeParse({
        ...command,
        selectedAssets: Array.from({ length: 1001 }, () => asset),
      }).success,
    ).toBe(false);
  });
  it('bounds total UTF-8 content even when individual content fields fit their schemas', () => {
    const command = bootstrapCommand(),
      entity = command.content.entities[0];
    if (!entity) throw new Error('ENTITY_MISSING');
    command.content.entities = Array.from({ length: 500 }, (_, index) => ({
      ...entity,
      key: `bounded-${index}`,
      description: '🌍'.repeat(2000),
    }));
    const parsed = bootstrapCampaignCommandSchema.safeParse(command);
    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.some(
          (issue) => issue.message === 'Bootstrap content exceeds its bounded size',
        ),
    ).toBe(true);
  });
});

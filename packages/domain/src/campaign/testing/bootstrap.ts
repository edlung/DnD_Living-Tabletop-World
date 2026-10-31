import type { BootstrapCampaignCommand, CampaignBootstrapAsset } from '@ltw/contracts';

import { bellCampaign } from './bell.ts';
import { testCampaignIdentities } from './identities.ts';

export const OWNER = { actorId: '20000000-0000-4000-8000-000000000001', kind: 'user' as const };
export const bootstrapHash = (n: number) => `sha256:${n.toString(16).padStart(64, '0')}`;
export function bootstrapCommand(withPictures = false): BootstrapCampaignCommand {
  const content = bellCampaign(),
    identities = testCampaignIdentities(content);
  const source = {
    activationId: '20000000-0000-4000-8000-000000000002',
    ownerId: OWNER.actorId,
    draftId: '20000000-0000-4000-8000-000000000003',
    revision: 3,
    packageDigest: bootstrapHash(1),
    planDigest: bootstrapHash(2),
    visualManifestDigest: bootstrapHash(3),
    scenarioDigest: bootstrapHash(4),
    questDigest: bootstrapHash(5),
    lockDigest: bootstrapHash(6),
  };
  const entityId = identities.entities['arden'];
  if (!entityId) throw new Error('FIXTURE_ENTITY_MISSING');
  const reference: CampaignBootstrapAsset = {
    entityId,
    purpose: 'image',
    variant: 'reference',
    label: null,
    audience: 'players',
    contentHash: bootstrapHash(10),
    mediaType: 'image/webp',
    generator: { provider: 'fixture', model: 'offline-image' },
    origin: {
      draftId: source.draftId,
      revision: 1,
      candidateId: '20000000-0000-4000-8000-000000000004',
      jobId: '20000000-0000-4000-8000-000000000005',
      sourceSignature: bootstrapHash(11),
      referenceHash: null,
      manifestDigest: source.visualManifestDigest,
    },
  };
  const figure: CampaignBootstrapAsset = {
    ...reference,
    purpose: 'figure',
    variant: 'derived',
    label: 'figure',
    contentHash: bootstrapHash(12),
    origin: {
      ...reference.origin,
      candidateId: '20000000-0000-4000-8000-000000000006',
      jobId: '20000000-0000-4000-8000-000000000007',
      referenceHash: reference.contentHash,
    },
  };
  return {
    type: 'BootstrapCampaign',
    content,
    identities,
    source,
    visualMode: withPictures ? 'CHOSEN' : 'TEXT_ONLY',
    selectedAssets: withPictures ? [figure, reference] : [],
    confirmation: {
      packageDigest: source.packageDigest,
      planDigest: source.planDigest,
      visualManifestDigest: source.visualManifestDigest,
      reviewDigest: bootstrapHash(7),
      acknowledgedFindingIds: [],
    },
  };
}

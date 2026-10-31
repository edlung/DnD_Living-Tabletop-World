import type {
  CampaignPackage,
  CampaignRevision,
  DraftLockSnapshot,
  DraftLockEntry,
  DraftVisualManifest,
} from '@ltw/contracts';

import { bellCampaign } from '../../testing/bell.ts';
import { testCampaignIdentities } from '../../testing/identities.ts';

export function editRevision(content: CampaignPackage = bellCampaign()): CampaignRevision {
  return {
    draftId: '30000000-0000-4000-8000-000000000002',
    revision: 1,
    basedOnRevision: 0,
    content,
    identities: testCampaignIdentities(content),
    digest: `sha256:${'a'.repeat(64)}`,
    source: { kind: 'OWNER', actorId: '30000000-0000-4000-8000-000000000001' },
    createdAt: '2026-10-30T12:00:00.000Z',
  };
}
export function editManifest(revision: CampaignRevision): DraftVisualManifest {
  return {
    revision: revision.revision,
    version: 0,
    packageDigest: revision.digest,
    digest: `sha256:${'b'.repeat(64)}`,
    entries: [],
    createdAt: revision.createdAt,
  };
}
export function editLocks(
  revision: CampaignRevision,
): Omit<DraftLockSnapshot, 'entries'> & { entries: DraftLockEntry[] } {
  return {
    revision: revision.revision,
    version: 0,
    packageDigest: revision.digest,
    manifestDigest: editManifest(revision).digest,
    digest: `sha256:${'c'.repeat(64)}`,
    entries: [],
    createdAt: revision.createdAt,
  };
}

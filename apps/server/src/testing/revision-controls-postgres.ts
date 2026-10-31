import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import { hashToken, newToken } from '../auth/tokens.ts';
import { PostgresWorkshopStore } from '../workshop/postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../workshop/packages/postgres-store.ts';
import { PostgresDraftImageRepository } from '../workshop/images/postgres-store.ts';
import { PostgresCampaignRevisionControlRepository } from '../workshop/revisions/postgres-store.ts';
import { englishBellCampaign } from './generation/bell-english.ts';
import { grantTestPictures } from './picture-grant.ts';

export async function revisionControlFixture(pool: pg.Pool) {
  const workshop = new PostgresWorkshopStore(pool),
    revisions = new PostgresCampaignRevisionRepository(pool),
    images = new PostgresDraftImageRepository(pool),
    controls = new PostgresCampaignRevisionControlRepository(pool);
  const ownerId = randomUUID(),
    draftId = randomUUID(),
    authSessionId = randomUUID(),
    token = newToken();
  const at = new Date().toISOString(),
    expiresAt = new Date(Date.now() + 86400000).toISOString();
  await workshop.issueInvitation({
    ownerId,
    invitationId: randomUUID(),
    tokenHash: hashToken(token),
    createdAt: at,
    expiresAt,
    authorizationSource: 'test:430-controls',
  });
  await workshop.redeem(
    hashToken(token),
    { sessionId: authSessionId, tokenHash: hashToken(newToken()), createdAt: at, expiresAt },
    null,
  );
  await grantTestPictures(pool, ownerId);
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'en' },
    draftId,
    at,
  );
  const scope = { ownerId, draftId };
  const saved = await revisions.append({
    ...scope,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content: englishBellCampaign(),
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt: at,
  });
  if (saved.kind !== 'saved') throw new Error('TEST_REVISION');
  const revision = saved.revision;
  const manifest = await images.manifest(scope, revision.revision);
  if (!manifest) throw new Error('TEST_MANIFEST');
  const locks = await controls.locks(scope);
  if (!locks) throw new Error('TEST_LOCKS');
  return {
    scope,
    authSessionId,
    workshop,
    revisions,
    images,
    controls,
    revision,
    manifest,
    locks,
    replace: () => ({
      ...scope,
      authSessionId,
      requestId: randomUUID(),
      revision: revision.revision,
      packageDigest: revision.digest,
      expectedLockVersion: 0,
      manifestVersion: manifest.version,
      manifestDigest: manifest.digest,
      targets: [],
    }),
    append: () => ({
      ...scope,
      requestId: randomUUID(),
      basedOnRevision: revision.revision,
      content: structuredClone(revision.content),
      source: { kind: 'OWNER' as const, actorId: ownerId },
      createdAt: at,
    }),
  };
}

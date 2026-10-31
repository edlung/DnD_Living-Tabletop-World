import { randomUUID } from 'node:crypto';

import { buildCampaignEditPlan } from '@ltw/domain';

import { bellCampaign } from '../../../../../packages/domain/src/campaign/testing/bell.ts';
import { hashToken, newToken } from '../../auth/tokens.ts';
import type { AccountingDb } from '../accounting.ts';
import { PostgresWorkshopStore } from '../../workshop/postgres-store.ts';
import { PostgresCampaignGenerationRepository } from '../../workshop/generation/postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../../workshop/packages/postgres-store.ts';
import { PostgresCampaignRevisionControlRepository } from '../../workshop/revisions/postgres-store.ts';
import { PostgresDraftImageRepository } from '../../workshop/images/postgres-store.ts';

export async function editPgFixture(db: AccountingDb) {
  const ownerId = randomUUID(),
    draftId = randomUUID(),
    authSessionId = randomUUID();
  const now =
    (await db.pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]?.now ??
    new Date();
  const createdAt = now.toISOString(),
    expiresAt = new Date(now.getTime() + 86400000).toISOString();
  const workshop = new PostgresWorkshopStore(db.pool),
    tokenHash = hashToken(newToken());
  await workshop.issueInvitation({
    ownerId,
    invitationId: randomUUID(),
    tokenHash,
    createdAt,
    expiresAt,
    authorizationSource: 'test:430',
  });
  await workshop.redeem(
    tokenHash,
    { sessionId: authSessionId, tokenHash: hashToken(newToken()), createdAt, expiresAt },
    null,
  );
  await workshop.createDraft(
    ownerId,
    { requestId: randomUUID(), title: 'Bell', language: 'ru' },
    draftId,
    createdAt,
  );
  const packages = new PostgresCampaignRevisionRepository(db.pool);
  const saved = await packages.append({
    ownerId,
    draftId,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content: bellCampaign(),
    source: { kind: 'OWNER', actorId: ownerId },
    createdAt,
  });
  if (saved.kind !== 'saved') throw new Error('baseline absent');
  const base = saved.revision,
    scope = { ownerId, draftId };
  const controls = new PostgresCampaignRevisionControlRepository(db.pool);
  const images = new PostgresDraftImageRepository(db.pool);
  const locks = await controls.locks(scope),
    manifest = await images.manifest(scope, base.revision);
  if (!locks || !manifest) throw new Error('guards absent');
  const spec = buildCampaignEditPlan(base, locks, manifest, 'Make the opening more urgent.', [
    'section:world',
  ]).spec;
  if (!spec) throw new Error('edit plan absent');
  const repository = new PostgresCampaignGenerationRepository(db.pool, 'EDIT');
  const generation = new PostgresCampaignGenerationRepository(db.pool);
  const input = {
    ...scope,
    authSessionId,
    requestId: randomUUID(),
    basedOnRevision: base.revision,
    seed: base.content,
    lockVersion: locks.version,
    editSpec: spec,
  };
  const enqueue = async () => {
    const result = await repository.enqueueEdit(input);
    if (result.kind !== 'saved') throw new Error('edit absent');
    return { ...scope, jobId: result.job.jobId };
  };
  return {
    ownerId,
    draftId,
    authSessionId,
    workshop,
    packages,
    controls,
    images,
    base,
    locks,
    manifest,
    spec,
    repository,
    generation,
    input,
    enqueue,
  };
}

import { randomUUID } from 'node:crypto';

import {
  CAMPAIGN_GENERATION_STAGES,
  campaignActivationAnswerSchema,
  campaignActivationReviewSchema,
  ownedCampaignListSchema,
  type CampaignEditingContext,
  type CampaignGenerationJob,
  type CampaignGenerationView,
  type CampaignPreviewCatalog,
  type CampaignPreviewEntityView,
  type CampaignPreviewView,
  type CampaignRevision,
  type CampaignRevisionReview,
  type CampaignRevisionView,
  type CreatedInvitationResponse,
  type KnowledgeListResponse,
  type SessionResponse,
} from '@ltw/contracts';
import { checkWorldIntegrity, replay } from '@ltw/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { grantPreparationApproval } from '../../ai/accounting/preparation-sessions.ts';
import { TEST_AUTH } from '../../testing/accounting.ts';
import { activationRequest } from '../../testing/activation-fixture.ts';
import { integratedCampaignFixture } from '../../testing/integrated-campaign/fixture.ts';

type Fixture = Awaited<ReturnType<typeof integratedCampaignFixture>>;
const opened: Fixture[] = [];
afterEach(async () => {
  for (const fixture of opened.splice(0)) await fixture.close();
});
async function revisionOf(f: Fixture): Promise<CampaignRevision> {
  const answer = await f.sendOwner('GET', `${f.url}/package`);
  expect(answer.statusCode).toBe(200);
  const view = answer.json<CampaignRevisionView>();
  expect(view.assessment.readiness).toBe('READY');
  if (!view.revision) throw new Error('TEST_REVISION_MISSING');
  return view.revision;
}
async function generate(f: Fixture) {
  expect(await f.packages.latest(f.scope.ownerId, f.scope.draftId)).toBeNull();
  const accepted = await f.sendOwner('POST', `${f.url}/generation`, {
    requestId: randomUUID(),
    basedOnRevision: 0,
    brief: f.content.brief,
  });
  expect(accepted.statusCode, accepted.body).toBe(200);
  const job = accepted.json<{ job: CampaignGenerationJob }>().job;
  f.transport.bind({ ...f.scope, jobId: job.jobId, mode: 'GENERATE' });
  await f.generationWorker.run({ ...f.scope, jobId: job.jobId });
  await f.tasks.idle();
  const status = await f.sendOwner('GET', `${f.url}/generation/${job.jobId}`),
    view = status.json<CampaignGenerationView>();
  expect(view.job).toMatchObject({ status: 'SUCCEEDED', nextStep: 7, attachedRevision: 1 });
  expect(view.steps.map((step) => step.stage)).toEqual(CAMPAIGN_GENERATION_STAGES);
  expect(view.steps.every((step) => step.status === 'SUCCEEDED')).toBe(true);
  expect(f.transport.admissions.map((step) => step.stage)).toEqual(CAMPAIGN_GENERATION_STAGES);
  const revision = await revisionOf(f);
  expect(revision.source).toMatchObject({ kind: 'AI', jobId: job.jobId, provider: 'anthropic' });
  expect(revision.content.knowledge).toEqual(f.content.knowledge);
  expect(revision.content.encounters).toEqual(f.content.encounters);
  // Restarting the durable worker reuses all seven stored results without transport.
  await f.generationWorker.run({ ...f.scope, jobId: job.jobId });
  expect(f.transport.calls).toHaveLength(7);
  return revision;
}
async function inspectPrivatePreview(f: Fixture, revision: CampaignRevision) {
  const catalogResponse = await f.sendOwner('GET', `${f.url}/preview/catalog?revision=1`),
    catalog = catalogResponse.json<CampaignPreviewCatalog>();
  expect(catalogResponse.statusCode).toBe(200);
  expect(catalog.characters).toHaveLength(3);
  expect(catalog.encounters).toHaveLength(1);
  const owner = await f.sendOwner('GET', `${f.url}/preview?revision=1&perspective=OWNER`);
  expect(owner.statusCode).toBe(200);
  expect(owner.json<CampaignPreviewView>()).toMatchObject({
    perspective: { kind: 'OWNER' },
    assessment: { readiness: 'READY' },
  });
  const characterId = revision.identities.entities['alena'],
    query = `revision=1&perspective=CHARACTER&characterId=${characterId}`;
  const character = await f.sendOwner('GET', `${f.url}/preview?${query}`);
  expect(character.statusCode).toBe(200);
  expect(character.json<CampaignPreviewView>()).toMatchObject({
    perspective: { kind: 'CHARACTER' },
    scene: { location: { entityId: revision.identities.entities['dock'] } },
  });
  expect(character.json()).not.toHaveProperty('assessment');
  expect(character.json()).not.toHaveProperty('prepared');
  expect(character.body).not.toContain(revision.identities.entities['ice-crab']);
  const iva = await f.sendOwner(
    'GET',
    `${f.url}/preview/entities/${revision.identities.entities['iva']}?${query}`,
  );
  expect(iva.statusCode).toBe(200);
  expect(iva.json<CampaignPreviewEntityView>()).not.toHaveProperty('ownerDescription');
  expect(iva.body).not.toContain('WORLD_TRUTH');
  for (const secret of revision.content.knowledge.filter(
    (record) => record.knowledgeType === 'SECRET',
  ))
    expect(iva.body).not.toContain(secret.statement);
  expect(
    (await f.sendOwner('GET', `${f.url}/preview/entities/${characterId}/sheet?${query}`))
      .statusCode,
  ).toBe(200);
  const hidden = await f.sendOwner(
    'GET',
    `${f.url}/preview/entities/${revision.identities.entities['ice-crab']}?${query}`,
  );
  const absent = await f.sendOwner('GET', `${f.url}/preview/entities/${randomUUID()}?${query}`);
  expect(hidden.statusCode).toBe(404);
  expect(absent.statusCode).toBe(404);
  expect(hidden.json<{ error: unknown }>().error).toEqual(absent.json<{ error: unknown }>().error);
  expect(
    (await f.db.pool.query<{ n: number }>('SELECT count(*)::int n FROM ltw_commands')).rows[0]?.n,
  ).toBe(0);
}
async function editAndAdopt(f: Fixture, base: CampaignRevision) {
  const context = (await f.sendOwner('GET', `${f.url}/editing`)).json<CampaignEditingContext>();
  const input = {
    revision: base.revision,
    packageDigest: base.digest,
    expectedLockVersion: context.locks.version,
    manifestVersion: context.manifest.version,
    manifestDigest: context.manifest.digest,
    instruction: 'Emphasize present urgency without deciding any future outcome.',
    targets: ['section:world'],
  };
  expect((await f.sendOwner('POST', `${f.url}/edits/plan`, input)).statusCode).toBe(200);
  const accepted = await f.sendOwner('POST', `${f.url}/edits`, {
    ...input,
    requestId: randomUUID(),
  });
  expect(accepted.statusCode).toBe(200);
  const job = accepted.json<{ job: CampaignGenerationJob }>().job,
    proposal = structuredClone(base.content);
  proposal.world.opening += ' A fresh crack in the river ice makes the warning urgent.';
  f.transport.bind({ ...f.scope, jobId: job.jobId, mode: 'EDIT', proposal });
  await f.editWorker.run({ ...f.scope, jobId: job.jobId });
  await f.tasks.idle();
  expect((await f.packages.latest(f.scope.ownerId, f.scope.draftId))?.revision).toBe(1);
  const reviewed = await f.sendOwner('GET', `${f.url}/edits/${job.jobId}/review`);
  expect(reviewed.statusCode).toBe(200);
  const review = reviewed.json<CampaignRevisionReview>();
  expect(review).toMatchObject({ kind: 'EDIT', adoptable: true, issues: [], conflicts: [] });
  expect(review.changes.map((change) => change.path.join('.'))).toEqual(['world.opening']);
  const body = {
    requestId: randomUUID(),
    basedOnRevision: review.before.revision,
    packageDigest: review.before.digest,
    expectedLockVersion: review.locks.version,
    manifestVersion: review.manifest.version,
    manifestDigest: review.manifest.digest,
    reviewDigest: review.reviewDigest,
    candidateDigest: review.candidateDigest,
  };
  const adopted = await f.sendOwner('POST', `${f.url}/edits/${job.jobId}/adopt`, body);
  expect(adopted.statusCode, adopted.body).toBe(200);
  const revision = await revisionOf(f);
  expect(revision).toMatchObject({ revision: 2, source: { kind: 'AI', jobId: job.jobId } });
  expect(revision.identities).toEqual(base.identities);
  expect(revision.content).toEqual(proposal);
  expect(await f.packages.get(f.scope.ownerId, f.scope.draftId, 1)).toEqual(base);
  expect(f.transport.calls).toHaveLength(8);
  return revision;
}
async function structuralCorrection(f: Fixture, base: CampaignRevision) {
  const context = (await f.sendOwner('GET', `${f.url}/editing`)).json<CampaignEditingContext>(),
    content = structuredClone(base.content);
  content.entities.push({
    key: 'mooring-post',
    kind: 'feature',
    name: 'The Mooring Post',
    description: 'A weathered wooden post beside the open dock path.',
    status: 'active',
    existsSince: null,
    placement: { location: 'dock', since: null },
  });
  const saved = await f.sendOwner('POST', `${f.url}/revisions`, {
    requestId: randomUUID(),
    basedOnRevision: base.revision,
    content,
    expectedLockVersion: context.locks.version,
    expectedManifestVersion: context.manifest.version,
    expectedManifestDigest: context.manifest.digest,
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const revision = await revisionOf(f);
  expect(revision).toMatchObject({
    revision: 3,
    basedOnRevision: 2,
    source: { kind: 'OWNER', actorId: f.scope.ownerId },
  });
  expect(revision.identities.entities['alena']).toBe(base.identities.entities['alena']);
  expect(revision.identities.entities['mooring-post']).toMatch(/^[0-9a-f-]{36}$/);
  const comparison = await f.sendOwner('GET', `${f.url}/compare?from=2&to=3`);
  expect(comparison.statusCode).toBe(200);
  expect(comparison.json<CampaignRevisionReview>().changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'ADDED',
        targetId: 'section:entities',
        path: ['entities', 'mooring-post'],
      }),
    ]),
  );
  return revision;
}

describe('isolated admitted campaign creation through ordinary play', () => {
  it('keeps seven-step preparation, private preview, reviewed edit and explicit activation on the genuine PG path', async () => {
    const f = await integratedCampaignFixture();
    opened.push(f);
    const base = await generate(f);
    await inspectPrivatePreview(f, base);
    const edited = await editAndAdopt(f, base),
      revision = await structuralCorrection(f, edited);
    // Stored drafts can activate when another provider dispatch is no longer permitted.
    await grantPreparationApproval(f.db.pool, {
      approvalId: 'integrated-offline',
      ownerId: f.scope.ownerId,
      enabled: false,
      authorization: TEST_AUTH,
    });
    expect((await f.preparation.availability(f.scope.ownerId)).available).toBe(false);
    const inspected = await f.sendOwner('GET', `${f.url}/activation-review?textOnly=true`);
    expect(inspected.statusCode).toBe(200);
    const review = campaignActivationReviewSchema.parse(inspected.json<unknown>());
    expect(review).toMatchObject({
      confirmable: true,
      revision: 3,
      textOnly: true,
      packageDigest: revision.digest,
    });
    const request = activationRequest(review),
      accepted = await f.sendOwner('POST', `${f.url}/activation`, request);
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.headers['set-cookie']).toBeUndefined();
    const activation = campaignActivationAnswerSchema.parse(accepted.json<unknown>()).activation;
    if (!activation) throw new Error('TEST_ACTIVATION_ABSENT');
    expect(await f.engine.load(activation.campaignId)).toBeNull();
    expect(
      (await f.sendOwner('POST', `/workshop/campaigns/${activation.campaignId}/sign-in`, {}))
        .statusCode,
    ).toBe(404);
    await f.activationWorker.run({ ...f.scope, activationId: activation.activationId });
    expect(await f.activationRepository.status(f.scope)).toMatchObject({
      status: 'PUBLISHED',
      phase: 'PUBLISHED',
      revision: 3,
    });
    const initial = await f.engine.load(activation.campaignId);
    if (!initial) throw new Error('TEST_PUBLISHED_SNAPSHOT');
    expect(initial.state.bootstrap?.source.packageDigest).toBe(revision.digest);
    expect(initial.state.preparedParty?.size).toBe(3);
    expect(initial.state.roster.size).toBe(0);
    expect(initial.state.assets.assets.size).toBe(0);
    const frozen = await f.initialContent.get(activation.campaignId);
    expect(frozen?.scenario).toEqual(revision);
    const listed = await f.sendOwner('GET', '/workshop/campaigns');
    expect(listed.statusCode).toBe(200);
    expect(
      ownedCampaignListSchema
        .parse(listed.json<unknown>())
        .campaigns.map((item) => item.campaignId),
    ).toEqual([activation.campaignId]);

    const entry = await f.sendOwner(
      'POST',
      `/workshop/campaigns/${activation.campaignId}/sign-in`,
      {},
    );
    expect(entry.statusCode).toBe(200);
    const dmCookie = await f.redeemGame(entry.json<{ link: string }>().link),
      campaignUrl = `/campaigns/${activation.campaignId}`;
    const session = await f.sendGame('GET', `${campaignUrl}/session`, dmCookie);
    expect(session.json<SessionResponse>()).toMatchObject({ actorId: f.scope.ownerId, role: 'DM' });
    const characterId = revision.identities.entities['alena'];
    const invited = await f.sendGame('POST', `${campaignUrl}/invitations`, dmCookie, {
      characterId,
    });
    expect(invited.statusCode).toBe(201);
    const playerCookie = await f.redeemGame(invited.json<CreatedInvitationResponse>().link);
    const playerSession = await f.sendGame('GET', `${campaignUrl}/session`, playerCookie);
    expect(playerSession.json<SessionResponse>()).toMatchObject({
      role: 'PLAYER',
      character: { entityId: characterId },
    });
    const knowledge = await f.sendGame(
      'GET',
      `${campaignUrl}/knowledge?perspective=CHARACTER:${characterId}`,
      playerCookie,
    );
    expect(knowledge.statusCode).toBe(200);
    expect(
      knowledge
        .json<KnowledgeListResponse>()
        .knowledge.some(
          (record) => record.knowledgeId === revision.identities.knowledge['initial-request'],
        ),
    ).toBe(true);
    const initialKnown = revision.content.knowledge
      .filter(
        (record) =>
          record.scope.kind === 'PUBLIC' ||
          record.scope.kind === 'PARTY' ||
          (record.scope.kind === 'CHARACTER' && record.scope.holder === 'alena'),
      )
      .map((record) => revision.identities.knowledge[record.key])
      .sort();
    expect(
      knowledge
        .json<KnowledgeListResponse>()
        .knowledge.map((record) => record.knowledgeId)
        .sort(),
    ).toEqual(initialKnown);
    for (const secret of revision.content.knowledge.filter(
      (record) => record.knowledgeType === 'SECRET',
    ))
      expect(knowledge.body).not.toContain(secret.statement);
    expect(knowledge.body).not.toMatch(/WORLD_TRUTH|"origin"|canonicalEvents|preparedParty/);
    const play = await f.sendGame('POST', `${campaignUrl}/commands`, dmCookie, {
      commandId: 'first-minute-of-play',
      command: { type: 'AdvanceWorldTime', by: 60 },
    });
    expect(play.statusCode, play.body).toBe(200);
    expect(play.json()).toMatchObject({ status: 'accepted' });
    const played = await f.engine.load(activation.campaignId);
    if (!played) throw new Error('TEST_PLAYED_SNAPSHOT');
    expect(played.state.clock).toBe(initial.state.clock + 60);
    expect(played.state.roster.size).toBe(1);
    expect(checkWorldIntegrity(played.state)).toEqual([]);
    expect(replay(played.history)).toEqual(played.state);
    expect(await f.initialContent.get(activation.campaignId)).toEqual(frozen);
    expect(
      (await f.engine.commandLog(activation.campaignId)).map((command) => command.commandType),
    ).toEqual(['BootstrapCampaign', 'AssignCharacter', 'AdvanceWorldTime']);
    expect(f.transport.calls).toHaveLength(8);
    expect(new Set(f.transport.admissions.map((call) => call.traceId)).size).toBe(8);
    expect(new Set(f.transport.admissions.map((call) => call.preparationSessionId)).size).toBe(2);
    expect(f.accountingIssues).toEqual([]);
    const journal = await f.db.pool.query<{ kind: string; charged: boolean }>(
      'SELECT kind,charge_micros>0 charged FROM ltw_ai_accounting',
    );
    expect(journal.rows).toHaveLength(8);
    expect(journal.rows.every((row) => row.kind === 'settled' && row.charged)).toBe(true);
    const requests = await f.db.pool.query<{
      subject_kind: string;
      campaign_id: null;
      session_class: string;
    }>('SELECT subject_kind,campaign_id,session_class FROM ltw_ai_requests');
    expect(requests.rows).toEqual(
      Array.from({ length: 8 }, () => ({
        subject_kind: 'workshop',
        campaign_id: null,
        session_class: 'preparation',
      })),
    );
    expect(
      (await f.db.pool.query<{ n: number }>('SELECT count(*)::int n FROM ltw_ai_traces')).rows[0]
        ?.n,
    ).toBe(8);
  });
});

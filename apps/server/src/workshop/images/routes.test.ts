import { randomUUID } from 'node:crypto';

import type { CampaignPreviewView, DraftImageJob, DraftVisualManifest } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { workshopImageHttpHarness } from '../../testing/workshop-image-http.ts';
import { bellCampaign } from '../../../../../packages/domain/src/campaign/testing/bell.ts';

const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
async function setup() {
  const t = await workshopImageHttpHarness();
  opened.push(t.app);
  return t;
}

describe('owner draft pictures HTTP and exact scoped bytes', () => {
  it('never lists or serves a hidden selected subject and preserves stale bytes only for owner comparison', async () => {
    const content = bellCampaign();
    content.visuals.push({
      entity: 'ice-crab',
      purpose: 'image',
      description: 'A pale frost-crab on an icy shore.',
      style: 'Painted fantasy.',
    });
    const t = await workshopImageHttpHarness(content);
    opened.push(t.app);
    const { candidate } = await t.generate(t.revision.identities.entities['ice-crab'] ?? '');
    expect(
      (
        await t.send(`${t.url}/images/selection`, t.owner.cookie, {
          method: 'POST',
          body: await t.selectionBody(candidate),
        })
      ).statusCode,
    ).toBe(200);
    const character = `revision=1&perspective=CHARACTER&characterId=${t.revision.identities.entities['alena']}`;
    const restricted = await t.send(`${t.url}/preview?${character}`, t.owner.cookie);
    expect(restricted.body).not.toContain(candidate.entityId);
    expect(restricted.body).not.toContain(candidate.contentHash);
    expect(restricted.body).not.toContain('Ледяной краб');
    expect(
      (
        await t.send(
          `${t.url}/preview/content/${encodeURIComponent(candidate.contentHash)}?${character}`,
          t.owner.cookie,
        )
      ).statusCode,
    ).toBe(404);
    const ownerPath = `${t.url}/preview/content/${encodeURIComponent(candidate.contentHash)}?perspective=OWNER&revision=`;
    expect((await t.send(`${ownerPath}1`, t.owner.cookie)).statusCode).toBe(200);
    const other = await t.login();
    expect((await t.send(`${ownerPath}1`, other.cookie)).statusCode).toBe(404);
    const changed = structuredClone(t.revision.content);
    const visual = changed.visuals.find((entry) => entry.entity === 'ice-crab');
    if (!visual) throw new Error('missing visual fixture');
    visual.description = 'A different shell and silhouette.';
    expect(
      (
        await t.packages.append({
          ownerId: t.owner.ownerId,
          draftId: t.draftId,
          requestId: randomUUID(),
          basedOnRevision: 1,
          content: changed,
          source: { kind: 'OWNER', actorId: t.owner.ownerId },
          createdAt: t.revision.createdAt,
        })
      ).kind,
    ).toBe('saved');
    expect((await t.send(`${ownerPath}2`, t.owner.cookie)).statusCode).toBe(404);
    expect((await t.send(`${ownerPath}1`, t.owner.cookie)).statusCode).toBe(200);
    expect(
      (
        await t.send(
          `${t.url}/images/content/${encodeURIComponent(candidate.contentHash)}?revision=2`,
          t.owner.cookie,
        )
      ).statusCode,
    ).toBe(200);
  });
  it('shows exact permitted art briefs and no narrative descriptions or other-owner content', async () => {
    const t = await setup();
    const view = await t.view();
    expect(view.availability.available).toBe(true);
    expect(view.candidates).toEqual([]);
    const subject = view.subjects.find(
      (entry) => entry.entityId === t.revision.identities.entities['iva'],
    );
    expect(subject?.briefs.map((entry) => entry.purpose)).toEqual(['image', 'figure']);
    expect(JSON.stringify(view.subjects)).not.toContain('исправить свою ошибку');
    expect(subject?.appearance).toBe(
      t.revision.content.visuals.find((entry) => entry.entity === 'iva')?.description,
    );
    const other = await t.login();
    expect((await t.send(`${t.url}/images?revision=1`, other.cookie)).statusCode).toBe(404);
    expect((await t.send(`${t.url}/images?revision=1`, 'ltw_session=dm')).statusCode).toBe(401);
    expect(
      (await t.send(`${t.url}/images?revision=1&entityId=${randomUUID()}`, t.owner.cookie))
        .statusCode,
    ).toBe(404);
  });

  it('replays an accepted nonce before fresh availability/CAS checks and whitelists job responses', async () => {
    const t = await setup();
    const { job, candidate, body } = await t.generate(
      t.revision.identities.entities['arden'] ?? '',
    );
    const chosen = await t.send(`${t.url}/images/selection`, t.owner.cookie, {
      method: 'POST',
      body: await t.selectionBody(candidate),
    });
    expect(chosen.statusCode).toBe(200);
    t.script.available = false;
    const replay = await t.send(`${t.url}/images/jobs`, t.owner.cookie, { method: 'POST', body });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ job: DraftImageJob }>().job.jobId).toBe(job.jobId);
    expect(replay.body).not.toMatch(
      /authSessionId|workerId|sourceSignature|requestDigest|appearance|localKey|chargeId/,
    );
    expect(
      (
        await t.send(`${t.url}/images/jobs`, t.owner.cookie, {
          method: 'POST',
          body: { ...body, note: 'Different intent' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await t.send(`${t.url}/images/jobs`, t.owner.cookie, {
          method: 'POST',
          body: { ...body, requestId: randomUUID() },
        })
      ).statusCode,
    ).toBe(422);
    expect(t.script.calls).toHaveLength(1);
  });

  it('keeps a candidate private until chosen, serves identical selected bytes and removes authorization on deselection', async () => {
    const t = await setup();
    const { candidate } = await t.generate(t.revision.identities.entities['arden'] ?? '');
    const query = `revision=1&perspective=CHARACTER&characterId=${t.revision.identities.entities['alena']}`;
    const bytesPath = `${t.url}/preview/content/${encodeURIComponent(candidate.contentHash)}?${query}`;
    expect((await t.view()).manifest.entries).toEqual([]);
    expect((await t.send(bytesPath, t.owner.cookie)).statusCode).toBe(404);
    const ownerBytes = await t.send(
      `${t.url}/images/content/${encodeURIComponent(candidate.contentHash)}?revision=1`,
      t.owner.cookie,
    );
    expect(ownerBytes.statusCode).toBe(200);
    const selection = await t.selectionBody(candidate);
    const chosen = await t.send(`${t.url}/images/selection`, t.owner.cookie, {
      method: 'POST',
      body: selection,
    });
    expect(chosen.statusCode).toBe(200);
    const replay = await t.send(`${t.url}/images/selection`, t.owner.cookie, {
      method: 'POST',
      body: selection,
    });
    expect(replay.json<{ manifest: DraftVisualManifest }>().manifest.version).toBe(1);
    const playerBytes = await t.send(bytesPath, t.owner.cookie);
    expect(playerBytes.statusCode).toBe(200);
    expect(playerBytes.rawPayload).toEqual(ownerBytes.rawPayload);
    const view = (
      await t.send(`${t.url}/preview?${query}`, t.owner.cookie)
    ).json<CampaignPreviewView>();
    expect(
      view.scene?.present.find((entry) => entry.entityId === candidate.entityId)?.image
        ?.contentHash,
    ).toBe(candidate.contentHash);
    expect(JSON.stringify(view)).not.toMatch(
      /candidateId|sourceSignature|referenceHash|provider|model|localKey/,
    );
    expect(
      (
        await t.send(`${t.url}/images/selection`, t.owner.cookie, {
          method: 'POST',
          body: { ...selection, requestId: randomUUID(), candidateId: null },
        })
      ).statusCode,
    ).toBe(409);
    const remove = await t.selectionBody(candidate, null);
    expect(
      (await t.send(`${t.url}/images/selection`, t.owner.cookie, { method: 'POST', body: remove }))
        .statusCode,
    ).toBe(200);
    expect((await t.send(bytesPath, t.owner.cookie)).statusCode).toBe(404);
    expect(await t.events.loadStream(t.draftId)).toBeNull();
  });

  it('requires a chosen raster reference and withholds a known remote map from character preview', async () => {
    const t = await setup();
    const locationId = t.revision.identities.entities['lighthouse'] ?? '';
    const premature = await t.requestBody(locationId, 'battle-map');
    expect(
      (await t.send(`${t.url}/images/jobs`, t.owner.cookie, { method: 'POST', body: premature }))
        .statusCode,
    ).toBe(422);
    const reference = await t.generate(locationId);
    expect(
      (
        await t.send(`${t.url}/images/selection`, t.owner.cookie, {
          method: 'POST',
          body: await t.selectionBody(reference.candidate),
        })
      ).statusCode,
    ).toBe(200);
    const map = await t.generate(locationId, 'battle-map');
    expect(map.candidate.referenceHash).toBe(reference.candidate.contentHash);
    expect(
      (
        await t.send(`${t.url}/images/selection`, t.owner.cookie, {
          method: 'POST',
          body: await t.selectionBody(map.candidate),
        })
      ).statusCode,
    ).toBe(200);
    const query = `revision=1&perspective=CHARACTER&characterId=${t.revision.identities.entities['alena']}`;
    const remote = (
      await t.send(`${t.url}/preview?${query}&locationId=${locationId}`, t.owner.cookie)
    ).json<CampaignPreviewView>();
    expect(remote.scene?.location.image?.contentHash).toBe(reference.candidate.contentHash);
    expect(remote.scene?.location.battleMap).toBeNull();
    expect(
      (
        await t.send(
          `${t.url}/preview/content/${encodeURIComponent(map.candidate.contentHash)}?${query}`,
          t.owner.cookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await t.send(
          `${t.url}/preview/content/${encodeURIComponent(map.candidate.contentHash)}?revision=1&perspective=OWNER`,
          t.owner.cookie,
        )
      ).statusCode,
    ).toBe(200);
    const replacement = await t.generate(locationId);
    expect(
      (
        await t.send(`${t.url}/images/selection`, t.owner.cookie, {
          method: 'POST',
          body: await t.selectionBody(replacement.candidate),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await t.view()).manifest.entries.find((entry) => entry.purpose === 'battle-map')?.state,
    ).toBe('STALE');
  });

  it('rejects forged inputs/cursors/candidates and cancels without exposing internal job data', async () => {
    const t = await setup();
    const body = await t.requestBody(t.revision.identities.entities['iva'] ?? '');
    expect(
      (
        await t.send(`${t.url}/images/jobs`, t.owner.cookie, {
          method: 'POST',
          body: { ...body, provider: 'forged' },
        })
      ).statusCode,
    ).toBe(400);
    const requested = await t.send(`${t.url}/images/jobs`, t.owner.cookie, {
      method: 'POST',
      body,
    });
    expect(requested.statusCode).toBe(200);
    const job = requested.json<{ job: DraftImageJob }>().job;
    expect(
      (await t.send(`${t.url}/images?revision=1&jobsBefore=${randomUUID()}`, t.owner.cookie))
        .statusCode,
    ).toBe(404);
    const cancelled = await t.send(`${t.url}/images/jobs/${job.jobId}/cancel`, t.owner.cookie, {
      method: 'POST',
      body: {},
    });
    expect(cancelled.json<{ job: DraftImageJob }>().job.status).toBe('CANCELLED');
    expect(cancelled.body).not.toMatch(/input|authSessionId|workerId|chargeId/);
    await t.worker.run({ ownerId: t.owner.ownerId, draftId: t.draftId, jobId: job.jobId });
    expect(t.script.calls).toEqual([]);
    expect(
      (
        await t.send(`${t.url}/images/selection`, t.owner.cookie, {
          method: 'POST',
          body: { ...body, note: undefined, candidateId: randomUUID() },
        })
      ).statusCode,
    ).toBe(409);
  });
});

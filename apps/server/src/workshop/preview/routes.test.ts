import { randomUUID } from 'node:crypto';

import type {
  CampaignPreviewCatalog,
  CampaignPreviewEntityView,
  CampaignPreviewView,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { bellCampaign } from '../../../../../packages/domain/src/campaign/testing/bell.ts';
import { PREVIEW_T0, workshopPreviewHarness } from '../../testing/workshop-preview.ts';

const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});
async function setup(content = bellCampaign()) {
  const harness = await workshopPreviewHarness({ content });
  opened.push(harness.app);
  return harness;
}

describe('private visual preview HTTP', () => {
  it('binds sign-out to the mounted owner and cannot clear a newer credential after delayed completion', async () => {
    const t = await setup();
    const newer = await t.login();
    const stale = await t.send('/workshop/auth/sign-out', newer.cookie, {
      method: 'POST',
      owner: t.owner.ownerId,
      body: {},
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.headers['set-cookie']).toBeUndefined();
    expect((await t.send('/workshop/auth/session', newer.cookie)).statusCode).toBe(200);
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const signOut = t.store.signOut.bind(t.store);
    t.store.signOut = async (hash, at) => {
      await signOut(hash, at);
      entered();
      await wait;
    };
    const leaving = t.send('/workshop/auth/sign-out', t.owner.cookie, {
      method: 'POST',
      owner: t.owner.ownerId,
      body: {},
    });
    void leaving.then(() => undefined);
    await started;
    const latest = await t.login();
    release();
    const response = await leaving;
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect((await t.send('/workshop/auth/session', t.owner.cookie)).statusCode).toBe(401);
    expect((await t.send('/workshop/auth/session', latest.cookie)).statusCode).toBe(200);
  });
  it('never expires a newer browser cookie through an old revoked request response', async () => {
    const t = await setup();
    const newer = await t.login();
    await t.store.revokeOwner(
      t.owner.ownerId,
      new Date(PREVIEW_T0).toISOString(),
      'test:old-session',
    );
    for (const path of [
      `${t.url}/preview?revision=1&perspective=OWNER`,
      '/workshop/auth/session',
    ]) {
      const stale = await t.send(path, t.owner.cookie, { owner: t.owner.ownerId });
      expect(stale.statusCode).toBe(401);
      expect(stale.headers['set-cookie']).toBeUndefined();
    }
    expect((await t.send('/workshop/auth/session', newer.cookie)).statusCode).toBe(200);
  });
  it('serves owner catalog, scoped initial scenes and self sheet without a live stream', async () => {
    const t = await setup();
    const catalogResponse = await t.send(`${t.url}/preview/catalog?revision=1`, t.owner.cookie);
    expect(catalogResponse.statusCode).toBe(200);
    expect(catalogResponse.headers['cache-control']).toBe('no-store');
    const catalog = catalogResponse.json<CampaignPreviewCatalog>();
    expect(catalog.characters).toHaveLength(3);
    expect(catalog.encounters).toHaveLength(1);
    const characterId = t.revision.identities.entities['alena'] ?? '';
    const query = `revision=1&perspective=CHARACTER&characterId=${characterId}`;
    const response = await t.send(`${t.url}/preview?${query}`, t.owner.cookie);
    expect(response.statusCode).toBe(200);
    const view = response.json<CampaignPreviewView>();
    expect(view.perspective.kind).toBe('CHARACTER');
    expect(view.scene?.location.entityId).toBe(t.revision.identities.entities['dock']);
    expect(view).not.toHaveProperty('assessment');
    expect(view).not.toHaveProperty('prepared');
    expect(response.body).not.toContain(t.revision.identities.entities['ice-crab']);
    const iva = await t.send(
      `${t.url}/preview/entities/${t.revision.identities.entities['iva']}?${query}`,
      t.owner.cookie,
    );
    expect(iva.statusCode).toBe(200);
    expect(iva.json<CampaignPreviewEntityView>()).not.toHaveProperty('ownerDescription');
    expect(iva.body).not.toContain('WORLD_TRUTH');
    expect(iva.body).not.toContain('NPC');
    const sheet = await t.send(
      `${t.url}/preview/entities/${characterId}/sheet?${query}`,
      t.owner.cookie,
    );
    expect(sheet.statusCode).toBe(200);
    expect(
      (
        await t.send(
          `${t.url}/preview/entities/${t.revision.identities.entities['borin']}/sheet?${query}`,
          t.owner.cookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(await t.events.loadStream(t.draftId)).toBeNull();
    expect(await t.events.loadCommands(t.draftId)).toEqual([]);
  });

  it('makes inaccessible entity/place/image and absent resources indistinguishable', async () => {
    const t = await setup();
    const query = `revision=1&perspective=CHARACTER&characterId=${t.revision.identities.entities['alena']}`;
    for (const id of [t.revision.identities.entities['ice-crab'], randomUUID()]) {
      expect(
        (await t.send(`${t.url}/preview/entities/${id}?${query}`, t.owner.cookie)).json(),
      ).toMatchObject({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    for (const id of [t.revision.identities.entities['sluice'], randomUUID()]) {
      expect(
        (await t.send(`${t.url}/preview?${query}&locationId=${id}`, t.owner.cookie)).statusCode,
      ).toBe(404);
    }
    expect(
      (await t.send(`${t.url}/preview/content/sha256:${'1'.repeat(64)}?${query}`, t.owner.cookie))
        .statusCode,
    ).toBe(404);
    const remote = (
      await t.send(
        `${t.url}/preview?${query}&locationId=${t.revision.identities.entities['lighthouse']}`,
        t.owner.cookie,
      )
    ).json<CampaignPreviewView>();
    expect(remote.scene?.present).toEqual([]);
    expect(remote.scene?.location.observed).toBe(false);
    const initial = (
      await t.send(`${t.url}/preview?${query}`, t.owner.cookie)
    ).json<CampaignPreviewView>();
    expect(initial.scene?.location.entityId).toBe(t.revision.identities.entities['dock']);
  });

  it('does not accept fake prepared-party/owner fields or future fights in character mode', async () => {
    const t = await setup();
    const scope = `revision=1&perspective=CHARACTER&characterId=${t.revision.identities.entities['alena']}`;
    for (const extra of [
      `encounterId=${t.revision.identities.encounters['sluice-crab']}`,
      'memberIds=fake',
      'scopes=ALL',
      'ownerId=fake',
      'perspective=OWNER',
    ]) {
      expect((await t.send(`${t.url}/preview?${scope}&${extra}`, t.owner.cookie)).statusCode).toBe(
        400,
      );
    }
    expect(
      (
        await t.send(
          `${t.url}/preview?revision=1&perspective=OWNER&characterId=${t.revision.identities.entities['alena']}`,
          t.owner.cookie,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await t.send(
          `${t.url}/preview?revision=1&perspective=CHARACTER&characterId=${t.revision.identities.entities['iva']}`,
          t.owner.cookie,
        )
      ).statusCode,
    ).toBe(404);
    const owner = await t.send(
      `${t.url}/preview?revision=1&perspective=OWNER&encounterId=${t.revision.identities.encounters['sluice-crab']}`,
      t.owner.cookie,
    );
    expect(owner.statusCode).toBe(200);
    expect(owner.body).toContain('Ледяной краб');
    expect(owner.body).not.toMatch(/initiative|currentCombatantId|reactionWindow|"round"|"order"/);
    expect(await t.events.loadStream(t.draftId)).toBeNull();
  });

  it('rejects foreign/game credentials and rechecks revocation even for cached worlds', async () => {
    const t = await setup();
    const other = await t.login();
    const paths = [
      `${t.url}/preview/catalog?revision=1`,
      `${t.url}/preview?revision=1&perspective=OWNER`,
      `${t.url}/preview/entities/${t.revision.identities.entities['alena']}?revision=1&perspective=OWNER`,
    ];
    for (const path of paths) {
      expect((await t.send(path, 'ltw_session=campaign-dm')).statusCode).toBe(401);
      expect((await t.send(path, other.cookie)).statusCode).toBe(404);
      const stale = await t.send(path, other.cookie, { owner: t.owner.ownerId });
      expect(stale.statusCode).toBe(409);
      expect(stale.headers['set-cookie']).toBeUndefined();
      expect((await t.send(path, t.owner.cookie)).statusCode).toBe(200);
    }
    await t.store.revokeOwner(t.owner.ownerId, new Date(PREVIEW_T0).toISOString(), 'test:revoke');
    for (const path of paths) expect((await t.send(path, t.owner.cookie)).statusCode).toBe(401);
  });

  it('shows invalid assessment to owner and no owner findings in a character failure', async () => {
    const content = bellCampaign();
    const iva = content.entities.find((entity) => entity.key === 'iva');
    if (!iva?.placement) throw new Error('missing fixture placement');
    iva.placement.location = 'absent';
    const t = await setup(content);
    const owner = await t.send(`${t.url}/preview?revision=1&perspective=OWNER`, t.owner.cookie);
    expect(owner.statusCode).toBe(200);
    expect(owner.json<CampaignPreviewView>()).toMatchObject({
      assessment: { readiness: 'INVALID' },
      scene: null,
      directory: [],
    });
    const restricted = await t.send(
      `${t.url}/preview?revision=1&perspective=CHARACTER&characterId=${t.revision.identities.entities['alena']}`,
      t.owner.cookie,
    );
    expect(restricted.statusCode).toBe(422);
    expect(restricted.body).not.toContain('absent');
    expect(restricted.body).not.toContain('findings');
  });
});

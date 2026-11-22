import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  campaignLibraryResponseSchema,
  campaignPackageSchema,
  type CampaignLibraryResponse,
} from '@ltw/contracts';
import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { disabledAuthenticator } from '../http/auth.ts';
import { buildApp } from '../http/app.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { testAiGateway, testAssets, testAuthoring, testDm } from '../testing/ravenford-app.ts';
import { MemoryWorkshopStore } from '../testing/workshop-store.ts';
import { issueWorkshopInvitation } from '../workshop/service.ts';
import { CAMPAIGN_LIBRARY_DIR, loadCampaignLibrary } from './library.ts';

const library = await loadCampaignLibrary();
const ORIGIN = 'https://table.example';
const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

describe('the campaign library', () => {
  it('loads the shipped campaigns with their packages, covers and checked pictures', () => {
    expect(library.entries.length).toBeGreaterThanOrEqual(8);
    for (const entry of library.entries) {
      expect(entry.variants.map((v) => v.id)).toContain(entry.defaultVariant);
      expect(entry.pictures).toBeGreaterThan(30);
      const cover = library.cover(entry.id);
      expect(cover && Buffer.from(cover.subarray(8, 12)).toString('latin1')).toBe('WEBP');
      for (const variant of entry.variants) {
        const content = campaignPackageSchema.parse(
          JSON.parse(library.packageJson(entry.id, variant.id) ?? ''),
        );
        expect(content.party).toHaveLength(variant.players);
      }
    }
    expect(library.packageJson('no-such-campaign', '4-players')).toBeNull();
    expect(library.cover('no-such-campaign')).toBeNull();
  });

  it('refuses a library whose package or picture changed after it was built', async () => {
    const first = library.entries[0];
    if (!first) throw new Error('empty library');
    const copy = await mkdtemp(join(tmpdir(), 'ltw-library-'));
    try {
      await cp(CAMPAIGN_LIBRARY_DIR, copy, { recursive: true });
      const file = join(copy, first.id, 'packages', `${first.defaultVariant}.json`);
      const content = JSON.parse(await readFile(file, 'utf8')) as { world: { name: string } };
      content.world.name = `${content.world.name} (edited)`;
      await writeFile(file, JSON.stringify(content));
      await expect(loadCampaignLibrary(copy)).rejects.toThrow('package digest changed');
      await cp(CAMPAIGN_LIBRARY_DIR, copy, { recursive: true, force: true });
      const index = join(copy, first.id, 'library.json');
      const stored = JSON.parse(await readFile(index, 'utf8')) as {
        pictures: { sha256: string }[];
      };
      const picture = stored.pictures[0];
      if (!picture) throw new Error('no pictures');
      picture.sha256 = '0'.repeat(64);
      await writeFile(index, JSON.stringify(stored));
      await expect(loadCampaignLibrary(copy)).rejects.toThrow('does not match its SHA-256');
      await cp(CAMPAIGN_LIBRARY_DIR, copy, { recursive: true, force: true });
      const book = join(copy, first.id, 'book.json');
      await writeFile(book, (await readFile(book, 'utf8')).replace('"layer":1', '"layer":2'));
      await expect(loadCampaignLibrary(copy)).rejects.toThrow('book.json changed');
    } finally {
      await rm(copy, { recursive: true, force: true });
    }
  });

  it('lists the library and serves a package and a cover to a signed-in workshop owner only', async () => {
    const deps = {
      store: new MemoryWorkshopStore(),
      publicOrigin: ORIGIN,
      clock: { now: () => Date.parse('2026-11-14T10:00:00.000Z') },
      limits: new RequestLimits(SIGN_IN_LIMITS, () => Date.parse('2026-11-14T10:00:00.000Z')),
      library,
    };
    const app = buildApp({
      engine: new WorldEngine({
        store: new InMemoryEventStore(),
        ids: new SequentialIds(),
        clock: new SteppingClock(),
      }),
      authenticator: disabledAuthenticator,
      logger: createLogger({ service: 'library-test', level: 'silent' }),
      ai: testAiGateway(),
      authoring: testAuthoring(),
      dm: testDm(),
      assets: testAssets(),
      quests: [],
      workshop: deps,
    });
    opened.push(app);
    await app.ready();
    const get = (url: string, cookie = '') =>
      app.inject({ method: 'GET', url, headers: { origin: ORIGIN, cookie } });
    expect((await get('/workshop/library')).statusCode).toBe(401);
    const issued = await issueWorkshopInvitation(deps, {
      ownerId: randomUUID(),
      hours: 24,
      authorizationSource: 'library-test',
    });
    const redeemed: LightMyRequestResponse = await app.inject({
      method: 'POST',
      url: '/workshop/auth/redeem',
      headers: { origin: ORIGIN },
      payload: { token: issued.link.split('#')[1] },
    });
    const header = redeemed.headers['set-cookie'];
    const cookie = (typeof header === 'string' ? header : (header?.[0] ?? '')).split(';')[0] ?? '';
    const listed = await get('/workshop/library', cookie);
    expect(listed.statusCode).toBe(200);
    const body: CampaignLibraryResponse = campaignLibraryResponseSchema.parse(listed.json());
    expect(body.campaigns.map((c) => c.id)).toEqual(library.entries.map((e) => e.id));
    const first = body.campaigns[0];
    if (!first) throw new Error('empty library');
    const pkg = await get(`/workshop/library/${first.id}/packages/${first.defaultVariant}`, cookie);
    expect(pkg.statusCode).toBe(200);
    expect(campaignPackageSchema.safeParse(pkg.json()).success).toBe(true);
    const cover = await get(`/workshop/library/${first.id}/cover`, cookie);
    expect(cover.statusCode).toBe(200);
    expect(cover.headers['content-type']).toBe('image/webp');
    expect(
      (await get(`/workshop/library/${first.id}/packages/99-players`, cookie)).statusCode,
    ).toBe(404);
    expect((await get('/workshop/library/../packages/x', cookie)).statusCode).not.toBe(200);
  });
});

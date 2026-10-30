import { randomUUID } from 'node:crypto';

import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import type { ApiErrorResponse, WorkshopDraftList } from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { hashToken, newToken } from '../auth/tokens.ts';
import { disabledAuthenticator } from '../http/auth.ts';
import { buildApp } from '../http/app.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { testAiGateway, testAssets, testAuthoring, testDm } from '../testing/ravenford-app.ts';
import { MemoryWorkshopStore } from '../testing/workshop-store.ts';
import { signInTable } from '../testing/sign-in.ts';
import { issueWorkshopInvitation, type WorkshopDependencies } from './service.ts';

const ORIGIN = 'https://table.example';
const T0 = Date.parse('2026-10-30T10:00:00.000Z');
const opened: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
});

function cookieOf(response: LightMyRequestResponse): string {
  const value = response.headers['set-cookie'];
  return (typeof value === 'string' ? value : (value?.[0] ?? '')).split(';')[0] ?? '';
}

async function table() {
  let now = T0;
  const store = new MemoryWorkshopStore();
  const deps: WorkshopDependencies = {
    store,
    publicOrigin: ORIGIN,
    clock: { now: () => now },
    limits: new RequestLimits(SIGN_IN_LIMITS, () => now),
  };
  const engine = new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  const app = buildApp({
    engine,
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'workshop-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: [],
    workshop: deps,
  });
  opened.push(app);
  await app.ready();
  const send = (method: 'GET' | 'POST', url: string, cookie = '', body?: object) =>
    app.inject({
      method,
      url,
      headers: { origin: ORIGIN, cookie },
      ...(body ? { payload: body } : {}),
    });
  const invite = async (ownerId = randomUUID()) =>
    issueWorkshopInvitation(deps, {
      ownerId,
      hours: 24,
      authorizationSource: 'owner-chat:stage-380',
    });
  const login = async (ownerId = randomUUID()) => {
    const issued = await invite(ownerId);
    const response = await send('POST', '/workshop/auth/redeem', '', {
      token: issued.link.split('#')[1],
    });
    expect(response.statusCode).toBe(200);
    return { ownerId, cookie: cookieOf(response), issued, response };
  };
  return {
    app,
    engine,
    store,
    deps,
    send,
    invite,
    login,
    setNow: (value: number) => {
      now = value;
    },
  };
}

describe('workshop identity and private draft containers', () => {
  it('rejects draft intent from a stale tab whose owner was replaced, without clearing the new cookie', async () => {
    const t = await table();
    const a = await t.login();
    const b = await t.login();
    const stale = await t.app.inject({
      method: 'POST',
      url: '/workshop/drafts',
      headers: { origin: ORIGIN, cookie: b.cookie, 'x-workshop-owner': a.ownerId },
      payload: { requestId: randomUUID(), title: 'Old owner intent', language: 'en' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.headers['set-cookie']).toBeUndefined();
    expect(
      (await t.send('GET', '/workshop/drafts', b.cookie)).json<WorkshopDraftList>().drafts,
    ).toEqual([]);
    expect((await t.send('GET', '/workshop/auth/session', b.cookie)).statusCode).toBe(200);
  });
  it('keeps a real campaign sign-in independent during workshop join, access and sign-out; logs no credentials', async () => {
    const t = await table();
    const lines: string[] = [];
    const real = await signInTable({
      workshop: t.deps,
      logger: createLogger({
        service: 'dual-access',
        level: 'info',
        destination: {
          write: (line) => {
            lines.push(line);
          },
        },
      }),
    });
    opened.push(real.app);
    const dmCookie = await real.signInWith(await real.dmInvitation());
    expect(
      (await real.send('GET', '/campaigns/ravenford/session', { cookie: dmCookie })).statusCode,
    ).toBe(200);
    expect((await real.send('GET', '/workshop/drafts', { cookie: dmCookie })).statusCode).toBe(401);
    const issued = await t.invite();
    const invitationToken = issued.link.split('#')[1] ?? '';
    const joined = await real.send(
      'POST',
      '/workshop/auth/redeem',
      { cookie: dmCookie },
      { token: invitationToken },
    );
    expect(joined.statusCode).toBe(200);
    const workshopCookie = cookieOf(joined);
    const both = `${dmCookie}; ${workshopCookie}`;
    expect((await real.send('GET', '/workshop/drafts', { cookie: both })).statusCode).toBe(200);
    expect(
      (await real.send('GET', '/campaigns/ravenford/session', { cookie: both })).statusCode,
    ).toBe(200);
    expect(
      (await real.send('GET', '/campaigns/ravenford/session', { cookie: workshopCookie }))
        .statusCode,
    ).toBe(401);
    const leaving = await real.send('POST', '/workshop/auth/sign-out', { cookie: both }, {});
    expect(leaving.headers['set-cookie']).toBeUndefined();
    expect(
      (await real.send('GET', '/campaigns/ravenford/session', { cookie: dmCookie })).statusCode,
    ).toBe(200);
    const logs = lines.join('');
    for (const secret of [dmCookie, workshopCookie, invitationToken, hashToken(invitationToken)])
      expect(logs).not.toContain(secret);
  });

  it('pages a long private shelf without hiding drafts or accepting another owner cursor', async () => {
    const t = await table();
    const owner = await t.login();
    for (let n = 0; n < 51; n++)
      await t.store.createDraft(
        owner.ownerId,
        {
          requestId: randomUUID(),
          title: `Draft ${n}`,
          language: 'en',
        },
        randomUUID(),
        new Date(T0 + n).toISOString(),
      );
    const first = (await t.send('GET', '/workshop/drafts', owner.cookie)).json<{
      drafts: { draftId: string }[];
      nextCursor: string;
    }>();
    expect(first.drafts).toHaveLength(50);
    const rest = (
      await t.send('GET', `/workshop/drafts?after=${first.nextCursor}`, owner.cookie)
    ).json<{ drafts: { draftId: string }[]; nextCursor: null }>();
    expect(rest.drafts).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
    expect(new Set([...first.drafts, ...rest.drafts].map((d) => d.draftId)).size).toBe(51);
    const other = await t.login();
    expect(
      (await t.send('GET', `/workshop/drafts?after=${first.nextCursor}`, other.cookie)).statusCode,
    ).toBe(404);
  });

  it('creates a private draft without a campaign, and retries the same request idempotently', async () => {
    const t = await table();
    const owner = await t.login();
    const input = { requestId: randomUUID(), title: 'Колокол подо льдом', language: 'ru' };
    const created = await t.send('POST', '/workshop/drafts', owner.cookie, input);
    expect(created.statusCode).toBe(200);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.headers['vary']).toBe('Cookie');
    const draft = created.json<{ draftId: string; title: string; language: string }>();
    expect(draft).toMatchObject({ title: input.title, language: 'ru' });
    expect((await t.send('POST', '/workshop/drafts', owner.cookie, input)).json()).toEqual(draft);
    expect(
      (await t.send('POST', '/workshop/drafts', owner.cookie, { ...input, title: 'Changed' }))
        .statusCode,
    ).toBe(409);
    expect((await t.send('GET', '/workshop/drafts', owner.cookie)).json()).toMatchObject({
      drafts: [draft],
      nextCursor: null,
    });
    expect(await t.engine.load('ravenford')).toBeNull();
  });

  it('refuses another owner exactly like an unknown draft, and cookies grant no campaign authority', async () => {
    const t = await table();
    const a = await t.login();
    const b = await t.login();
    const draft = (
      await t.send('POST', '/workshop/drafts', a.cookie, {
        requestId: randomUUID(),
        title: 'Private',
        language: 'en',
      })
    ).json<{ draftId: string }>();
    const denied = await t.send('GET', `/workshop/drafts/${draft.draftId}`, b.cookie);
    const absent = await t.send('GET', `/workshop/drafts/${randomUUID()}`, b.cookie);
    expect(denied.statusCode).toBe(404);
    expect(denied.json<ApiErrorResponse>().error).toEqual(absent.json<ApiErrorResponse>().error);
    expect(
      (await t.send('GET', '/workshop/drafts', b.cookie)).json<WorkshopDraftList>().drafts,
    ).toEqual([]);
    expect((await t.send('GET', '/campaigns/ravenford/session', a.cookie)).statusCode).toBe(401);
    expect((await t.send('GET', '/workshop/drafts', `ltw_session=${newToken()}`)).statusCode).toBe(
      401,
    );
    expect((await t.send('GET', '/workshop/drafts', `${a.cookie}; ${a.cookie}`)).statusCode).toBe(
      401,
    );
  });

  it('uses a separate secure HttpOnly cookie and requires consent to replace only the workshop sign-in', async () => {
    const t = await table();
    const a = await t.login();
    expect(a.response.headers['set-cookie']).toContain(
      'Path=/api/workshop; HttpOnly; SameSite=Strict',
    );
    expect(a.response.headers['set-cookie']).toContain('; Secure');
    const b = await t.invite();
    const token = b.link.split('#')[1];
    const cookie = `${a.cookie}; ltw_session=${newToken()}`;
    expect((await t.send('POST', '/workshop/auth/redeem', cookie, { token })).statusCode).toBe(409);
    const replaced = await t.send('POST', '/workshop/auth/redeem', cookie, {
      token,
      replaceSession: true,
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.headers['set-cookie']).not.toContain('ltw_session=');
    expect((await t.send('GET', '/workshop/auth/session', a.cookie)).statusCode).toBe(401);
    expect((await t.send('GET', '/workshop/auth/session', cookieOf(replaced))).json()).toEqual({
      ownerId: b.ownerId,
    });
  });

  it('single-use, expired, forged and revoked invitations fail with the same fixed reason', async () => {
    const t = await table();
    const a = await t.login();
    const reused = await t.send('POST', '/workshop/auth/redeem', '', {
      token: a.issued.link.split('#')[1],
    });
    const forged = await t.send('POST', '/workshop/auth/redeem', '', { token: newToken() });
    const expired = await t.invite();
    t.setNow(T0 + 25 * 60 * 60_000);
    const outOfTime = await t.send('POST', '/workshop/auth/redeem', '', {
      token: expired.link.split('#')[1],
    });
    const revoked = await t.invite();
    await t.store.revokeOwner(
      revoked.ownerId,
      new Date(T0 + 25 * 60 * 60_000).toISOString(),
      'owner-chat:revoke',
    );
    const withdrawn = await t.send('POST', '/workshop/auth/redeem', '', {
      token: revoked.link.split('#')[1],
    });
    for (const response of [reused, forged, outOfTime, withdrawn]) {
      expect(response.statusCode).toBe(401);
      expect(response.json<ApiErrorResponse>().error).toEqual(
        forged.json<ApiErrorResponse>().error,
      );
    }
  });

  it('revokes existing sessions and open invitations; a new grant retains the same owner drafts', async () => {
    const t = await table();
    const a = await t.login();
    const open = await t.invite(a.ownerId);
    await t.store.revokeOwner(a.ownerId, new Date(T0).toISOString(), 'owner-chat:lost-device');
    expect((await t.send('GET', '/workshop/drafts', a.cookie)).statusCode).toBe(401);
    expect(
      (await t.send('POST', '/workshop/auth/redeem', '', { token: open.link.split('#')[1] }))
        .statusCode,
    ).toBe(401);
    expect((await t.login(a.ownerId)).ownerId).toBe(a.ownerId);
  });

  it('rejects cross-origin mutation/probe without clearing a cookie, and signs out only the workshop', async () => {
    const t = await table();
    const a = await t.login();
    for (const method of ['GET', 'POST'] as const) {
      const response = await t.app.inject({
        method,
        url: method === 'GET' ? '/workshop/auth/session' : '/workshop/auth/sign-out',
        headers: { cookie: a.cookie, origin: 'https://attacker.example' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const response = await t.send('POST', '/workshop/auth/sign-out', a.cookie, {});
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect((await t.send('GET', '/workshop/auth/session', a.cookie)).statusCode).toBe(401);
  });
});

import { describe, expect, it } from 'vitest';

import { OTHER_CAMPAIGN, SEREN, signInTable } from '../testing/sign-in.ts';

describe('mounted game identity at sign-out', () => {
  it('refuses another campaign before revoking the cookie presented by a stale tab', async () => {
    const table = await signInTable();
    const cookie = await table.signInWith(await table.dmInvitation(OTHER_CAMPAIGN));
    const out = await table.send('POST', '/auth/sign-out', {
      cookie,
      headers: { 'x-game-campaign': 'ravenford', 'x-game-actor': 'dm-ravenford' },
    });
    expect(out.statusCode).toBe(409);
    expect(out.headers['set-cookie']).toBeUndefined();
    expect((await table.send('GET', '/auth/session', { cookie })).statusCode).toBe(200);
    await table.app.close();
  });

  it('refuses a replaced actor in the same campaign and accepts only the mounted identity', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    const { token } = await table.invite(dm, SEREN);
    const player = await table.signInWith(token, { cookie: dm }, { replaceSession: true });
    const before = await table.send('GET', '/campaigns/ravenford/session', { cookie: player });
    const actorId = before.json<{ actorId: string }>().actorId;
    const stale = await table.send('POST', '/auth/sign-out', {
      cookie: player,
      headers: { 'x-game-campaign': 'ravenford', 'x-game-actor': 'dm-ravenford' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.headers['set-cookie']).toBeUndefined();
    expect((await table.send('GET', '/auth/session', { cookie: player })).statusCode).toBe(200);
    const current = await table.send('POST', '/auth/sign-out', {
      cookie: player,
      headers: { 'x-game-campaign': 'ravenford', 'x-game-actor': actorId },
    });
    expect(current.statusCode).toBe(204);
    expect(current.headers['set-cookie']).toBeUndefined();
    for (const old of [dm, player]) {
      const refused = await table.send('GET', '/auth/session', { cookie: old });
      expect(refused.statusCode).toBe(401);
      expect(refused.headers['set-cookie']).toBeUndefined();
    }
    await table.app.close();
  });
});

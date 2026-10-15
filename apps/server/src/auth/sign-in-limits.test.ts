import { createLocalProvider } from '@ltw/ai';
import { describe, expect, it } from 'vitest';

import { testAiGateway, testProvider, withoutRequestId } from '../testing/ravenford-app.ts';
import { SEREN, signInTable, type SignInTable } from '../testing/sign-in.ts';
import { newToken } from './tokens.ts';

/**
 * Limits over HTTP (docs/adr/0036-production-sign-in.md §6; docs/STAGE_340_DESIGN.md "Limits"):
 * redeem per address and per token prefix with a lockout; AI and image requests per actor with
 * an in-flight cap; invitations per DM. Every limit answers the same fixed 429.
 */
const LIMITED = { status: 429, error: { code: 'RATE_LIMITED', message: 'Too many requests' } };
const MINUTE = 60_000;

const forgedWithPrefix = (token: string) => `${token.slice(0, 8)}${newToken().slice(8)}`;

describe('redeem limits', () => {
  it('answer the eleventh attempt in a minute from one address with a fixed 429', async () => {
    const table = await signInTable();
    const caller = { ip: '198.51.100.1' };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await table.redeem(newToken(), caller)).statusCode).toBe(401);
    }
    const limited = await table.redeem(await table.dmInvitation(), caller);
    expect(withoutRequestId(limited)).toEqual(LIMITED);
    // Another address is not affected; the same one is again after the minute.
    expect(
      (await table.redeem(await table.dmInvitation(), { ip: '198.51.100.2' })).statusCode,
    ).toBe(200);
    table.clock.advance(MINUTE);
    expect((await table.redeem(await table.dmInvitation(), caller)).statusCode).toBe(200);
  });

  it('refuse a token prefix after five failures, from any address', async () => {
    const table = await signInTable();
    const token = await table.dmInvitation();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const answer = await table.redeem(forgedWithPrefix(token), {
        ip: `198.51.100.${String(attempt)}`,
      });
      expect(answer.statusCode).toBe(401);
    }
    expect(withoutRequestId(await table.redeem(token, { ip: '198.51.100.99' }))).toEqual(LIMITED);
    table.clock.advance(15 * MINUTE);
    expect((await table.redeem(token, { ip: '198.51.100.99' })).statusCode).toBe(200);
  });

  it('lock an address out for fifteen minutes after twenty failures in an hour', async () => {
    const table = await signInTable();
    const caller = { ip: '198.51.100.7' };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await table.redeem(newToken(), caller)).statusCode).toBe(401);
      table.clock.advance(MINUTE / 2);
    }
    // Even a valid invitation is refused while the address is locked out.
    const token = await table.dmInvitation();
    table.clock.advance(MINUTE);
    expect(withoutRequestId(await table.redeem(token, caller))).toEqual(LIMITED);
    table.clock.advance(14 * MINUTE);
    expect((await table.redeem(token, caller)).statusCode).toBe(200);
  });

  it('count malformed requests as failures, and keep evidence without addresses or tokens', async () => {
    const table = await signInTable();
    const caller = { ip: '198.51.100.8' };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await table.send('POST', '/auth/redeem', caller, { token: 'x' })).statusCode).toBe(
        400,
      );
      table.clock.advance(MINUTE);
    }
    const token = await table.dmInvitation();
    expect((await table.redeem(token, caller)).statusCode).toBe(429);
    const evidence = JSON.stringify(
      (table.credentials as unknown as { attempts: readonly unknown[] }).attempts,
    );
    expect(evidence).not.toContain('198.51.100.8');
    expect(evidence).not.toContain(token);
    expect(evidence).not.toContain(token.slice(0, 8));
    expect(evidence).toMatch(/"outcome":"limited"/);
  });
});

/** A local provider that answers only when the test lets it. */
function gatedAi() {
  const waiting: (() => void)[] = [];
  const local = createLocalProvider();
  const provider = testProvider('local', 'local', async (request, attempt) => {
    await new Promise<void>((resolve) => waiting.push(resolve));
    return local.generate(request, attempt);
  });
  return {
    ai: testAiGateway(provider),
    waiting: () => waiting.length,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

const intent = (table: SignInTable, cookie: string) =>
  table.send('POST', '/campaigns/ravenford/ai/intents', { cookie }, { text: 'Add a fisherman.' });

const settle = async (check: () => boolean) => {
  for (let turn = 0; turn < 200 && !check(); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

describe('AI and image limits', () => {
  it('admit twenty AI requests per actor per minute, then a fixed 429', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    for (let request = 0; request < 20; request += 1) {
      expect((await intent(table, dm)).statusCode).toBe(200);
    }
    expect(table.ai.traces.starts()).toHaveLength(20);
    expect(withoutRequestId(await intent(table, dm))).toEqual(LIMITED);
    // The refused request started nothing: no provider ran for it.
    expect(table.ai.traces.starts()).toHaveLength(20);
    table.clock.advance(MINUTE);
    expect((await intent(table, dm)).statusCode).toBe(200);
  });

  it('keep at most two in flight per actor, released when the work is over', async () => {
    const gate = gatedAi();
    const table = await signInTable({ ai: gate.ai });
    const dm = await table.signInWith(await table.dmInvitation());
    const first = intent(table, dm);
    const second = intent(table, dm);
    await settle(() => gate.waiting() === 2);
    expect(gate.waiting()).toBe(2);
    expect(withoutRequestId(await intent(table, dm))).toEqual(LIMITED);
    gate.release();
    expect((await first).statusCode).toBe(200);
    expect((await second).statusCode).toBe(200);
    const third = intent(table, dm);
    await settle(() => gate.waiting() === 1);
    gate.release();
    expect((await third).statusCode).toBe(200);
  });

  it('count a player’s NPC dialogue and image requests the same way', async () => {
    const table = await signInTable({ limits: { expensivePerMinute: 2 } });
    const dm = await table.signInWith(await table.dmInvitation());
    const { token } = await table.invite(dm, SEREN);
    const player = await table.signInWith(token);
    const talk = () =>
      table.send(
        'POST',
        '/campaigns/ravenford/npcs/mira-vale/dialogue',
        { cookie: player },
        { characterId: SEREN, intent: { kind: 'talk' }, line: 'Hello.' },
      );
    expect((await talk()).statusCode).not.toBe(429);
    expect((await talk()).statusCode).not.toBe(429);
    expect(withoutRequestId(await talk())).toEqual(LIMITED);
    const image = (clientCommandId: string) =>
      table.send(
        'POST',
        '/campaigns/ravenford/commands',
        { cookie: dm },
        {
          commandId: clientCommandId,
          command: { type: 'RequestAsset', entityId: 'mira-vale', variant: 'reference' },
        },
      );
    expect((await image('one')).statusCode).not.toBe(429);
    expect((await image('two')).statusCode).not.toBe(429);
    expect(withoutRequestId(await image('three'))).toEqual(LIMITED);
    // Other commands are not limited.
    const move = await table.send(
      'POST',
      '/campaigns/ravenford/commands',
      { cookie: dm },
      { commandId: 'time', command: { type: 'AdvanceWorldTime', by: 60 } },
    );
    expect(move.statusCode).toBe(200);
  });
});

describe('invitation limits', () => {
  it('admit twenty invitations per DM per hour', async () => {
    const table = await signInTable();
    const dm = await table.signInWith(await table.dmInvitation());
    for (let invitation = 0; invitation < 20; invitation += 1) await table.invite(dm, SEREN);
    const limited = await table.send(
      'POST',
      '/campaigns/ravenford/invitations',
      { cookie: dm },
      { characterId: SEREN },
    );
    expect(withoutRequestId(limited)).toEqual(LIMITED);
    table.clock.advance(60 * MINUTE);
    await table.invite(dm, SEREN);
  });
});

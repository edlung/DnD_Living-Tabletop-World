import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import { openLive } from '../testing/live.ts';
import {
  FlakyCredentialStore,
  ORIGIN,
  SEREN,
  signInTable,
  tokenOfLink,
} from '../testing/sign-in.ts';
import { InMemoryCredentialStore } from './credential-store.ts';
import { hashToken, newToken } from './tokens.ts';

/**
 * No credential in logs, traces, evidence or error bodies (docs/adr/0036-production-sign-in.md,
 * "Log or trace reader"): a whole table's evening on a captured logger at its most verbose,
 * with refusals, limits, a live stream and a failing store, never shows a token, its hash or
 * a cookie anywhere but the one `Set-Cookie` and the one invitation link meant to carry it.
 * Nor does any line carry a client's address or port, a cookie or an authorization header
 * (amendment 2026-10-16): the players come direct and through the trusted proxy, over IPv4
 * and IPv6.
 */
const PROXY = '10.0.0.5';
const ADDRESSES = {
  dm: '198.51.100.23',
  player: '2001:db8:dead:beef::17',
  forwarded: '192.0.2.44',
  fallback: '203.0.113.7',
};

describe('credentials never leak', () => {
  it('stay out of every log line, trace, evidence row and error body', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'sign-in-logs',
      level: 'trace',
      destination: { write: (line: string) => lines.push(line) },
    });
    const credentials = new InMemoryCredentialStore();
    const flaky = new FlakyCredentialStore(credentials);
    const table = await signInTable({
      logger,
      credentials: flaky,
      limits: { redeemPerMinute: 50 },
      trustedProxies: [PROXY],
    });
    const responses: LightMyRequestResponse[] = [];
    const secrets: string[] = [];
    const keep = (response: LightMyRequestResponse) => {
      responses.push(response);
      return response;
    };

    const dmToken = await table.dmInvitation();
    const dm = await table.signInWith(dmToken, { ip: ADDRESSES.dm });
    const invited = keep(
      await table.send(
        'POST',
        '/campaigns/ravenford/invitations',
        { cookie: dm },
        { characterId: SEREN },
      ),
    );
    const playerToken = tokenOfLink(invited.json<{ link: string }>().link);
    flaky.failures = 1;
    keep(await table.redeem(playerToken, { ip: ADDRESSES.player }));
    const player = await table.signInWith(playerToken, { ip: ADDRESSES.player });
    const forged = newToken();
    secrets.push(dmToken, playerToken, forged, dm, player, 'dev-dm-ravenford');

    keep(
      await table.redeem(forged, {
        ip: PROXY,
        headers: { 'x-forwarded-for': ADDRESSES.forwarded },
      }),
    );
    keep(
      await table.send('GET', '/campaigns/ravenford/session', {
        cookie: dm,
        ip: PROXY,
        headers: {
          'x-forwarded-for': ADDRESSES.forwarded,
          authorization: 'Bearer dev-dm-ravenford',
        },
      }),
    );
    keep(await table.redeem(forged));
    keep(await table.redeem(playerToken));
    keep(await table.redeem(dmToken, { origin: 'https://evil.example' }));
    keep(
      await table.send('GET', '/campaigns/ravenford/knowledge?perspective=PARTY', {
        cookie: player,
      }),
    );
    keep(await table.send('GET', '/campaigns/other-table/session', { cookie: player }));
    keep(
      await table.send(
        'POST',
        '/campaigns/ravenford/npcs/mira-vale/dialogue',
        { cookie: player },
        { characterId: SEREN, intent: { kind: 'talk' }, line: 'Hello.' },
      ),
    );
    keep(
      await table.send(
        'POST',
        '/campaigns/ravenford/ai/intents',
        { cookie: dm },
        { text: 'Add a fisherman.' },
      ),
    );
    keep(await table.send('GET', '/campaigns/ravenford/invitations', { cookie: dm }));
    const stream = await openLive(
      table.app,
      '/campaigns/ravenford/live?perspective=PLAYER',
      undefined,
      {
        cookie: player,
        origin: ORIGIN,
      },
    );
    await stream.until(() => stream.messages().length > 0);
    await table.hub.cycle();
    keep(
      await table.send('POST', `/campaigns/ravenford/members/${SEREN}/revoke`, { cookie: dm }, {}),
    );
    await table.hub.cycle();
    await stream.until(() => stream.ended());
    keep(await table.send('POST', '/auth/sign-out', { cookie: dm }));
    keep(await table.send('GET', '/auth/session', { cookie: dm }));

    const values = secrets.flatMap((secret) => {
      const token = secret.startsWith('ltw_session=')
        ? secret.slice('ltw_session='.length)
        : secret;
      return [token, hashToken(token), token.slice(0, 12)].map((value) => ({ value, secret }));
    });
    const evidence = JSON.stringify(credentials.attempts);
    const traces = JSON.stringify([table.ai.traces.all(), table.ai.traces.starts()]);
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.some((line) => line.includes('request failed'))).toBe(true);
    expect(lines.some((line) => line.includes('incoming request'))).toBe(true);
    for (const line of lines) {
      for (const address of [...Object.values(ADDRESSES), PROXY, '2001:db8:dead:beef']) {
        expect(line).not.toContain(address);
      }
      expect(line).not.toMatch(/remoteAddress|remotePort|"ips?"|x-forwarded-for|"host"/i);
    }
    for (const { value, secret } of values) {
      for (const line of lines) expect(line).not.toContain(value);
      expect(evidence).not.toContain(value);
      expect(traces).not.toContain(value);
      expect(stream.frames().join('')).not.toContain(value);
      for (const response of responses) {
        // The invitation link is the one body meant to carry its own token.
        if (response === invited && secret === playerToken) continue;
        expect(response.body).not.toContain(value);
      }
    }
  });
});

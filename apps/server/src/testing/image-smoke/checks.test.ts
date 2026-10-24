import type { AiAttemptView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { SmokeUsageError, parseSmokeArgs } from './args.ts';
import { localOnly } from './author.ts';
import { chargeLine, contentHashOf } from './job.ts';
import { assertHidden, assertShown, type PlayerView } from './visibility.ts';

/** The smoke's own judgements, apart from any server: arguments, the trace, what the player sees. */
describe('image smoke arguments', () => {
  it('need the server’s generator and default to the local development server', () => {
    expect(parseSmokeArgs(['--generator', 'placeholder'])).toEqual({
      server: new URL('http://127.0.0.1:3000'),
      campaignId: 'ravenford',
      generator: 'placeholder',
      timeoutMs: 300_000,
      pollMs: 2_000,
    });
    expect(
      parseSmokeArgs([
        '--generator',
        'openrouter-openai',
        '--server',
        'http://localhost:4320',
        '--timeout-seconds',
        '600',
        '--poll-seconds',
        '5',
      ]),
    ).toMatchObject({ generator: 'openrouter-openai', timeoutMs: 600_000, pollMs: 5_000 });
    expect(() => parseSmokeArgs([])).toThrow(/--generator is required/);
    expect(() => parseSmokeArgs(['--generator', 'dall-e'])).toThrow(SmokeUsageError);
  });

  it('drive only a loopback server, and take nothing else', () => {
    for (const server of [
      'https://example.com',
      'http://10.0.0.5:3000',
      'http://127.0.0.1:3000/api',
      'http://user:pw@127.0.0.1:3000',
      'http://127.0.0.1:3000/?x=1',
      'ftp://127.0.0.1',
      'not a url',
    ]) {
      expect(() => parseSmokeArgs(['--generator', 'placeholder', '--server', server])).toThrow(
        SmokeUsageError,
      );
    }
    expect(
      parseSmokeArgs(['--generator', 'placeholder', '--server', 'http://[::1]:3000']),
    ).toMatchObject({
      server: new URL('http://[::1]:3000'),
    });
    for (const args of [
      ['--generator', 'placeholder', '--timeout-seconds', '0'],
      ['--generator', 'placeholder', '--timeout-seconds', '1.5'],
      ['--generator', 'placeholder', '--poll-seconds', '61'],
      ['--generator', 'placeholder', '--campaign', 'Not An ID'],
      ['--generator', 'placeholder', '--generator', 'placeholder'],
      ['--generator', 'placeholder', '--key', 'sk-or-v1-x'],
      ['--generator'],
    ]) {
      expect(() => parseSmokeArgs(args), args.join(' ')).toThrow(SmokeUsageError);
    }
  });
});

const attempt = (provider: string, billing?: AiAttemptView['billing']): AiAttemptView => ({
  provider,
  model: null,
  kind: 'initial',
  outcome: 'valid',
  error: null,
  issues: [],
  output: null,
  latencyMs: 1,
  usage: null,
  ...(billing ? { billing } : {}),
});

describe('the intent trace check', () => {
  it('accepts the local provider only', () => {
    const local = {
      status: 'local' as const,
      pricingVersion: null,
      reservedMicros: null,
      costMicros: null,
    };
    expect(localOnly({ attempts: [attempt('local', local)] })).toBe(true);
    expect(localOnly({ attempts: [attempt('local')] })).toBe(true);
    expect(localOnly({ attempts: [] })).toBe(false);
    expect(localOnly({ attempts: [attempt('anthropic'), attempt('local', local)] })).toBe(false);
    expect(
      localOnly({
        attempts: [attempt('local', { ...local, status: 'known', costMicros: '10' })],
      }),
    ).toBe(false);
  });
});

describe('what the player sees', () => {
  const portrait = contentHashOf(new TextEncoder().encode('portrait'));
  const bytes = new TextEncoder().encode('portrait');
  const hidden: PlayerView = {
    presentation: null,
    scene: null,
    listed: false,
    contentStatus: 404,
    contentBytes: new Uint8Array(),
  };
  const shown: PlayerView = {
    presentation: portrait,
    scene: portrait,
    listed: true,
    contentStatus: 200,
    contentBytes: bytes,
  };

  it('before approval: nothing of the portrait, by any route', () => {
    expect(assertHidden(hidden, portrait)).toContain('no picture');
    expect(
      assertHidden({ ...hidden, presentation: 'sha256:old', scene: 'sha256:old' }, portrait),
    ).toContain('earlier picture sha256:old');
    for (const leak of [
      { presentation: portrait },
      { scene: portrait },
      { listed: true },
      { contentStatus: 200 },
      { contentStatus: 500 },
    ]) {
      expect(() => assertHidden({ ...hidden, ...leak }, portrait), JSON.stringify(leak)).toThrow(
        /before the DM approved it/,
      );
    }
  });

  it('after approval: the portrait, by every route, with its own bytes', () => {
    expect(assertShown(shown, portrait, false)).toContain('show the portrait');
    expect(() => assertShown({ ...shown, listed: false }, portrait, false)).toThrow();
    expect(() => assertShown({ ...shown, contentStatus: 404 }, portrait, false)).toThrow();
    expect(() =>
      assertShown({ ...shown, contentBytes: new TextEncoder().encode('other') }, portrait, false),
    ).toThrow(/other bytes/);
    expect(() => assertShown({ ...shown, scene: null }, portrait, false)).toThrow(/scene/);
    const variant = { ...shown, presentation: 'sha256:night', scene: 'sha256:night' };
    expect(() => assertShown(variant, portrait, false)).toThrow(/not presented/);
    expect(assertShown(variant, portrait, true)).toContain('variant sha256:night');
  });
});

describe('the ledger line', () => {
  const charge = {
    chargeId: 'c-1',
    provider: 'openrouter-openai',
    model: 'openai/gpt-5-image-mini',
    reservedMicros: '200000',
    createdAt: '2026-10-16T10:00:00.000Z',
  };
  it('names the reservation, its settlement and what the amount rests on', () => {
    expect(chargeLine({ ...charge, settlement: null })).toBe(
      'reserved $0.200000 for openai/gpt-5-image-mini (c-1); NOT SETTLED (held whole)',
    );
    expect(
      chargeLine({
        ...charge,
        settlement: {
          outcome: 'timeout',
          chargedMicros: '200000',
          costReported: false,
          returnedModel: null,
          providerRequestId: null,
          settledAt: '2026-10-16T10:03:00.000Z',
          authorization: null,
        },
      }),
    ).toBe(
      'reserved $0.200000 for openai/gpt-5-image-mini (c-1); settled timeout at $0.200000 ' +
        '(no cost reported: the whole reservation)',
    );
    expect(
      chargeLine({
        ...charge,
        settlement: {
          outcome: 'orphaned',
          chargedMicros: '200000',
          costReported: false,
          returnedModel: null,
          providerRequestId: null,
          settledAt: '2026-10-16T11:00:00.000Z',
          authorization: { ownerId: 'owner', authorizedOn: '2026-10-16', source: 'msg' },
        },
      }),
    ).toContain('settled orphaned at $0.200000 (settled by the operator)');
  });
});

import { describe, expect, it } from 'vitest';

import type { Authenticator } from '../http/auth.ts';
import { fingerprintSubscription, fingerprintViews, type Injector } from './fingerprint.ts';
import type { ViewRequest } from './inventory.ts';

/**
 * How view answers become a fingerprint or a closing verdict (docs/STAGE_310_DESIGN.md §A,
 * "Recheck"), over a fake twin: the check order of the views decides, and an error never
 * becomes a fingerprint.
 */
type Answer = readonly [status: number, body: string];

function twin(answers: Readonly<Record<string, Answer>>): Injector {
  let request = 0;
  return {
    inject: ((options: { url: string }) => {
      request += 1;
      const [statusCode, body] = answers[options.url] ?? [500, 'no answer'];
      // Error bodies carry a fresh request ID, as the real ones do.
      const payload = statusCode === 200 ? body : `${body}:${String(request)}`;
      return Promise.resolve({ statusCode, body: payload });
    }) as unknown as Injector['inject'],
  };
}

const VIEWS: readonly ViewRequest[] = [
  { url: '/entities', optional: false },
  { url: '/entities/mira-vale/knowledge', optional: true },
];

describe('fingerprints of the coverage views', () => {
  it('hash what the views answer, the same for the same answers', async () => {
    const first = await fingerprintViews(
      twin({ '/entities': [200, 'a'], '/entities/mira-vale/knowledge': [200, 'b'] }),
      'Bearer x',
      VIEWS,
    );
    const again = await fingerprintViews(
      twin({ '/entities': [200, 'a'], '/entities/mira-vale/knowledge': [200, 'b'] }),
      'Bearer x',
      VIEWS,
    );
    const changed = await fingerprintViews(
      twin({ '/entities': [200, 'a'], '/entities/mira-vale/knowledge': [200, 'c'] }),
      'Bearer x',
      VIEWS,
    );
    expect(first.kind).toBe('fingerprint');
    expect(again).toEqual(first);
    expect(changed).not.toEqual(first);
  });

  it('record a focus that is not visible by its status alone, and its appearance as a change', async () => {
    const hidden = await fingerprintViews(
      twin({ '/entities': [200, 'a'], '/entities/mira-vale/knowledge': [404, 'not found'] }),
      'Bearer x',
      VIEWS,
    );
    const stillHidden = await fingerprintViews(
      twin({ '/entities': [200, 'a'], '/entities/mira-vale/knowledge': [404, 'not found'] }),
      'Bearer x',
      VIEWS,
    );
    const shown = await fingerprintViews(
      twin({ '/entities': [200, 'a'], '/entities/mira-vale/knowledge': [200, 'b'] }),
      'Bearer x',
      VIEWS,
    );
    expect(hidden.kind).toBe('fingerprint');
    // Different request IDs in the error bodies change nothing.
    expect(stillHidden).toEqual(hidden);
    expect(shown).not.toEqual(hidden);
  });

  it.each([
    [{ '/entities': [401, 'x'], '/entities/mira-vale/knowledge': [404, 'x'] }, 'unauthenticated'],
    [{ '/entities': [403, 'x'], '/entities/mira-vale/knowledge': [403, 'x'] }, 'forbidden'],
    [{ '/entities': [404, 'x'], '/entities/mira-vale/knowledge': [404, 'x'] }, 'gone'],
    [{ '/entities': [200, 'a'], '/entities/mira-vale/knowledge': [400, 'x'] }, 'gone'],
    [{ '/entities': [500, 'x'], '/entities/mira-vale/knowledge': [200, 'b'] }, 'gone'],
  ] as const)('close on %j with %s', async (answers, reason) => {
    expect(await fingerprintViews(twin(answers), 'Bearer x', VIEWS)).toEqual({
      kind: 'close',
      reason,
    });
  });

  it('close when the credential no longer names the subscriber, even if the views answer', async () => {
    const views = twin({
      '/campaigns/ravenford/sessions': [200, 's'],
      ...Object.fromEntries(
        ['entities', 'knowledge', 'memories', 'encounter', 'quests', 'chronicle', 'presence'].map(
          (path) => [`/campaigns/ravenford/${path}?perspective=PARTY`, [200, path] as const],
        ),
      ),
    });
    const someoneElse: Authenticator = {
      authenticate: () => ({ actorId: 'player-elowen', kind: 'user' }),
    };
    const subscription = {
      target: {
        campaignId: 'ravenford',
        perspective: 'PARTY',
        kind: 'PARTY' as const,
        focus: null,
        place: null,
        identity: false,
      },
      authorization: 'Bearer x',
    };
    expect(
      await fingerprintSubscription(views, someoneElse, {
        ...subscription,
        actorId: 'dm-ravenford',
      }),
    ).toEqual({ kind: 'close', reason: 'unauthenticated' });
    expect(
      (
        await fingerprintSubscription(views, someoneElse, {
          ...subscription,
          actorId: 'player-elowen',
        })
      ).kind,
    ).toBe('fingerprint');
  });
});

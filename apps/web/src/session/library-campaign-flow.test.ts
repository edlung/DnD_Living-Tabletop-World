import { describe, expect, it } from 'vitest';

import { createLibraryCampaign } from './account-flow.ts';

/**
 * A library campaign from the hub (ADR 0058, notes of 2026-11-19): the browser sends the same
 * request again while the server prepares it or another request of the account runs, then opens
 * what the server answers; it never sends a second creation.
 */
const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function scripted(answers: Response[]) {
  const bodies: { requestId: string; libraryId: string; variantId: string }[] = [];
  const transport = ((_path: string, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as (typeof bodies)[number]);
    const next = answers.shift();
    return next ? Promise.resolve(next) : Promise.reject(new Error('no answer'));
  }) as typeof fetch;
  return { transport, bodies };
}

describe('a library campaign from the hub', () => {
  it('repeats one request ID while the campaign is prepared, then enters it', async () => {
    const { transport, bodies } = scripted([
      answer(202, { preparing: true }),
      answer(429, { error: { code: 'RATE_LIMITED' } }),
      answer(201, { campaignId: 'c-1', role: 'dm' }),
    ]);
    const pauses: number[] = [];
    const result = await createLibraryCampaign(
      transport,
      { libraryId: 'rain-check', variantId: 'party-4' },
      { pause: (ms) => (pauses.push(ms), Promise.resolve()) },
    );
    expect(result).toEqual({ kind: 'entered', campaignId: 'c-1' });
    expect(bodies).toHaveLength(3);
    expect(new Set(bodies.map((body) => body.requestId)).size).toBe(1);
    expect(bodies[0]).toMatchObject({ libraryId: 'rain-check', variantId: 'party-4' });
    expect(pauses).toEqual([3000]);
  });

  it('reads the campaign limit as a refusal and gives up on a campaign that never comes', async () => {
    const limit = scripted([
      answer(409, { error: { code: 'CONFLICT' }, reason: 'campaign-limit' }),
    ]);
    expect(
      await createLibraryCampaign(limit.transport, { libraryId: 'a', variantId: 'b' }),
    ).toEqual({ kind: 'refused', reason: 'campaign-limit' });

    let clock = 0;
    const waiting = scripted(Array.from({ length: 5 }, () => answer(202, { preparing: true })));
    const result = await createLibraryCampaign(
      waiting.transport,
      { libraryId: 'a', variantId: 'b' },
      {
        now: () => (clock += 4 * 60_000),
        pause: () => Promise.resolve(),
      },
    );
    expect(result).toEqual({ kind: 'unreachable' });
    expect(waiting.bodies.length).toBeLessThan(5);
  });
});

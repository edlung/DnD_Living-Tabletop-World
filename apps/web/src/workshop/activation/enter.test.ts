import { describe, expect, it, vi } from 'vitest';

import type { WorkshopClient } from '../client.ts';
import { campaignEntryPath, enterOwnedCampaign } from './enter.ts';

const origin = 'https://table.example';
const token = 'x'.repeat(43);
const link = `${origin}/join#${token}`;
const campaignId = '4d438305-9fda-4a93-8220-133b2cb0ad27';

function client(answer: unknown, controller?: AbortController): Pick<WorkshopClient, 'request'> {
  return {
    request: (_path, schema, options) => {
      expect(_path).toBe(`/campaigns/${campaignId}/sign-in`);
      expect(options?.body).toEqual({});
      controller?.abort();
      return Promise.resolve({ kind: 'ready', value: schema.parse(answer) });
    },
  };
}

describe('a deliberate entry to an owned campaign', () => {
  it('does not issue a credential after this mounted branch has already ended', async () => {
    const controller = new AbortController();
    controller.abort();
    const request: WorkshopClient['request'] = () => {
      throw new Error('Credential request must not run');
    };
    expect(
      await enterOwnedCampaign({
        client: { request },
        campaignId,
        signal: controller.signal,
        origin,
        navigate: () => {
          throw new Error('Navigation must not run');
        },
      }),
    ).toBe('cancelled');
  });
  it('permits only a same-origin normal one-use join fragment', () => {
    expect(campaignEntryPath(link, origin)).toBe(`/join#${token}`);
    expect(campaignEntryPath(`${origin}/join/#${token}`, origin)).toBe(`/join/#${token}`);
    for (const invalid of [
      `https://elsewhere.example/join#${token}`,
      `${origin}/workshop/join#${token}`,
      `${origin}/join?token=${token}#${token}`,
      `${origin}/join#bad`,
      `https://user:password@table.example/join#${token}`,
      `javascript:alert(1)`,
      `${origin}/%6aoin#${token}`,
    ])
      expect(campaignEntryPath(invalid, origin)).toBeNull();
  });

  it('requests an invitation only on the explicit function call and passes it directly to navigation', async () => {
    const navigate = vi.fn();
    const result = await enterOwnedCampaign({
      client: client({ link, expiresAt: '2099-01-01T00:00:00.000Z' }),
      campaignId,
      signal: new AbortController().signal,
      origin,
      navigate,
    });
    expect(result).toBe('opening');
    expect(navigate).toHaveBeenCalledExactlyOnceWith(`/join#${token}`);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('ignores late invitation answers after the mounted owner branch was released', async () => {
    const controller = new AbortController(),
      navigate = vi.fn();
    const result = await enterOwnedCampaign({
      client: client({ link, expiresAt: '2099-01-01T00:00:00.000Z' }, controller),
      campaignId,
      signal: controller.signal,
      origin,
      navigate,
    });
    expect(result).toBe('cancelled');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate using an expired or foreign invitation', async () => {
    for (const answer of [
      { link, expiresAt: '2020-01-01T00:00:00.000Z' },
      { link: `https://elsewhere.example/join#${token}`, expiresAt: '2099-01-01T00:00:00.000Z' },
    ]) {
      const navigate = vi.fn();
      expect(
        await enterOwnedCampaign({
          client: client(answer),
          campaignId,
          signal: new AbortController().signal,
          origin,
          navigate,
        }),
      ).toBe('failed');
      expect(navigate).not.toHaveBeenCalled();
    }
  });

  it('does not navigate on a revoked or unavailable owner request', async () => {
    for (const kind of ['signed-out', 'cancelled', 'failed', 'missing'] as const) {
      const navigate = vi.fn();
      expect(
        await enterOwnedCampaign({
          client: { request: () => Promise.resolve({ kind }) },
          campaignId,
          signal: new AbortController().signal,
          origin,
          navigate,
        }),
      ).toBe(kind === 'signed-out' || kind === 'cancelled' ? 'cancelled' : 'failed');
      expect(navigate).not.toHaveBeenCalled();
    }
  });
});

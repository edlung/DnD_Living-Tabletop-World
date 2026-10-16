import { describe, expect, it, vi } from 'vitest';

import { ApiError, WorldApi, type Connection } from './client.ts';

const connection: Connection = { kind: 'persona', campaignId: 'my world', token: 'private-token' };
const signal = new AbortController().signal;

describe('the browser API boundary', () => {
  it('calls fetch without binding a receiver and keeps credentials out of URLs/caches', async () => {
    const transport = vi.fn(function (this: unknown, input: unknown, init?: RequestInit) {
      expect(this).toBeUndefined();
      expect(input).toBe('/api/campaigns/my%20world/entities?perspective=CHARACTER%3Aelowen');
      expect(init).toMatchObject({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: 'Bearer private-token' },
      });
      return Promise.resolve(Response.json({ perspective: 'CHARACTER:elowen', entities: [] }));
    });
    const api = new WorldApi(connection, 'CHARACTER:elowen', 'CHARACTER:elowen', transport);
    await expect(api.get('entities', signal)).resolves.toEqual({
      perspective: 'CHARACTER:elowen',
      entities: [],
    });
  });

  it('fails closed when a response has another perspective or no envelope', async () => {
    for (const body of [{ perspective: 'DM', knowledge: ['secret'] }, {}, null]) {
      const api = new WorldApi(connection, 'PLAYER', 'CHARACTER:elowen', () =>
        Promise.resolve(Response.json(body)),
      );
      await expect(api.get('entities', signal)).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('accepts the server-resolved PLAYER label and identity responses without perspective', async () => {
    const api = new WorldApi(connection, 'PLAYER', 'CHARACTER:elowen', () =>
      Promise.resolve(Response.json({ perspective: 'CHARACTER:elowen' })),
    );
    await expect(api.get('entities', signal)).resolves.toEqual({ perspective: 'CHARACTER:elowen' });
    const identity = new WorldApi(connection, '', '', () =>
      Promise.resolve(Response.json({ role: 'PLAYER' })),
    );
    await expect(identity.get('session', signal, false)).resolves.toEqual({ role: 'PLAYER' });
  });

  it('never surfaces server error text, thrown credentials, or invalid JSON', async () => {
    const attempts: (typeof fetch)[] = [
      () => Promise.resolve(new Response('DM_SECRET private-token', { status: 500 })),
      () => Promise.reject(new Error('private-token')),
      () => Promise.resolve(new Response('not JSON')),
    ];
    for (const transport of attempts) {
      const api = new WorldApi(connection, 'PLAYER', 'CHARACTER:elowen', transport);
      await expect(api.get('entities', signal)).rejects.toThrow(
        'The world could not be reached. Please try again.',
      );
    }
  });
});

/**
 * Production sign-in in the browser (docs/adr/0036-production-sign-in.md §7): the session cookie
 * is the credential, so no `Authorization` header is ever sent and requests carry the cookie only
 * to their own origin; a 401 means the session ended, and the screen hears of it. The cookie is
 * the browser's, not the tab's (docs/STAGE_340_DESIGN.md "Part B review fixes"): a 403 or 404 may
 * mean another tab changed the sign-in, so the screen hears a doubt and asks the server.
 */
describe('a session signed in by invitation', () => {
  const session = () => {
    const onSignedOut = vi.fn();
    const onDoubt = vi.fn();
    const connection: Connection = {
      kind: 'session',
      campaignId: 'ravenford',
      onSignedOut,
      onDoubt,
      onIdentity: vi.fn(),
    };
    return { connection, onSignedOut, onDoubt };
  };
  const answering = (status: number) => () =>
    Promise.resolve(Response.json({ error: { code: 'X' } }, { status }));

  it('sends no Authorization header and only same-origin credentials, reads and writes', async () => {
    const calls: RequestInit[] = [];
    const transport = vi.fn((_input: unknown, init?: RequestInit) => {
      calls.push(init ?? {});
      return Promise.resolve(Response.json({ perspective: 'DM', status: 'accepted' }));
    });
    const api = new WorldApi(session().connection, 'DM', 'DM', transport);
    await api.get('entities', signal);
    await api.post('commands', { commandId: 'c-1' }, signal);
    expect(calls).toHaveLength(2);
    for (const init of calls) {
      expect(init).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
      expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
    }
    expect(calls[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('tells the screen it is signed out on a 401, from reads and writes alike', async () => {
    const { connection, onSignedOut, onDoubt } = session();
    const api = new WorldApi(connection, 'DM', 'DM', answering(401));
    await expect(api.get('entities', signal)).rejects.toThrow('You are signed out.');
    await expect(api.post('commands', {}, signal)).rejects.toMatchObject({ status: 401 });
    expect(onSignedOut).toHaveBeenCalledTimes(2);
    expect(onDoubt).not.toHaveBeenCalled();
  });

  it('doubts the sign-in on a 403 or 404, from reads and writes alike, and never signs out', async () => {
    const { connection, onSignedOut, onDoubt } = session();
    for (const status of [403, 404]) {
      const api = new WorldApi(connection, 'DM', 'DM', answering(status));
      await expect(api.get('entities', signal)).rejects.toMatchObject({ status });
      await expect(api.post('commands', {}, signal)).rejects.toMatchObject({ status });
    }
    expect(onDoubt).toHaveBeenCalledTimes(4);
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('neither signs out nor doubts on a conflict, a limit, a server error or no answer', async () => {
    const { connection, onSignedOut, onDoubt } = session();
    for (const status of [409, 422, 429, 500]) {
      const api = new WorldApi(connection, 'DM', 'DM', answering(status));
      await expect(api.post('invitations', {}, signal)).rejects.toMatchObject({ status });
    }
    const lost = new WorldApi(connection, 'DM', 'DM', () => Promise.reject(new Error('offline')));
    await expect(lost.get('entities', signal)).rejects.toMatchObject({ status: 0 });
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(onDoubt).not.toHaveBeenCalled();
  });

  it('never doubts a development persona: its credential is its own', async () => {
    const api = new WorldApi(connection, 'DM', 'DM', answering(403));
    await expect(api.get('entities', signal)).rejects.toMatchObject({ status: 403 });
  });
});

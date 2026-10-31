import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { WorkshopClient } from './client.ts';
import type { WorkshopProbe, workshopRequest } from './transport.ts';

const schema = z.object({ title: z.string() }).strict();
const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });
const signedIn = (): Promise<WorkshopProbe> =>
  Promise.resolve({ kind: 'signed-in', ownerId: 'owner' });

describe('workshop editor requests', () => {
  it('decodes only an explicitly typed conflict after confirming the same owner', async () => {
    const conflictSchema = z
      .object({ conflict: z.object({ reason: z.literal('LOCKED_CONTENT') }).strict() })
      .strict();
    const body = { conflict: { reason: 'LOCKED_CONTENT' } };
    const response = reply(409, body),
      read = vi.spyOn(response, 'json');
    const client = new WorkshopClient('owner', vi.fn(), () => Promise.resolve(response), signedIn);
    expect(await client.request('/revision', schema, { conflictSchema })).toEqual({
      kind: 'conflict',
      details: body,
    });
    expect(read).toHaveBeenCalledTimes(1);
    const invalid = new WorkshopClient(
      'owner',
      vi.fn(),
      () => Promise.resolve(reply(409, { ...body, rawSecret: 'Never reflected' })),
      signedIn,
    );
    expect(await invalid.request('/revision', schema, { conflictSchema })).toEqual({
      kind: 'conflict',
    });
  });
  it('never decodes a typed conflict for a replaced owner', async () => {
    const response = reply(409, { conflict: { reason: 'LOCKED_CONTENT' } });
    const read = vi.spyOn(response, 'json'),
      ended = vi.fn();
    const client = new WorkshopClient(
      'owner',
      ended,
      () => Promise.resolve(response),
      () => Promise.resolve({ kind: 'signed-in', ownerId: 'replacement' }),
    );
    expect(await client.request('/revision', schema, { conflictSchema: z.unknown() })).toEqual({
      kind: 'signed-out',
    });
    expect(read).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
  });
  it('ignores a conflict body that finishes decoding after the client is released', async () => {
    const response = reply(409);
    let complete: (value: unknown) => void = () => undefined;
    let started: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(response, 'json').mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const client = new WorkshopClient('owner', vi.fn(), () => Promise.resolve(response), signedIn);
    const pending = client.request('/revision', schema, {
      conflictSchema: z.object({ reason: z.string() }).strict(),
    });
    await reading;
    client.release();
    complete({ reason: 'Private old owner conflict' });
    expect(await pending).toEqual({ kind: 'cancelled' });
  });
  it('binds each request to the mounted owner and parses successful content', async () => {
    const transport = vi.fn(() => Promise.resolve(reply(200, { title: 'Private draft' })));
    const client = new WorkshopClient('owner', vi.fn(), transport, signedIn);
    const body = { requestId: 'same-nonce', text: 'Unsubmitted correction' };
    expect(await client.request('/drafts/a/revisions', schema, { body })).toEqual({
      kind: 'ready',
      value: { title: 'Private draft' },
    });
    expect(transport).toHaveBeenCalledWith(
      '/drafts/a/revisions',
      body,
      expect.any(AbortSignal),
      'owner',
    );
  });
  it('preserves a same-owner revision conflict and its retry payload without signing out', async () => {
    const transport = vi.fn<typeof workshopRequest>(() => Promise.resolve(reply(409)));
    const ended = vi.fn();
    const client = new WorkshopClient('owner', ended, transport, signedIn);
    const body = { requestId: 'original-nonce', text: 'Keep my correction' };
    expect(await client.request('/revision', schema, { body })).toEqual({ kind: 'conflict' });
    expect(await client.request('/revision', schema, { body })).toEqual({ kind: 'conflict' });
    expect(transport.mock.calls.map((call) => call[1])).toEqual([body, body]);
    expect(ended).not.toHaveBeenCalled();
  });
  it.each(['changed', 'signed-out'] as const)(
    'drops the whole client when a conflict probe is %s',
    async (kind) => {
      const ended = vi.fn();
      const client = new WorkshopClient(
        'owner',
        ended,
        () => Promise.resolve(reply(409)),
        () =>
          Promise.resolve(
            kind === 'changed'
              ? { kind: 'signed-in', ownerId: 'another-owner' }
              : { kind: 'signed-out' },
          ),
      );
      expect(await client.request('/revision', schema)).toEqual({ kind: 'signed-out' });
      expect(await client.request('/revision', schema)).toEqual({ kind: 'cancelled' });
      expect(ended).toHaveBeenCalledTimes(1);
    },
  );
  it('does not reinterpret an unreachable identity probe as a conflict or a confirmed sign-out', async () => {
    const ended = vi.fn();
    const client = new WorkshopClient(
      'owner',
      ended,
      () => Promise.resolve(reply(409)),
      () => Promise.resolve({ kind: 'unreachable' }),
    );
    expect(await client.request('/revision', schema)).toEqual({ kind: 'failed' });
    expect(ended).not.toHaveBeenCalled();
  });
  it('revokes reads and writes together on 401', async () => {
    const ended = vi.fn();
    const client = new WorkshopClient('owner', ended, () => Promise.resolve(reply(401)), signedIn);
    expect(await client.request('/package', schema)).toEqual({ kind: 'signed-out' });
    expect(await client.request('/generation', schema, { body: {} })).toEqual({
      kind: 'cancelled',
    });
    expect(ended).toHaveBeenCalledTimes(1);
  });
  it('rejects a late success after release, even if a strict-mode lifetime has reopened', async () => {
    let resolve!: (response: Response) => void;
    const transport = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const ended = vi.fn();
    const client = new WorkshopClient('owner', ended, transport, signedIn);
    const pending = client.request('/package', schema);
    client.release();
    client.open();
    resolve(reply(200, { title: 'Old private package' }));
    expect(await pending).toEqual({ kind: 'cancelled' });
    expect(ended).not.toHaveBeenCalled();
  });
  it('ignores a late foreign-owner probe after the request subtree was cancelled', async () => {
    let resolve!: (value: WorkshopProbe) => void;
    const probe = vi.fn(
      () =>
        new Promise<WorkshopProbe>((done) => {
          resolve = done;
        }),
    );
    const ended = vi.fn();
    const client = new WorkshopClient('owner', ended, () => Promise.resolve(reply(409)), probe);
    const pending = client.request('/revision', schema);
    await Promise.resolve();
    client.release();
    resolve({ kind: 'signed-in', ownerId: 'other' });
    expect(await pending).toEqual({ kind: 'cancelled' });
    expect(ended).not.toHaveBeenCalled();
  });
  it('rejects malformed success bodies and never reflects an error body', async () => {
    const client = new WorkshopClient(
      'owner',
      vi.fn(),
      () => Promise.resolve(reply(200, { title: 'Secret', extra: 'hidden' })),
      signedIn,
    );
    expect(await client.request('/package', schema)).toEqual({ kind: 'failed' });
    const failed = new WorkshopClient(
      'owner',
      vi.fn(),
      () => Promise.resolve(reply(500, { error: 'PRIVATE_ERROR' })),
      signedIn,
    );
    expect(await failed.request('/package', schema)).toEqual({ kind: 'failed' });
  });
  it('tells a paid job refused at the owner bound (429) apart from an uncertain failure (Gate 07)', async () => {
    const client = new WorkshopClient(
      'owner',
      vi.fn(),
      () => Promise.resolve(reply(429, { error: { code: 'RATE_LIMITED' } })),
      signedIn,
    );
    expect(await client.request('/generation', schema, { body: {} })).toEqual({ kind: 'busy' });
  });
  it('uses the same owner/authentication boundary for picture bytes', async () => {
    const request = vi.fn(() =>
      Promise.resolve(new Response(new Blob(['pixels'], { type: 'image/png' }))),
    );
    const client = new WorkshopClient('owner', vi.fn(), request);
    const result = await client.bytes('/picture', new AbortController().signal);
    expect(result.kind).toBe('ready');
    expect(request).toHaveBeenCalledWith('/picture', undefined, expect.any(AbortSignal), 'owner');
    const ended = vi.fn();
    const revoked = new WorkshopClient('owner', ended, () => Promise.resolve(reply(401)));
    expect(await revoked.bytes('/picture', new AbortController().signal)).toEqual({
      kind: 'signed-out',
    });
    expect(ended).toHaveBeenCalledOnce();
  });
  it('never returns late or non-image bytes to a mounted picture consumer', async () => {
    let resolve!: (response: Response) => void;
    const request = () =>
      new Promise<Response>((done) => {
        resolve = done;
      });
    const client = new WorkshopClient('owner', vi.fn(), request);
    const pending = client.bytes('/picture', new AbortController().signal);
    client.release();
    client.open();
    resolve(new Response(new Blob(['old pixels'], { type: 'image/png' })));
    expect(await pending).toEqual({ kind: 'cancelled' });
    const invalid = new WorkshopClient('owner', vi.fn(), () =>
      Promise.resolve(new Response('private error', { headers: { 'content-type': 'text/html' } })),
    );
    expect(await invalid.bytes('/picture', new AbortController().signal)).toEqual({
      kind: 'failed',
    });
  });
});

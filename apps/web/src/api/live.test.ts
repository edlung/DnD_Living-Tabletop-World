import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Connection } from './client.ts';
import { LiveClient, type LiveParams, type LiveStatus } from './live.ts';

/**
 * The browser end of the live signal (docs/adr/0033-live-session.md §1, §3, §4), over a fake
 * transport: the credential stays in the header, signals coalesce, stale generations are
 * ignored, a new subscription replaces the old only once ready, and a refused credential
 * stops it while anything else reconnects with backoff.
 */
interface Call {
  readonly url: string;
  readonly init: RequestInit;
  readonly aborted: () => boolean;
  send(text: string): void;
  end(): void;
}

function fakeTransport(status = () => 200) {
  const calls: Call[] = [];
  const encoder = new TextEncoder();
  const transport = vi.fn((input: unknown, init?: RequestInit): Promise<Response> => {
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        controller = stream;
      },
    });
    const signal = init?.signal ?? new AbortController().signal;
    let open = true;
    signal.addEventListener('abort', () => {
      if (open) controller?.error(new DOMException('aborted', 'AbortError'));
      open = false;
    });
    calls.push({
      url: String(input),
      init: init ?? {},
      aborted: () => signal.aborted,
      send: (text) => {
        if (open) controller?.enqueue(encoder.encode(text));
      },
      end: () => {
        if (open) controller?.close();
        open = false;
      },
    });
    const code = status();
    return Promise.resolve(
      code === 200
        ? new Response(body, {
            status: 200,
            headers: { 'content-type': 'text/event-stream; charset=utf-8' },
          })
        : Response.json({ error: { code: 'X', message: 'x' } }, { status: code }),
    );
  });
  return { calls, transport };
}

const READY = 'event: ready\ndata: {}\n\n';
const changed = (seq: number) => `event: changed\ndata: {"seq":${String(seq)}}\n\n`;
const closed = (reason: string) => `event: closed\ndata: {"reason":"${reason}"}\n\n`;
const PLAYER: LiveParams = { perspective: 'PLAYER', focus: null, place: null };

const PERSONA: Connection = { kind: 'persona', campaignId: 'my world', token: 'private-token' };

function client(status?: () => number, connection: Connection = PERSONA) {
  const { calls, transport } = fakeTransport(status);
  const statuses: LiveStatus[] = [];
  let refreshes = 0;
  const live = new LiveClient({
    connection,
    transport,
    random: () => 0.5,
    onStatus: (status) => statuses.push(status),
    onRefresh: () => {
      refreshes += 1;
    },
  });
  return { live, calls, statuses, refreshes: () => refreshes };
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe('the live client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('streams with fetch and keeps the credential in the Authorization header', async () => {
    const { live, calls } = client();
    live.subscribe({ perspective: 'CHARACTER:elowen', focus: 'mira-vale', place: 'market-square' });
    await tick();
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(
      '/api/campaigns/my%20world/live?perspective=CHARACTER%3Aelowen&focus=mira-vale&place=market-square',
    );
    expect(call?.url).not.toContain('private-token');
    expect(call?.init).toMatchObject({
      headers: { Authorization: 'Bearer private-token', Accept: 'text/event-stream' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    live.close();
    expect(call?.aborted()).toBe(true);
  });

  it('reloads on ready and coalesces duplicate, late and bursty signals', async () => {
    const { live, calls, statuses, refreshes } = client();
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY);
    await tick();
    expect(statuses).toEqual(['live']);
    expect(refreshes()).toBe(0);
    await tick(150);
    expect(refreshes()).toBe(1);
    // Several signals within 150 ms are one refresh; duplicates and stale numbers are none.
    calls[0]?.send(changed(1) + changed(2) + changed(2) + changed(1));
    await tick(50);
    calls[0]?.send(changed(3));
    await tick(150);
    expect(refreshes()).toBe(2);
    calls[0]?.send(changed(3) + changed(2) + ': heartbeat\n\nevent: world\ndata: {}\n\n');
    await tick(1_000);
    expect(refreshes()).toBe(2);
    calls[0]?.send(changed(4));
    await tick(150);
    expect(refreshes()).toBe(3);
    live.close();
  });

  it.each(['unauthenticated', 'forbidden'])('stops for good on %s', async (reason) => {
    const { live, calls, statuses, refreshes } = client();
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY + closed(reason));
    await tick(120_000);
    expect(calls).toHaveLength(1);
    expect(statuses).toEqual(['live', 'offline']);
    expect(refreshes()).toBe(0);
    live.subscribe({ ...PLAYER, focus: 'mira-vale' });
    await tick(1_000);
    expect(calls).toHaveLength(1);
  });

  it.each([401, 403, 400])('stops for good when the server refuses with %i', async (code) => {
    const { live, calls, statuses } = client(() => code);
    live.subscribe(PLAYER);
    await tick(120_000);
    expect(calls).toHaveLength(1);
    expect(statuses).toEqual(['offline']);
  });

  it('reconnects after 1 s doubling to 30 s, and reloads on every reconnect', async () => {
    let status = 200;
    const { live, calls, statuses, refreshes } = client(() => status);
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY);
    await tick(150);
    expect(refreshes()).toBe(1);
    calls[0]?.send(closed('gone'));
    await tick();
    expect(statuses).toEqual(['live', 'reconnecting']);
    await tick(999);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls).toHaveLength(2);
    // The server is unavailable for a while: 2 s, then 4 s.
    status = 502;
    calls[1]?.end();
    await tick(1_999);
    expect(calls).toHaveLength(2);
    await tick(1);
    expect(calls).toHaveLength(3);
    await tick(3_999);
    expect(calls).toHaveLength(3);
    status = 200;
    await tick(1);
    expect(calls).toHaveLength(4);
    calls[3]?.send(READY);
    await tick(150);
    expect(statuses.at(-1)).toBe('live');
    expect(refreshes()).toBe(2);
    // A cut without a closing message is a disconnect too; the backoff started over.
    calls[3]?.end();
    await tick(1_000);
    expect(calls).toHaveLength(5);
    live.close();
  });

  it('closes the old subscription only after the new one is ready, then reloads', async () => {
    const { live, calls, refreshes } = client();
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY);
    await tick(150);
    live.subscribe({ ...PLAYER, focus: 'mira-vale' });
    // A selection that keeps changing subscribes once it settles.
    await tick(100);
    live.subscribe({ ...PLAYER, focus: 'orin-stonebeard' });
    await tick(150);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toContain('focus=orin-stonebeard');
    expect(calls[0]?.aborted()).toBe(false);
    // The old stream still serves until the new one is ready.
    calls[0]?.send(changed(1));
    await tick(150);
    expect(refreshes()).toBe(2);
    calls[1]?.send(READY);
    await tick();
    expect(calls[0]?.aborted()).toBe(true);
    await tick(150);
    expect(refreshes()).toBe(3);
    live.close();
  });

  it('ignores every message of a stale generation', async () => {
    const { live, calls, statuses, refreshes } = client();
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY);
    await tick(150);
    live.subscribe({ ...PLAYER, place: 'north-gate' });
    await tick(150);
    // Replaced before it was ready: its ready and its close mean nothing.
    live.subscribe({ ...PLAYER, place: 'market-square' });
    await tick(150);
    expect(calls).toHaveLength(3);
    expect(calls[1]?.aborted()).toBe(true);
    calls[1]?.send(READY + changed(1) + closed('unauthenticated'));
    await tick(1_000);
    expect(refreshes()).toBe(1);
    expect(statuses).toEqual(['live']);
    calls[2]?.send(READY);
    await tick(150);
    expect(refreshes()).toBe(2);
    // The replaced stream's late signals are ignored too.
    calls[0]?.send(changed(5));
    await tick(1_000);
    expect(refreshes()).toBe(2);
    expect(calls[0]?.aborted()).toBe(true);
    live.close();
  });

  it('gives up on a connection that never becomes ready or goes silent', async () => {
    const { live, calls, statuses } = client();
    live.subscribe(PLAYER);
    await tick(15_000);
    expect(calls[0]?.aborted()).toBe(true);
    await tick(1_000);
    expect(calls).toHaveLength(2);
    calls[1]?.send(READY);
    await tick(44_999);
    expect(calls[1]?.aborted()).toBe(false);
    await tick(1);
    expect(calls[1]?.aborted()).toBe(true);
    expect(statuses).toEqual(['reconnecting', 'live', 'reconnecting']);
    live.close();
  });

  it('reports nothing and opens nothing once closed', async () => {
    const { live, calls, statuses, refreshes } = client();
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY);
    await tick();
    // The refresh that ready asked for is still waiting out its 150 ms.
    live.close();
    await tick(60_000);
    expect(calls).toHaveLength(1);
    expect(refreshes()).toBe(0);
    expect(statuses).toEqual(['live']);
  });
});

/**
 * A session signed in by invitation (docs/adr/0036-production-sign-in.md §7): the stream carries
 * the session cookie to its own origin only, and a sign-out, an expiry or the DM's revocation
 * reaches the screen through the stream as well as through any request.
 */
describe('the live client of a signed-in session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const session = () => {
    const onSignedOut = vi.fn();
    const connection: Connection = { kind: 'session', campaignId: 'ravenford', onSignedOut };
    return { connection, onSignedOut };
  };

  it('streams with the session cookie only, never an Authorization header', async () => {
    const { connection } = session();
    const { live, calls } = client(undefined, connection);
    live.subscribe(PLAYER);
    await tick();
    expect(calls[0]?.init).toMatchObject({
      headers: { Accept: 'text/event-stream' },
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    });
    expect(JSON.stringify(calls[0]?.init.headers)).not.toMatch(/authorization/i);
    live.close();
  });

  it('tells the screen the session ended when the stream closes as unauthenticated', async () => {
    const { connection, onSignedOut } = session();
    const { live, calls, statuses } = client(undefined, connection);
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY);
    await tick(150);
    expect(onSignedOut).not.toHaveBeenCalled();
    calls[0]?.send(closed('unauthenticated'));
    await tick();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('offline');
    await tick(60_000);
    expect(calls).toHaveLength(1);
  });

  it('tells the screen the session ended when the stream is refused with 401', async () => {
    const { connection, onSignedOut } = session();
    const { live } = client(() => 401, connection);
    live.subscribe(PLAYER);
    await tick();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('is not signed out by a refused perspective, a reconnect, or a stale stream', async () => {
    const { connection, onSignedOut } = session();
    const forbidden = client(() => 403, connection);
    forbidden.live.subscribe(PLAYER);
    await tick();
    const { live, calls } = client(undefined, connection);
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY + closed('gone'));
    await tick(1_000);
    calls[1]?.send(READY);
    await tick(150);
    live.subscribe({ ...PLAYER, place: 'north-gate' });
    await tick(150);
    live.subscribe({ ...PLAYER, place: 'market-square' });
    await tick(150);
    // Replaced before it was ready: its close is a stale generation's.
    calls[2]?.send(READY + closed('unauthenticated'));
    await tick(1_000);
    calls[1]?.send(closed('forbidden'));
    await tick();
    expect(onSignedOut).not.toHaveBeenCalled();
    live.close();
  });

  it('never calls a persona connection signed out: it has no session to end', async () => {
    const { live, calls, statuses } = client();
    live.subscribe(PLAYER);
    await tick();
    calls[0]?.send(READY + closed('unauthenticated'));
    await tick();
    expect(statuses).toEqual(['live', 'offline']);
  });
});

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import { createHealthServer } from './health-server.ts';

describe('health server', () => {
  let server: Server;
  let baseUrl: string;
  const lines: Record<string, unknown>[] = [];

  beforeEach(async () => {
    lines.length = 0;
    const logger = createLogger({
      service: 'test',
      level: 'debug',
      destination: {
        write: (chunk: string) => {
          lines.push(JSON.parse(chunk) as Record<string, unknown>);
        },
      },
    });
    server = createHealthServer({ logger });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('answers GET /healthz with ok and a request ID', async () => {
    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 404 JSON for anything else', async () => {
    const response = await fetch(`${baseUrl}/world/current`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('ignores a client-supplied request ID and logs the server one', async () => {
    const response = await fetch(`${baseUrl}/healthz`, {
      headers: { 'x-request-id': 'client-chosen-id' },
    });
    const requestId = response.headers.get('x-request-id');
    await response.text();
    await new Promise((resolve) => setImmediate(resolve));

    expect(requestId).not.toBe('client-chosen-id');
    expect(lines).toContainEqual(
      expect.objectContaining({ requestId, path: '/healthz', status: 200 }),
    );
  });
});

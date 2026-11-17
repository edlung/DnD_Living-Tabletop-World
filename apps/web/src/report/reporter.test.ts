import { clientErrorReportSchema } from '@ltw/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client.ts';
import {
  REPORTS_PER_LOAD,
  reportError,
  reportPage,
  reportPart,
  reportSender,
  startErrorReports,
} from './reporter.ts';

/**
 * The page's error reports (docs/adr/0073-table-ideas.md §1): what is sent, what never is, and
 * how many.
 */
const ORIGIN = 'https://table.example';
/** A window as the reporter reads it: an origin, the browser's description of itself, events. */
class FakeWindow extends EventTarget {
  readonly location = { origin: ORIGIN };
  readonly navigator = {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
  };
}
const happened = (type: string, fields: Record<string, unknown>): Event =>
  Object.assign(new Event(type), fields);
const broken = (name = 'TypeError', line = 1): Error => {
  const error = new Error('Mira Vale told Elowen the Ashen Circle’s secret');
  error.name = name;
  error.stack = `${name}: Mira Vale told Elowen\n    at draw (${ORIGIN}/assets/index-abc.js:${String(line)}:20)`;
  return error;
};

let sent: { url: string; init: RequestInit; body: string }[];
let stop: () => void;
let page: FakeWindow;
const transport = ((url: string, init: RequestInit) => {
  sent.push({ url, init, body: typeof init.body === 'string' ? init.body : '' });
  return Promise.resolve(new Response(null, { status: 204 }));
}) as typeof fetch;
const bodies = () => sent.map(({ body }) => JSON.parse(body) as Record<string, unknown>);

beforeEach(() => {
  sent = [];
  page = new FakeWindow();
  stop = startErrorReports(page, transport);
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

describe('a report', () => {
  it('is fixed fields the server takes, and no word of the error’s message', () => {
    reportPage('game');
    reportPart('chat');
    reportSender({ campaignId: 'ravenford', headers: {} });
    expect(reportError('render', broken())).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('/api/client-errors');
    const [body] = bodies();
    expect(clientErrorReportSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      kind: 'render',
      name: 'TypeError',
      page: 'game',
      part: 'chat',
      browser: 'safari',
      browserVersion: 18,
      system: 'ios',
      shell: 'none',
      campaignId: 'ravenford',
      place: [{ file: 'index-abc.js', line: 1, column: 20 }],
    });
    const text = sent[0]?.body ?? '';
    for (const word of ['Mira', 'Elowen', 'Ashen', 'secret', 'draw', ORIGIN, 'http']) {
      expect(text, word).not.toContain(word);
    }
  });

  it('goes with the session’s cookie, or a persona’s token, never both', () => {
    reportSender({ campaignId: 'ravenford', headers: {} });
    reportError('render', broken('TypeError', 1));
    expect(sent[0]?.init.credentials).toBe('same-origin');
    reportSender({ campaignId: 'ravenford', headers: { Authorization: 'Bearer dev-token-1234' } });
    reportError('render', broken('TypeError', 2));
    expect(sent[1]?.init.credentials).toBe('omit');
    expect((sent[1]?.init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer dev-token-1234',
    );
    // The token is a header, never part of the report.
    expect(sent[1]?.body).not.toContain('dev-token');
  });

  it('names no campaign and no part outside the game', () => {
    reportPage('game');
    reportPart('dice');
    reportPage('campaigns');
    reportSender(null);
    reportError('render', broken());
    const [body] = bodies();
    expect(body).toMatchObject({ page: 'campaigns', part: 'none' });
    expect(body).not.toHaveProperty('campaignId');
  });

  it('is never sent twice, and five a page load at most', () => {
    expect(reportError('render', broken('TypeError', 1))).toBe(true);
    expect(reportError('render', broken('TypeError', 1))).toBe(false);
    for (let line = 2; line < 20; line += 1) reportError('render', broken('TypeError', line));
    expect(sent).toHaveLength(REPORTS_PER_LOAD);
  });
});

describe('what is not reported', () => {
  it('a request the server refused or the network dropped, a cancelled or timed-out one', () => {
    const refused = new ApiError(403);
    refused.stack = broken().stack ?? '';
    expect(reportError('rejection', refused)).toBe(false);
    expect(reportError('rejection', broken('AbortError'))).toBe(false);
    expect(reportError('rejection', broken('TimeoutError'))).toBe(false);
    expect(sent).toEqual([]);
  });

  it('an uncaught error that names no script of the application', () => {
    const foreign = new Error('x');
    foreign.stack = 'Error: x\n    at inject (chrome-extension://abcdefgh/content.js:1:2)';
    expect(reportError('error', foreign)).toBe(false);
    expect(reportError('rejection', 'a thrown string')).toBe(false);
    expect(reportError('rejection', undefined)).toBe(false);
    // A render that failed is the page's own, whatever its stack says.
    expect(reportError('render', foreign)).toBe(true);
  });

  it('the browser’s notice of a layout it gave up on', () => {
    page.dispatchEvent(
      happened('error', {
        message: 'ResizeObserver loop completed with undelivered notifications.',
        error: broken(),
      }),
    );
    expect(sent).toEqual([]);
  });
});

describe('the listeners', () => {
  it('report an uncaught error and an unhandled rejection', () => {
    page.dispatchEvent(happened('error', { message: 'x', error: broken('TypeError', 3) }));
    page.dispatchEvent(happened('unhandledrejection', { reason: broken('RangeError', 4) }));
    expect(bodies().map((body) => [body['kind'], body['name']])).toEqual([
      ['error', 'TypeError'],
      ['rejection', 'RangeError'],
    ]);
  });

  it('never throw, whatever breaks while reporting', () => {
    stop();
    stop = startErrorReports(page, () => {
      throw new Error('the transport itself is broken');
    });
    expect(reportError('render', broken())).toBe(false);
    stop();
    stop = startErrorReports(page, () => Promise.reject(new Error('offline')));
    expect(reportError('render', broken('TypeError', 9))).toBe(true);
  });

  it('send nothing once stopped', () => {
    stop();
    expect(reportError('render', broken())).toBe(false);
    page.dispatchEvent(happened('error', { message: 'x', error: broken('TypeError', 5) }));
    expect(sent).toEqual([]);
  });
});

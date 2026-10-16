import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

import manifest from '../../fixtures/ravenford-ru/assets/manifest.json' with { type: 'json' };

/**
 * The browser journeys against a running deployment (deploy/verify/browser-journey.sh, which
 * sets the variables below; docs/adr/0037-deployment.md, "Full product"). The operator's steps
 * run in the server container through the deployment's Compose project, as the runbook has them.
 * Invitation links and session cookies stay in memory: never printed, never in an assertion's
 * message (every check about one is yes/no), never written; Playwright keeps no trace,
 * screenshot or video, and the wrapper removes its output directory.
 */
function setting(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is missing: run the journeys through deploy/verify/browser-journey.sh`,
    );
  }
  return value;
}

export const DEPLOY = {
  /** PUBLIC_ORIGIN: what the browser opens and every link names. */
  origin: setting('LTW_DEPLOY_ORIGIN'),
  /** deploy/: the Compose project (compose.yaml, deploy/.env). */
  dir: setting('LTW_DEPLOY_DIR'),
};

/** The start page, where a join leaves the address. */
export const START = `${DEPLOY.origin}/`;

const LINK = /^(.+)\/join#([A-Za-z0-9_-]{43})$/;

/** Whether a link is `<PUBLIC_ORIGIN>/join#<43-character token>`. */
export const isInvitationLink = (link: string): boolean => LINK.exec(link)?.[1] === DEPLOY.origin;

/** The token of an invitation link. */
export const tokenOf = (link: string): string => LINK.exec(link)?.[2] ?? '';

/** Whether a text holds any of the secrets (asserted as yes/no, so none is ever printed). */
export const holdsAny = (text: string, secrets: readonly string[]): boolean =>
  secrets.some((secret) => secret !== '' && text.includes(secret));

const run = promisify(execFile);

/** `docker compose <args>` in deploy/, as deploy/scripts/lib.sh runs it. */
async function compose(args: readonly string[]): Promise<string> {
  const { stdout } = await run('docker', ['compose', ...args], {
    cwd: DEPLOY.dir,
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

/**
 * The operator issues the DM's link for the review campaign (`auth:operator dm-invite` in the
 * server container; deploy/RUNBOOK.md section 1, step 7). Valid an hour; a failure never shows
 * what the command printed.
 */
export async function operatorDmLink(): Promise<string> {
  let printed: string;
  try {
    printed = await compose([
      'exec',
      '-T',
      'server',
      'node',
      'apps/server/dist/auth/operator-cli.js',
      'dm-invite',
      '--campaign',
      'ravenford',
      '--expires-hours',
      '1',
    ]);
  } catch {
    throw new Error('auth:operator dm-invite failed in the server container (output not shown)');
  }
  const line = printed.split('\n').find((text) => text.startsWith('{')) ?? '{}';
  const link = (JSON.parse(line) as { link?: unknown }).link;
  if (typeof link !== 'string' || !isInvitationLink(link)) {
    throw new Error('the operator printed no DM link for this origin (output not shown)');
  }
  return link;
}

/** What the proxy and the server have logged so far. */
export const deploymentLogs = (): Promise<string> =>
  compose(['logs', '--no-color', 'proxy', 'server']);

/** Opens an invitation link; a failure never names the link. */
export async function openLink(page: Page, link: string): Promise<string> {
  try {
    const response = await page.goto(link);
    return (await response?.allHeaders())?.['content-security-policy'] ?? '';
  } catch {
    throw new Error('the invitation link did not open (the link is not shown)');
  }
}

/** The session cookie a browser holds (HttpOnly: the page cannot read it, Playwright can). */
export async function sessionOf(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find(({ name }) => name === 'ltw_session');
  return cookie?.value ?? '';
}

/**
 * Every request a browser sends. No URL may carry a token, and a body only in the redeem, the
 * one place an invitation travels (a POST to this origin).
 */
export function captureRequests(context: BrowserContext) {
  const sent: { readonly url: string; readonly method: string; readonly body: string }[] = [];
  context.on('request', (request) => {
    sent.push({ url: request.url(), method: request.method(), body: request.postData() ?? '' });
  });
  return {
    expectTokensOnlyInRedeems(tokens: readonly string[]) {
      expect(sent.filter(({ url }) => holdsAny(url, tokens)).length, 'URLs with a token').toBe(0);
      const elsewhere = sent.filter(
        ({ url, method, body }) =>
          holdsAny(body, tokens) && !(method === 'POST' && url === `${START}api/auth/redeem`),
      );
      expect(elsewhere.length, 'request bodies outside a redeem with a token').toBe(0);
    },
  };
}

/**
 * Instruments every page of a browser context, before any of its scripts runs:
 * - Content Security Policy violations: the `securitypolicyviolation` events, reported as they
 *   happen (a page replaced by a fresh start page loses nothing), and Chromium's console reports;
 * - the object URLs the page makes: each one's SHA-256, read from its Blob as it is made, so a
 *   picture on screen is known by the bytes behind it (a `fetch` of a `blob:` URL would itself be
 *   refused by the page's `connect-src 'self'`). The page's own calls are passed on unchanged.
 * Returns the violations seen so far.
 */
export async function instrument(context: BrowserContext): Promise<string[]> {
  const violations: string[] = [];
  await context.exposeFunction('ltwPolicyViolation', (text: string) => violations.push(text));
  await context.addInitScript(() => {
    const page = window as unknown as {
      ltwPolicyViolation?: (text: string) => void;
      ltwObjectDigests?: Record<string, string>;
    };
    document.addEventListener('securitypolicyviolation', (event) => {
      page.ltwPolicyViolation?.(`${event.effectiveDirective} ${event.blockedURI.slice(0, 80)}`);
    });
    const digests: Record<string, string> = {};
    page.ltwObjectDigests = digests;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource): string => {
      const url = create(object);
      if (object instanceof Blob) {
        void object
          .arrayBuffer()
          .then((bytes) => crypto.subtle.digest('SHA-256', bytes))
          .then((digest) => {
            const hex = [...new Uint8Array(digest)].map((byte) =>
              byte.toString(16).padStart(2, '0'),
            );
            digests[url] = `sha256:${hex.join('')}`;
          });
      }
      return url;
    };
  });
  context.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

/** One answer of the content route, as the browser received it through the proxy. */
export interface Served {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Every picture a page fetched from the content route, by content hash: the answers that arrived
 * whole (`requestfinished`; a fetch the page aborted, when a view is replaced, is left out). The
 * bytes are checked where the page holds them (`shownPicture`).
 */
export function watchPictures(page: Page): Map<string, Promise<Served>> {
  const seen = new Map<string, Promise<Served>>();
  page.on('requestfinished', (request) => {
    const path = new URL(request.url()).pathname;
    const match = /^\/api\/campaigns\/[^/]+\/assets\/content\/([^/]+)$/.exec(path);
    if (!match?.[1]) return;
    seen.set(
      decodeURIComponent(match[1]),
      (async () => {
        const response = await request.response();
        return { status: response?.status() ?? 0, headers: (await response?.allHeaders()) ?? {} };
      })(),
    );
  });
  return seen;
}

/** The curated Ravenford pictures (fixtures/ravenford-ru/assets/manifest.json), by file. */
export const curatedHash = (file: string): string =>
  `sha256:${manifest.assets.find((entry) => entry.file === file)?.sha256 ?? 'missing'}`;

/** Every curated picture with a purpose, of one entity or (null) of any. */
export const curatedHashes = (entityId: string | null, purpose: string): string[] =>
  manifest.assets
    .filter(
      (entry) =>
        (entityId === null || entry.entityIds.includes(entityId)) && entry.purpose === purpose,
    )
    .map((entry) => `sha256:${entry.sha256}`);

/**
 * The picture an element shows: an object URL of decoded bytes the page fetched with its own
 * session (ADR 0026 §6); returns the SHA-256 of the Blob behind that URL (`instrument`).
 */
export async function shownPicture(image: Locator): Promise<string> {
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const digest = () =>
    image.evaluate(
      (element) =>
        (window as unknown as { ltwObjectDigests?: Record<string, string> }).ltwObjectDigests?.[
          (element as HTMLImageElement).src
        ] ?? '',
    );
  await expect.poll(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  return digest();
}

/**
 * How the deployment served an authorized picture (ADR 0022 §6, kept by the proxy): its media
 * type, `nosniff`, `no-store` (never kept by a browser or a shared cache), the server's sandbox
 * policy, varying on the cookie, uncompressed.
 */
export function expectServedAsContent(served: Served | undefined): void {
  expect(served?.status).toBe(200);
  expect(served?.headers['content-type']).toBe('image/webp');
  expect(served?.headers['x-content-type-options']).toBe('nosniff');
  expect(served?.headers['cache-control']).toBe('no-store');
  expect(served?.headers['content-security-policy']).toBe(
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  );
  expect(served?.headers['vary']).toMatch(/cookie/i);
  expect(served?.headers['content-encoding']).toBeUndefined();
}

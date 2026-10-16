import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
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
 * Content Security Policy violations of every page of the context: the `securitypolicyviolation`
 * events, reported as they happen (a page replaced by a fresh start page loses nothing), and
 * Chromium's console reports.
 */
export async function watchPolicy(context: BrowserContext): Promise<string[]> {
  const violations: string[] = [];
  await context.exposeFunction('ltwPolicyViolation', (text: string) => violations.push(text));
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { ltwPolicyViolation?: (text: string) => void })
        .ltwPolicyViolation;
      report?.(`${event.effectiveDirective} ${event.blockedURI.slice(0, 80)}`);
    });
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
  /** `sha256:<hex>` of the bytes the browser got. */
  readonly digest: string;
}

/** Every picture a page fetched from the content route, by content hash. */
export function watchPictures(page: Page): Map<string, Promise<Served>> {
  const seen = new Map<string, Promise<Served>>();
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    const match = /^\/api\/campaigns\/[^/]+\/assets\/content\/([^/]+)$/.exec(path);
    if (!match?.[1]) return;
    seen.set(
      decodeURIComponent(match[1]),
      (async () => ({
        status: response.status(),
        headers: await response.allHeaders(),
        digest: `sha256:${createHash('sha256')
          .update(await response.body())
          .digest('hex')}`,
      }))(),
    );
  });
  return seen;
}

/** The curated Ravenford pictures (fixtures/ravenford-ru/assets/manifest.json), by file. */
export const curatedHash = (file: string): string =>
  `sha256:${manifest.assets.find((entry) => entry.file === file)?.sha256 ?? 'missing'}`;

/** Every curated picture of an entity with a purpose. */
export const curatedHashes = (entityId: string, purpose: string): string[] =>
  manifest.assets
    .filter((entry) => entry.entityIds.includes(entityId) && entry.purpose === purpose)
    .map((entry) => `sha256:${entry.sha256}`);

/**
 * The picture an element shows: an object URL of decoded bytes the page fetched with its own
 * session (ADR 0026 §6), and the SHA-256 of those bytes, read back in the page.
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
  return image.evaluate(async (element) => {
    const bytes = await (await fetch((element as HTMLImageElement).src)).arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  });
}

/**
 * How the deployment serves an authorized picture (ADR 0022 §6, kept by the proxy): its media
 * type, `nosniff`, `no-store` (never kept by a browser or a shared cache), the server's sandbox
 * policy, varying on the cookie, uncompressed, and the bytes the hash names.
 */
export function expectServedAsContent(served: Served | undefined, hash: string): void {
  expect(served?.status).toBe(200);
  expect(served?.headers['content-type']).toBe('image/webp');
  expect(served?.headers['x-content-type-options']).toBe('nosniff');
  expect(served?.headers['cache-control']).toBe('no-store');
  expect(served?.headers['content-security-policy']).toBe(
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  );
  expect(served?.headers['vary']).toMatch(/cookie/i);
  expect(served?.headers['content-encoding']).toBeUndefined();
  expect(served?.digest).toBe(hash);
}

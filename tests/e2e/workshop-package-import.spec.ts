import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { SIGN_IN_ORIGIN, signInSeed } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import {
  workshopInvitationToken,
  workshopOwnerId,
} from '../../apps/server/src/testing/ui-workshop-links.ts';
import type { CampaignRevisionView } from '../../packages/contracts/src/index.ts';
import { expectAccessible } from './support/axe.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(120_000);

test('an owner previews a family package, retries the exact uncertain save and reads the checked revision', async ({
  page,
}) => {
  await page.goto(`/workshop/join#${workshopInvitationToken(signInSeed(), 'package-import')}`);
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  const created = await page.request.post('/api/workshop/drafts', {
    headers: {
      'x-workshop-owner': workshopOwnerId(signInSeed(), 'package-import'),
      origin: SIGN_IN_ORIGIN,
    },
    data: { requestId: randomUUID(), title: 'Family import', language: 'en' },
  });
  expect(created.status()).toBe(200);
  const draft = (await created.json()) as { draftId: string };
  await page.goto(`/workshop/drafts/${draft.draftId}`);
  await page.getByRole('tab', { name: 'Scenario', exact: true }).click();
  const input = page.getByLabel('Campaign package file', { exact: true });
  await expect(input).toBeVisible();
  await input.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.getByRole('alert')).toContainText('valid campaign package');
  await input.setInputFiles(
    fileURLToPath(new URL('../../campaigns/lighthouse/package.json', import.meta.url)),
  );
  const panel = page.getByRole('region', { name: 'Import a prepared campaign' });
  await expect(
    panel.getByRole('heading', { name: 'Маяк Между Ветрами', exact: true }),
  ).toBeVisible();
  const read = await page.request.get(`/api/workshop/drafts/${draft.draftId}/package`);
  expect(((await read.json()) as CampaignRevisionView).revision).toBeNull();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAccessible(page, `family package upload ${width}`);
    const auditModule = process.env['LTW_UI_AUDIT_MODULE'];
    if (auditModule) {
      const { auditPage } = (await import(auditModule)) as {
        auditPage: (page: Page) => Promise<{ level: string; rule: string }[]>;
      };
      const findings = await auditPage(page);
      await writeFile(
        `/tmp/lighthouse-import-audit-${width}.json`,
        JSON.stringify(findings, null, 2),
      );
      expect(findings.filter((f) => f.level === 'error' || f.level === 'warn')).toEqual([]);
    }
    await page.screenshot({ path: `/tmp/lighthouse-import-${width}.png`, fullPage: true });
  }
  const bodies: string[] = [];
  const endpoint = `**/api/workshop/drafts/${draft.draftId}/revisions`;
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    bodies.push(route.request().postData() ?? '');
    if (bodies.length === 1) {
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save package to this draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry original package save' })).toBeVisible();
  await expect(input).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Reload saved content', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Retry original package save' }).click();
  await expect(panel).toHaveCount(0);
  expect(bodies.length).toBe(2);
  expect(new Set(bodies).size).toBe(1);
  const saved = await page.request.get(`/api/workshop/drafts/${draft.draftId}/package`);
  const view = (await saved.json()) as CampaignRevisionView;
  expect(view.revision?.revision).toBe(1);
  expect(view.revision?.source.kind).toBe('OWNER');
  expect(view.assessment.readiness).toBe('READY');
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Scenario inspector', exact: true }),
  ).toBeVisible();
  await expect(input).toHaveCount(0);
});

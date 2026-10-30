import { expect, test } from '@playwright/test';
import type {
  AssetLineageResponse,
  CampaignDraftImagesView,
  CampaignRevisionView,
} from '../../packages/contracts/src/index.ts';

import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { draftApi } from './support/workshop.ts';
import {
  acknowledgeActivation,
  activationConfirm,
  activationOf,
  enterActivatedGame,
  expectPublished,
  openActivation,
} from './support/workshop-activation.ts';
import { closeSheet, dockButton, openSheet } from './support/shell.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60000);

test('picture activation adopts the exact chosen encoded bytes with honest preparation origin and no new generation', async ({
  page,
}) => {
  const name = 'activation-pictures',
    generation: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/(?:images\/jobs|generation|edits)$/.test(new URL(request.url()).pathname)
    )
      generation.push('generation');
  });
  await openActivation(page, name);
  const images = (await (
    await page.request.get(`${draftApi(name)}/images?revision=1`)
  ).json()) as CampaignDraftImagesView;
  const chosen = images.manifest.entries[0];
  if (!chosen) throw new Error('Chosen fixture picture missing');
  const original = await page.request.get(
    `${draftApi(name)}/images/content/${encodeURIComponent(chosen.contentHash)}?revision=1`,
  );
  expect(original.status()).toBe(200);
  const bytes = await original.body();
  expect(await acknowledgeActivation(page)).toBeGreaterThan(0);
  await activationConfirm(page).click();
  await expectPublished(page);
  const activated = await activationOf(page, name);
  expect(activated.textOnly).toBe(false);
  expect(activated.manifestDigest).toBe(images.manifest.digest);
  await enterActivatedGame(page);
  await expect(dockButton(page, 'Players')).toBeVisible();
  const base = `/api/campaigns/${activated.campaignId}`;
  const lineageResponse = await page.request.get(`${base}/assets`);
  expect(lineageResponse.status()).toBe(200);
  const lineage = (await lineageResponse.json()) as AssetLineageResponse;
  expect(lineage.requests).toEqual([]);
  const copied = lineage.assets.find((asset) => asset.contentHash === chosen.contentHash);
  expect(copied?.status).toBe('CANONICAL');
  expect(copied?.origin?.candidateId).toBe(chosen.candidateId);
  expect(copied?.origin?.revision).toBe(1);
  expect(copied?.origin?.manifestDigest).toBe(images.manifest.digest);
  const canonical = await page.request.get(
    `${base}/assets/content/${encodeURIComponent(chosen.contentHash)}?perspective=DM`,
  );
  expect(canonical.status()).toBe(200);
  expect((await canonical.body()).equals(bytes)).toBe(true);
  const revision = (await (
    await page.request.get(`${draftApi(name)}/revisions/1`)
  ).json()) as CampaignRevisionView;
  const iva = revision.revision?.identities.entities['iva'];
  if (!iva) throw new Error('Prepared image subject missing');
  await openSheet(page, 'Journal');
  await page.locator('#sheet-journal').getByRole('button', { name: /Iva/ }).click();
  await closeSheet(page, 'Journal');
  await expect(
    page.getByText('Imported from campaign preparation', { exact: false }),
  ).toBeVisible();
  expect(generation).toEqual([]);
});

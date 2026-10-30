import { expect, test } from '@playwright/test';
import type {
  CampaignEditingContext,
  CampaignRevisionView,
} from '../../packages/contracts/src/index.ts';

import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { draftApi, workshopOwner } from './support/workshop.ts';
import {
  acknowledgeActivation,
  activationConfirm,
  activationOf,
  chooseTextOnly,
  enterActivatedGame,
  expectPublished,
  openActivation,
  ownedCampaigns,
} from './support/workshop-activation.ts';
import { dockButton } from './support/shell.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60000);

test('explicit text-only consent keeps chosen draft pictures and retries the exact lost confirmation', async ({
  page,
}) => {
  const name = 'activation-text-only',
    bodies: string[] = [];
  await openActivation(page, name);
  await chooseTextOnly(page);
  expect(await acknowledgeActivation(page)).toBeGreaterThan(0);
  await page.route(`**${draftApi(name)}/activation`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    bodies.push(route.request().postData() ?? '');
    if (bodies.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort('failed');
    } else await route.continue();
  });
  await activationConfirm(page).click();
  await expect(
    page.getByRole('button', { name: 'Retry original activation confirmation', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Scenario', exact: true })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Text-only campaign', exact: true })).toBeDisabled();
  await page
    .getByRole('button', { name: 'Retry original activation confirmation', exact: true })
    .click();
  await expectPublished(page);
  expect(bodies).toHaveLength(2);
  expect(bodies[0] === bodies[1]).toBe(true);
  const accepted = await activationOf(page, name);
  expect(accepted.textOnly).toBe(true);
  const draftImages = await page.request.get(`${draftApi(name)}/images?revision=1`);
  expect(
    ((await draftImages.json()) as { manifest: { entries: unknown[] } }).manifest.entries,
  ).toHaveLength(1);
  await enterActivatedGame(page);
  await expect(dockButton(page, 'Players')).toBeVisible();
  const assets = await page.request.get(`/api/campaigns/${accepted.campaignId}/assets`);
  expect(assets.status()).toBe(200);
  expect(((await assets.json()) as { assets: unknown[]; requests: unknown[] }).assets).toEqual([]);
});

test('unpublished preparation stays closed and resumes its frozen source after a later draft edit', async ({
  page,
}) => {
  const name = 'activation-pending';
  await openActivation(page, name);
  await chooseTextOnly(page);
  await acknowledgeActivation(page);
  await activationConfirm(page).click();
  await expect(
    page.getByRole('heading', { name: 'Preparing your campaign', exact: true }),
  ).toBeVisible();
  const initial = await activationOf(page, name);
  expect(initial.status).toBe('PROVISIONING');
  expect((await ownedCampaigns(page)).campaigns).toEqual([]);
  const entry = await page.request.post(`/api/workshop/campaigns/${initial.campaignId}/sign-in`, {
    headers: { Origin: SIGN_IN_ORIGIN, 'x-workshop-owner': workshopOwner(name) },
    data: {},
  });
  expect(entry.status()).toBe(404);
  const ordinary = await page.request.get(`/api/campaigns/${initial.campaignId}/session`);
  expect(ordinary.status()).toBe(401);
  const contextResponse = await page.request.get(`${draftApi(name)}/editing`);
  const context = (await contextResponse.json()) as CampaignEditingContext;
  const content = {
    ...context.revision.content,
    world: { ...context.revision.content.world, name: 'A later workshop title' },
  };
  const saved = await page.request.post(`${draftApi(name)}/revisions`, {
    headers: { Origin: SIGN_IN_ORIGIN, 'x-workshop-owner': workshopOwner(name) },
    data: {
      requestId: crypto.randomUUID(),
      basedOnRevision: 1,
      content,
      expectedLockVersion: context.locks.version,
      expectedManifestVersion: context.manifest.version,
      expectedManifestDigest: context.manifest.digest,
    },
  });
  expect(saved.status()).toBe(200);
  expect(((await saved.json()) as CampaignRevisionView).revision?.revision).toBe(2);
  await page.reload();
  await page.getByRole('tab', { name: 'Activation', exact: true }).click();
  await expect(page.getByText('Confirmed revision: 1', { exact: true })).toBeVisible();
  const released = await page.request.post('/api/testing/workshop-activation-release', {
    headers: { Origin: SIGN_IN_ORIGIN },
    data: {},
  });
  expect(released.status()).toBe(200);
  await expectPublished(page);
  const finished = await activationOf(page, name);
  expect(finished.activationId).toBe(initial.activationId);
  expect(finished.campaignId).toBe(initial.campaignId);
  expect(finished.packageDigest).toBe(initial.packageDigest);
  expect(finished.revision).toBe(1);
  await enterActivatedGame(page);
  await expect(dockButton(page, 'Players')).toBeVisible();
  const session = await page.request.get(`/api/campaigns/${finished.campaignId}/session`);
  expect(((await session.json()) as { campaign: { name: string } }).campaign.name).toBe(
    'The Bell Beneath the Ice',
  );
});

test('revoking the workshop removes private activation UI and rejects a late accepted reply', async ({
  page,
}) => {
  const name = 'activation-revoked';
  await openActivation(page, name);
  await chooseTextOnly(page);
  await acknowledgeActivation(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = () => {};
  const accepted = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route(`**${draftApi(name)}/activation`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    reached();
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await activationConfirm(page).click();
    await accepted;
    const revoke = await page.request.post(`/api/testing/workshop-revoke/${name}`, {
      headers: { Origin: SIGN_IN_ORIGIN },
      data: {},
    });
    expect(revoke.status()).toBe(200);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await expect(
      page.getByRole('button', { name: 'Retry original activation confirmation', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Open your workshop with an invitation', exact: true }),
    ).toBeVisible();
    release();
    await expect(page.locator('body')).not.toContainText('The Bell Beneath the Ice');
    await expect(
      page.getByRole('heading', { name: 'Campaign ready to play', exact: true }),
    ).toHaveCount(0);
    expect((await page.request.get(`${draftApi(name)}/activation`)).status()).toBe(401);
  } finally {
    release();
  }
});

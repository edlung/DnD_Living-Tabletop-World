import { expect, test } from '@playwright/test';

import { SIGN_IN_ORIGIN, signInSeed } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { workshopInvitationToken } from '../../apps/server/src/testing/ui-workshop-links.ts';
import { draftApi, workshopOwner } from './support/workshop.ts';
import {
  enterCharacter,
  holdNextPreview,
  openWorldPreview,
  picturesRegion,
  viewRegion,
} from './support/workshop-preview.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
const signedOut = (page: Parameters<typeof openWorldPreview>[0]) =>
  page.getByRole('heading', { name: 'Open your workshop with an invitation', exact: true });

test('revocation clears the preview and picker before a delayed owner response can return', async ({
  page,
}) => {
  await openWorldPreview(page, 'preview-revoked');
  const held = await holdNextPreview(page, 'preview-revoked', 'OWNER');
  await page.getByLabel('View a location', { exact: true }).selectOption({ label: 'The Archive' });
  await held.seen;
  const revoked = await page.request.post('/api/testing/workshop-revoke/preview-revoked', {
    headers: { origin: SIGN_IN_ORIGIN },
  });
  expect(revoked.status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(signedOut(page)).toBeVisible();
  await held.release();
  await expect(viewRegion(page)).toHaveCount(0);
  await expect(picturesRegion(page)).toHaveCount(0);
  await expect(page.getByLabel('Choose a prepared character', { exact: true })).toHaveCount(0);
  expect(await page.locator('body').textContent()).not.toContain('The Bell Beneath the Ice');
});

test('late owner data cannot enter character mode, and a stale cookie response cannot clear a replacement owner session', async ({
  page,
}) => {
  await openWorldPreview(page, 'preview-stale');
  const dock = await page.getByLabel('View a location', { exact: true }).inputValue();
  const owner = await holdNextPreview(page, 'preview-stale', 'OWNER');
  await page
    .getByLabel('View a location', { exact: true })
    .selectOption({ label: 'The Old Sluice' });
  await owner.seen;
  const characterId = await enterCharacter(page);
  await owner.release();
  await expect(viewRegion(page).getByText('Initial view of Alena', { exact: true })).toBeVisible();
  await expect(page.getByLabel('View a location', { exact: true })).toHaveValue(dock);
  await expect(picturesRegion(page)).toHaveCount(0);
  await expect(page.getByLabel('Prepared encounter layout', { exact: true })).toHaveCount(0);
  const cookies = await page.context().cookies(`${SIGN_IN_ORIGIN}/api/workshop`);
  const cookie = cookies.find((entry) => entry.name.toLowerCase().includes('workshop'));
  if (!cookie) throw new Error('WORKSHOP_COOKIE_MISSING');
  const oldCookie = `${cookie.name}=${cookie.value}`;
  const character = await holdNextPreview(page, 'preview-stale', 'CHARACTER');
  await page.getByLabel('View a location', { exact: true }).selectOption({ label: 'The Archive' });
  await character.seen;
  const replacement = await page.request.post('/api/workshop/auth/redeem', {
    headers: { origin: SIGN_IN_ORIGIN },
    data: {
      token: workshopInvitationToken(signInSeed(), 'preview-replacement'),
      replaceSession: true,
    },
  });
  expect(replacement.status()).toBe(200);
  const oldLogout = await page.request.post('/api/workshop/auth/sign-out', {
    headers: { origin: SIGN_IN_ORIGIN, 'x-workshop-owner': workshopOwner('preview-stale') },
    data: {},
  });
  expect(oldLogout.status()).toBe(409);
  expect(oldLogout.headers()['set-cookie']).toBeUndefined();
  // A real response to an earlier credential must not expire the browser's newer cookie.
  const stale = await page.request.get(
    `${draftApi('preview-stale')}/preview?revision=1&perspective=CHARACTER&characterId=${characterId}`,
    {
      headers: { cookie: oldCookie, 'x-workshop-owner': workshopOwner('preview-stale') },
    },
  );
  expect(stale.status()).toBe(401);
  expect(stale.headers()['set-cookie']).toBeUndefined();
  const identity = await page.request.get('/api/workshop/auth/session', {
    headers: { origin: SIGN_IN_ORIGIN },
  });
  expect(await identity.json()).toEqual({ ownerId: workshopOwner('preview-replacement') });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(signedOut(page)).toBeVisible();
  await character.release();
  await expect(viewRegion(page)).toHaveCount(0);
  await expect(picturesRegion(page)).toHaveCount(0);
  expect(await page.locator('body').textContent()).not.toContain('Initial view of Alena');
  const retained = await page.request.get('/api/workshop/auth/session', {
    headers: { origin: SIGN_IN_ORIGIN },
  });
  expect(await retained.json()).toEqual({ ownerId: workshopOwner('preview-replacement') });
});

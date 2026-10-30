import { expect, test } from '@playwright/test';

import { SIGN_IN_ORIGIN, signInSeed } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import {
  WORKSHOP_CAMPAIGN,
  workshopInvitationToken,
} from '../../apps/server/src/testing/ui-workshop-links.ts';
import { dmToken, openInvitation, joinPath } from './support/sign-in.ts';
import { draftApi, draftPath, openWorkshopDraft, workshopOwner } from './support/workshop.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
const truth =
  'Iva activated the resonator left by her mentor. It is out of tune, and the bell responds to its mechanism.';

test('a campaign DM cookie and an unrelated workshop owner cannot read the scenario or its progress', async ({
  page,
}) => {
  await openInvitation(page, joinPath(dmToken(WORKSHOP_CAMPAIGN, 1)));
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const campaign = await page.request.get(`${draftApi('scenario-en')}/package`);
  expect(campaign.status()).toBe(401);
  expect(await campaign.text()).not.toContain(truth);
  await page.goto(draftPath('scenario-en'));
  await expect(
    page.getByRole('heading', { name: 'Open your workshop with an invitation', exact: true }),
  ).toBeVisible();
  await openWorkshopDraft(page, 'scenario-stale-b');
  await page.goto(draftPath('scenario-stale-a'));
  await expect(
    page.getByText('The draft could not be read. Try again.', { exact: true }),
  ).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain(truth);
  const foreign = await page.request.get(`${draftApi('scenario-stale-a')}/package`);
  const missing = await page.request.get(`/api/workshop/drafts/${crypto.randomUUID()}/package`);
  expect(foreign.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(((await foreign.json()) as { error: unknown }).error).toEqual(
    ((await missing.json()) as { error: unknown }).error,
  );
});

test('revocation removes the complete private editor before a delayed scenario response returns', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-revoked');
  await expect(page.getByRole('button', { name: truth, exact: true }).first()).toBeVisible();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let observed: () => void = () => undefined;
  const fetched = new Promise<void>((resolve) => {
    observed = resolve;
  });
  await page.route(`**${draftApi('scenario-revoked')}/package`, async (route) => {
    const response = await route.fetch();
    observed();
    await held;
    await route.fulfill({ response }).catch(() => undefined);
  });
  await page.getByRole('button', { name: 'Reload saved content', exact: true }).click();
  await fetched;
  const revoke = await page.request.post('/api/testing/workshop-revoke/scenario-revoked', {
    headers: { origin: SIGN_IN_ORIGIN },
  });
  expect(revoke.status()).toBe(200);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await expect(
    page.getByRole('heading', { name: 'Open your workshop with an invitation', exact: true }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('region', { name: 'Campaign scenario', exact: true })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain(truth);
});

test('the full scenario leaves the DOM synchronously before a history snapshot', async ({
  page,
}) => {
  await openWorkshopDraft(page, 'scenario-stale-a');
  await expect(page.getByRole('button', { name: truth, exact: true }).first()).toBeVisible();
  const leaked = await page.evaluate((secret) => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return {
      text: document.body.textContent.includes(secret),
      scenario: document.querySelector('.scenario-browser') !== null,
    };
  }, truth);
  expect(leaked).toEqual({ text: false, scenario: false });
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Scenario', exact: true })).toBeVisible();
  const other = await page.request.post('/api/workshop/auth/redeem', {
    headers: { origin: SIGN_IN_ORIGIN },
    data: {
      token: workshopInvitationToken(signInSeed(), 'scenario-replacement'),
      replaceSession: true,
    },
  });
  expect(other.status()).toBe(200);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await expect(
    page.getByRole('heading', { name: 'Open your workshop with an invitation', exact: true }),
  ).toBeVisible();
  const identity = await page.request.get('/api/workshop/auth/session', {
    headers: { origin: SIGN_IN_ORIGIN },
  });
  expect(await identity.json()).toEqual({ ownerId: workshopOwner('scenario-replacement') });
});

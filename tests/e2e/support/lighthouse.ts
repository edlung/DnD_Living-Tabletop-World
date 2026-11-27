import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

import { openSheet } from './shell.ts';
import { SIGN_IN_ORIGIN, dmToken } from './sign-in.ts';

export async function makeLighthouseTable(dm: Page, invitationCampaign: string) {
  const options = { headers: { origin: SIGN_IN_ORIGIN }, timeout: 150_000 };
  const joined = await dm.request.post('/api/auth/redeem', {
    ...options,
    data: {
      token: dmToken(invitationCampaign),
      newAccount: {
        login: invitationCampaign,
        password: randomUUID(),
        displayName: 'Мастер',
      },
    },
  });
  expect(joined.ok()).toBe(true);
  const made = await dm.request.post('/api/account/library-campaigns', {
    ...options,
    data: {
      requestId: randomUUID(),
      libraryId: 'lighthouse',
      variantId: 'original-party',
    },
  });
  expect(made.status()).toBe(201);
  const { campaignId } = (await made.json()) as { campaignId: string };
  const offer = await dm.request.post('/api/campaigns/' + campaignId + '/table-link', {
    ...options,
    data: {},
  });
  expect(offer.ok()).toBe(true);
  await dm.goto('/');
  await expect(dm.locator('#dock-book')).toBeAttached();
  return { campaignId, link: ((await offer.json()) as { link: string }).link };
}

export async function pairLighthouseScreen(dm: Page, tv: Page) {
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/);
  await openSheet(dm, 'Экран стола');
  const sheet = dm.locator('#sheet-screen');
  await sheet.getByLabel('Код экрана', { exact: true }).fill(await code.innerText());
  await sheet.getByRole('button', { name: 'Подключить', exact: true }).click();
  await expect(tv.locator('main.display')).toHaveAttribute('data-campaign-theme', 'lighthouse', {
    timeout: 30_000,
  });
}

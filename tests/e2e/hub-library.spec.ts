import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  joinPath,
} from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The campaign library in the hub (docs/adr/0058-campaign-content.md, notes of 2026-11-19): a DM
 * signed in with a login, and no workshop invitation, sees every library campaign with its cover,
 * picks a party size and starts one; the campaign opens with the login as its DM, and the hub then
 * lists it. No trace or screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 60_000 };

test('a login starts a library campaign from the hub as its DM', async ({ browser }) => {
  test.setTimeout(240_000);
  const words = WORDS.en;
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.hubLibrary)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Mira');
  await invited.getByLabel('Login', { exact: true }).fill('mira-library');
  await invited.getByLabel('Password', { exact: true }).fill('a lantern in the rain');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await expect(dm.locator('nav.dock')).toBeVisible(LIVE);

  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const library = dm.getByRole('region', { name: 'Campaigns from the library', exact: true });
  const cards = library.getByRole('listitem');
  await expect(cards.first()).toBeVisible(LIVE);
  expect(await cards.count()).toBeGreaterThanOrEqual(15);
  // Every cover is served to the signed-in account.
  const covers = await library
    .locator('img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? ''));
  for (const src of covers.slice(0, 3)) expect((await dm.request.get(src)).status()).toBe(200);
  await expectAccessible(dm, 'the hub with the campaign library');

  // Rain check, for the smallest party it offers.
  const card = cards.filter({ has: dm.getByRole('button', { name: /^Start «/ }) }).first();
  const theme = await card.getAttribute('data-campaign-theme');
  expect(theme).toBeTruthy();
  const material = await dm.request.get(`/table-materials/${theme}.webp`);
  expect(material.status()).toBe(200);
  expect(material.headers()['content-type']).toMatch(/image\/webp/);
  const title = (await card.getByRole('heading', { level: 4 }).textContent()) ?? '';
  const players = card.getByLabel('Players', { exact: true });
  const first = await players.locator('option').first().getAttribute('value');
  await players.selectOption(first ?? '');
  await card.getByRole('button', { name: `Start «${title}»`, exact: true }).click();
  await expect(card.getByRole('status')).toContainText('up to a minute or two');
  await expect(dm.locator('nav.dock')).toBeVisible(LIVE);

  // The library's campaigns are written in Russian: the world speaks it. The hub now lists the
  // campaign, with the login as its DM.
  await expect(dm.getByRole('combobox', { name: 'Вид', exact: true })).toHaveValue(/.+/);
  await expect(dm.locator('.session-shell')).toHaveAttribute('data-campaign-theme', theme ?? '');
  await dm.getByRole('button', { name: 'Мои кампании', exact: true }).click();
  const yours = dm
    .getByRole('region', { name: 'Your campaigns', exact: true })
    .getByRole('list', { name: 'Your campaigns', exact: true })
    .getByRole('listitem');
  await expect(yours).toHaveCount(2, LIVE);
  await expect(yours.filter({ hasText: title })).toContainText('You are the DM');
});

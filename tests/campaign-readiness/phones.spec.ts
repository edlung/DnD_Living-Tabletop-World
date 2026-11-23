import { expect, test, type Browser, type Page } from '@playwright/test';

import { checkBattle } from './battle.ts';
import { inspectScreen } from './visual.ts';
import themes from '../../apps/web/src/visual/campaign-themes/catalog.json' with { type: 'json' };
import {
  closeCharacter,
  closeSheet,
  expectDockFits,
  openCharacter,
  openSheet,
} from '../e2e/support/shell.ts';
import {
  accessState,
  dmToken,
  invite,
  joinPath,
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  takeSeat,
  WORDS,
} from '../e2e/support/sign-in.ts';

const titles = themes
  .map((theme) => theme.id)
  .filter((id) => !['ravenford', 'hollowmere'].includes(id));
const groups = [
  SIGN_IN_CAMPAIGNS.phoneGroup1,
  SIGN_IN_CAMPAIGNS.phoneGroup2,
  SIGN_IN_CAMPAIGNS.phoneGroup3,
  SIGN_IN_CAMPAIGNS.phoneGroup4,
  SIGN_IN_CAMPAIGNS.phoneGroup5,
  SIGN_IN_CAMPAIGNS.phoneGroup6,
];
const filter = process.env['LTW_PHONE_FILTER']?.split(',');
const live = { timeout: 60_000 };

async function account(dm: Page, campaign: string, browserName: string) {
  await dm.goto(joinPath(dmToken(campaign, browserName === 'webkit' ? 1 : 0)));
  const form = accessState(dm, WORDS.en.invited);
  await form.getByLabel('Your name at the table', { exact: true }).fill('Мастер');
  await form.getByLabel('Login', { exact: true }).fill('table-' + campaign + '-' + browserName);
  await form.getByLabel('Password', { exact: true }).fill('the old oak by the river');
  await form.getByRole('button', { name: WORDS.en.takeSeat, exact: true }).click();
  await expect(dm.locator('nav.book-parts')).toBeVisible(live);
}

async function checkPhone(browser: Browser, dm: Page, slug: string, width: number) {
  const ru = WORDS.ru;
  await openSheet(dm, ru.players);
  const choices = dm.locator('#sheet-players').getByLabel(ru.character, { exact: true });
  await expect(choices.locator('option:not([value=""])').first()).toBeAttached(live);
  const hero = await choices
    .locator('option')
    .evaluateAll((options) =>
      options.find((o) => o instanceof HTMLOptionElement && o.value)?.textContent.trim(),
    );
  if (!hero) throw Error(slug + ': no playable character');
  const link = await invite(dm, hero, ru);
  const heroId = await choices.inputValue();
  const context = await browser.newContext({
    baseURL: SIGN_IN_ORIGIN,
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    const player = await context.newPage();
    player.setDefaultTimeout(15_000);
    await player.goto(link);
    await player.getByRole('radio', { name: /Only this browser|Только этот браузер/i }).waitFor();
    await takeSeat(player, (await accessState(player, ru.invited).isVisible()) ? ru : WORDS.en);
    const shell = player.locator('.session-shell');
    await expect(shell).toHaveAttribute('data-campaign-theme', slug, live);
    await expectDockFits(player);
    expect(
      await shell.evaluate((el) => getComputedStyle(el).getPropertyValue('--table-material')),
    ).toContain(slug);
    const material = await player.request.get('/table-materials/' + slug + '.webp');
    expect(material.headers()['content-type']).toContain('image/webp');
    await openCharacter(player, 'Обзор', 'Персонаж');
    const card = player.locator('.hero-card');
    await expect(card.locator('.hero-name')).toHaveText(hero);
    await expect(card.locator('.hero-hp-value')).toContainText(/\d/);
    await expect(card.locator('img[src^="blob:"]')).toBeVisible(live);
    for (const tab of await player.locator('.hero-tabs button').all()) {
      const fits = await tab.evaluate(
        (el) => el.scrollWidth <= el.clientWidth + 1 && el.clientHeight >= 40,
      );
      expect(fits, slug + ': character tab label and touch area').toBe(true);
    }
    await inspectScreen(player, slug, 'hero');
    await openCharacter(player, 'Навыки', 'Персонаж');
    const bag = await openCharacter(player, 'Снаряжение', 'Персонаж');
    const item = bag.locator('.bag-tile,.doll-frame.is-filled').first();
    await expect(bag.locator('.doll-painted[src^="blob:"]')).toBeVisible(live);
    await item.click();
    await expect(bag.locator('.item-card')).toBeVisible();
    await expect(bag.locator('.item-card-art img')).toBeVisible(live);
    for (const select of await player
      .locator('.perspective-control select:visible,.item-card select:visible')
      .all()) {
      expect(
        await select.evaluate((el) => el.getBoundingClientRect().height),
        slug + ': touch menu',
      ).toBeGreaterThanOrEqual(40);
    }
    await inspectScreen(player, slug, 'inventory');
    await closeCharacter(player);
    await openSheet(player, 'Места');
    const map = player.locator('#sheet-places');
    await expect(map.locator('img.map-art[src^="blob:"]')).toBeVisible(live);
    await inspectScreen(player, slug, 'map');
    await closeSheet(player, 'Места');
    await openSheet(player, 'Кубики');
    const dice = player.locator('#sheet-dice');
    await dice.getByRole('button', { name: 'Добавить d20', exact: true }).click();
    const rolled = player.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/rolls'),
    );
    await dice.getByRole('button', { name: 'Бросить', exact: true }).click();
    const response = await rolled;
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { roll: { groups: { total: number }[] } };
    const total = body.roll.groups[0]?.total;
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(20);
    await expect(dice.getByRole('region', { name: 'Последние броски' })).toContainText(
      String(total),
      live,
    );
    await inspectScreen(player, slug, 'dice');
    if (process.env['LTW_PHONE_ENCOUNTERS'] === '1') {
      const base = new URL(response.url());
      await checkBattle(
        dm,
        player,
        base.origin + base.pathname.slice(0, -'/rolls'.length),
        heroId,
        slug,
      );
    }
    process.stdout.write(
      ['Verified mobile table', slug, width, browser.browserType().name()].join(' ') + '\n',
    );
  } finally {
    await context.close();
  }
  await closeSheet(dm, ru.players);
}

for (const [i, group] of groups.entries()) {
  const ids = titles.slice(i * 9, (i + 1) * 9).filter((s) => !filter || filter.includes(s));
  test('игровые столы ' + String(i + 1), async ({ browser, browserName }) => {
    test.skip(ids.length === 0);
    const dm = await browser.newPage({
      baseURL: SIGN_IN_ORIGIN,
      viewport: { width: 1360, height: 960 },
    });
    try {
      dm.setDefaultTimeout(15_000);
      await account(dm, group, browserName);
      for (const [index, slug] of ids.entries())
        await test.step(slug, async () => {
          await dm.getByRole('button', { name: /^(My campaigns|Мои кампании)$/ }).click();
          const card = dm.locator('.hub-library-card[data-campaign-theme="' + slug + '"]');
          await card.locator('button').last().click();
          await expect(dm.locator('.session-shell')).toHaveAttribute(
            'data-campaign-theme',
            slug,
            live,
          );
          await checkPhone(browser, dm, slug, index % 3 === 0 ? 320 : 390);
        });
    } finally {
      await dm.close();
    }
  });
}

test('встроенные приключения', async ({ browser, browserName }) => {
  const picks = ['hollowmere', 'ravenford'].filter((s) => !filter || filter.includes(s));
  test.skip(picks.length === 0);
  const dm = await browser.newPage({
    baseURL: SIGN_IN_ORIGIN,
    viewport: { width: 1360, height: 960 },
  });
  try {
    await account(dm, SIGN_IN_CAMPAIGNS.phoneBuiltin, browserName);
    for (const slug of picks)
      await test.step(slug, async () => {
        await dm.getByRole('button', { name: /^(My campaigns|Мои кампании)$/ }).click();
        const title = slug === 'hollowmere' ? /Hollowmere/i : /Missing Caravan/i;
        const adventure = dm
          .locator('.hub-adventure')
          .filter({ has: dm.getByRole('heading', { name: title }) });
        await adventure.getByRole('button', { name: /^In Russian:/ }).click();
        await expect(dm.locator('.session-shell')).toHaveAttribute(
          'data-campaign-theme',
          slug,
          live,
        );
        await checkPhone(browser, dm, slug, 390);
      });
  } finally {
    await dm.close();
  }
});

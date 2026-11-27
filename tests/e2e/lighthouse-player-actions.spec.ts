import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';
import type { RollEntry } from '../../packages/contracts/src/dice/rolls.ts';
import { expectAccessible } from './support/axe.ts';
import { makeLighthouseTable } from './support/lighthouse.ts';
import { closePages, freshPage } from './support/pages.ts';
import { openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN } from './support/sign-in.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });
test.afterEach(closePages);
const expect = baseExpect.configure({ timeout: 15_000 });

async function roll(player: Page, control: Locator) {
  const [response] = await Promise.all([
    player.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/rolls'),
    ),
    control.click(),
  ]);
  expect(response.status()).toBe(201);
  return ((await response.json()) as { roll: RollEntry }).roll;
}

test('a player reaches the table tools from any page and answers a private check without closing a draft', async ({
  browser,
}) => {
  test.setTimeout(155_000);
  const options = {
    baseURL: SIGN_IN_ORIGIN,
    locale: 'ru-RU',
    viewport: { width: 390, height: 844 },
  };
  const p = await freshPage(browser, options);
  const dm = await freshPage(browser, { ...options, viewport: { width: 1440, height: 900 } });
  const companion = await freshPage(browser, options);
  const table = await makeLighthouseTable(dm, SIGN_IN_CAMPAIGNS.lighthousePlayerActions);
  p.setDefaultTimeout(15_000);
  await p.goto(table.link);
  await p.getByRole('button', { name: /Ася/ }).click();
  await companion.goto(table.link);
  await companion.getByRole('button', { name: /Финн/ }).click();
  const nav = p.locator('.player-dock');
  const book = p.locator('#sheet-player-book');
  await expect(book.locator('.folio-portrait img')).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await p.setViewportSize({ width, height: 844 });
    for (const id of ['player-book', 'scene', 'character', 'dice', 'chat', 'more']) {
      const button = nav.locator('#dock-' + id);
      await expect(button).toBeInViewport();
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  }
  await p.setViewportSize(options.viewport);
  await p.locator('.player-settings > summary').click();
  await expect(p.locator('.player-settings #perspective')).toBeVisible();
  await p.keyboard.press('Escape');
  await expect(p.locator('.player-settings')).not.toHaveAttribute('open', '');
  await expect(book).toBeVisible();

  const actions = nav.getByRole('button', { name: 'Все действия' });
  await actions.click();
  await expectAccessible(p, 'the Lighthouse player’s actions at phone width');
  await nav.locator('#dock-page-evening').click();
  await expect(book.getByRole('button', { name: 'Встреча', exact: true })).toBeFocused();
  await nav.locator('#dock-dice').click();
  const dice = p.locator('#sheet-dice');
  const builder = dice.locator('.dice-builder');
  await expect(builder.getByRole('button', { name: 'Бросить d20' })).toBeInViewport();
  await builder.locator('.dice-audience select').selectOption('dm');
  const quick = await roll(p, builder.getByRole('button', { name: 'Бросить d20' }));
  expect(quick.groups[0]?.dice.map((die) => die.sides)).toEqual([20]);
  expect(quick.roller?.name).toBe('Ася Вереск');
  expect(quick.private).toBe(true);
  await builder.locator('.dice-picker .die-shape--d6').click();
  const chosen = await roll(p, builder.getByRole('button', { name: 'Бросить', exact: true }));
  expect(chosen.groups[0]?.dice.map((die) => die.sides)).toEqual([6]);
  const seen = await companion.request.get('/api/campaigns/' + table.campaignId + '/rolls', {
    params: { perspective: 'PLAYER' },
  });
  expect(seen.ok()).toBe(true);
  const visible = await seen.text();
  expect(visible).not.toContain(quick.rollId);
  expect(visible).not.toContain(chosen.rollId);
  await nav.locator('#dock-chat').click();
  await p.locator('#sheet-chat .sheet-close').click();
  await expect(book.locator('.folio-bookmarks [aria-current=page]')).toHaveText('Встреча');

  await actions.click();
  await nav.locator('#dock-notes').click();
  const form = p.getByRole('dialog').getByRole('region', { name: 'Мои заметки' });
  const leaves = p.locator('.hero-panel .story-leaves');
  await expect(leaves.getByRole('button', { name: 'Мои заметки' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(form.getByRole('button', { name: 'Написать заметку' })).toBeInViewport();
  await form.getByRole('button', { name: 'Написать заметку' }).click();
  const draft = form.getByLabel('Заметка', { exact: true });
  const words = 'Спросить про лампу у самого причала.';
  await draft.fill(words);
  await leaves.getByRole('button', { name: 'История героя' }).click();
  await expect(form).toBeHidden();
  await leaves.getByRole('button', { name: 'Мои заметки' }).click();
  await expect(draft).toHaveValue(words);
  await openSheet(dm, 'Кубики');
  const ask = dm.locator('#sheet-dice').getByRole('region', { name: 'Попросить проверку' });
  await ask.getByLabel('Персонаж', { exact: true }).selectOption({ label: 'Ася Вереск' });
  await ask.getByRole('checkbox', { name: /^Наедине/ }).check();
  await ask.getByRole('button', { name: 'Попросить', exact: true }).click();
  const call = p.locator('dialog.hero-dialog:modal .player-check-call');
  await expect(call).toContainText(/наедине/i);
  await expect(
    companion.locator('.player-check-call:visible, .dice-request.is-open:visible'),
  ).toHaveCount(0);
  await roll(p, call.getByRole('button', { name: 'Бросить', exact: true }));
  await expect(call).toHaveCount(0);
  await expect(draft).toHaveValue(words);
  await form.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect(form.locator('.story-notes')).toContainText(words);
});

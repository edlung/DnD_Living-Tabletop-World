import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { bookPart, dockSettled, openTopMenu } from '../e2e/support/shell.ts';
import {
  accessState,
  dmToken,
  joinPath,
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
} from '../e2e/support/sign-in.ts';

// Only the battlefield is photographed, after entering a new, synthetic Lighthouse game.
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

test('the illustrated fold-out in the Lighthouse harbour', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.bookLibrary)));
  const invitation = accessState(page, WORDS.en.invited);
  await invitation.getByLabel('Your name at the table', { exact: true }).fill('Mira');
  await invitation.getByLabel('Login', { exact: true }).fill('map-reader');
  await invitation.getByLabel('Password', { exact: true }).fill('a paper map at the table');
  await invitation.getByRole('button', { name: WORDS.en.takeSeat, exact: true }).click();
  await expect(page.locator('nav.book-parts')).toBeVisible({ timeout: 60000 });
  await openTopMenu(page);
  await page.getByRole('button', { name: /^(My campaigns|Мои кампании)$/ }).click();
  const title = 'Маяк Между Ветрами';
  await page.getByRole('button', { name: `Look inside the book «${title}»`, exact: true }).click();
  await page
    .getByRole('dialog', { name: title })
    .getByRole('button', { name: `Start «${title}»` })
    .click();
  await expect(page.locator('.session-shell h1')).toHaveText(title, { timeout: 60000 });
  const scene = bookPart(page, 'Сцена');
  if ((await scene.getAttribute('aria-current')) !== 'page') await scene.click();
  await page.getByRole('button', { name: 'Начать вечер', exact: true }).click();
  const session = page.locator('#sheet-session');
  await session.getByRole('button', { name: 'Начать сессию', exact: true }).click();
  await expect(session.locator('.session-running')).toBeVisible();
  await session.getByRole('button', { name: /^Закрыть/ }).first().click();
  if ((await scene.getAttribute('aria-current')) !== 'page') await scene.click();
  await page
    .getByRole('navigation', { name: 'Действия мастера' })
    .getByRole('button', { name: 'Бой', exact: true })
    .click();
  await page.getByRole('button', { name: 'Начать этот бой', exact: true }).first().click();
  const stage = page.locator('.stage--battle');
  const painted = stage.locator('.board--illustrated');
  await expect(painted.locator('.board-map')).toBeVisible({ timeout: 30000 });
  await expect(painted.locator('.token--party .miniature-art').first()).toBeVisible();
  const take = stage.getByRole('button', { name: 'Ходить за героя', exact: true });
  const play = stage.getByRole('button', { name: 'Сделать этот ход', exact: true });
  for (let turn = 0; turn < 6; turn++) {
    await expect(take.or(play).first()).toBeVisible();
    if (await take.isVisible()) break;
    const entries = stage.locator('.initiative-entry');
    const index = await entries.evaluateAll((items) =>
      items.findIndex((item) => item.matches('[aria-current="step"]')),
    );
    await play.click();
    await expect(entries.nth(index)).not.toHaveAttribute('aria-current', 'step');
  }
  await expect(take).toBeVisible();
  const output = 'test-results/foldout-review';
  await mkdir(output, { recursive: true });
  const result = page.locator('.world-main > .outcome button');
  if (await result.isVisible()) await result.click();
  await expect(page.locator('.dice-layer')).toBeHidden({ timeout: 90000 });
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${output}/lighthouse-dm.jpg`,
    quality: 87,
    animations: 'disabled',
  });
  await take.click();
  const ways = page.getByRole('group', { name: 'Выбрать действие' });
  await expect(ways.getByRole('button')).toHaveText(['Атака', 'Заклинание', 'Идти', 'Другое']);
  for (const [width, height] of [
    [766, 799],
    [1024, 768],
    [1280, 720],
    [1440, 900],
    [834, 1194],
  ] as const) {
    await page.setViewportSize({ width, height });
    await dockSettled(page);
    await expect(painted).toBeVisible();
    const frame = await painted.locator('.board-viewport').boundingBox();
    const art = await painted.locator('.board-map').boundingBox();
    const figure = painted.locator('.token.is-current');
    const base = await figure.locator('.token-ring').boundingBox();
    const body = await figure.locator('.miniature').boundingBox();
    if (!frame || !art || !base || !body) {
      throw new Error('The painted map or piece is missing');
    }
    expect(art.width).toBeGreaterThanOrEqual(frame.width - 2);
    expect(art.height).toBeGreaterThanOrEqual(frame.height - 2);
    expect(art.x).toBeLessThanOrEqual(frame.x + 2);
    expect(art.y).toBeLessThanOrEqual(frame.y + 2);
    expect(art.x + art.width).toBeGreaterThanOrEqual(frame.x + frame.width - 2);
    expect(art.y + art.height).toBeGreaterThanOrEqual(frame.y + frame.height - 2);
    const baseMiddle = base.x + base.width / 2;
    const figureMiddle = body.x + body.width / 2;
    expect(Math.abs(baseMiddle - figureMiddle)).toBeLessThan(2);
    for (const button of await ways.getByRole('button').all()) await button.click({ trial: true });
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `${output}/lighthouse-${String(width)}.jpg`,
      quality: 87,
      animations: 'disabled',
    });
  }
});

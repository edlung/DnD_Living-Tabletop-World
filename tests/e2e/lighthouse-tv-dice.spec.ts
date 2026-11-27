import { expect, test, type Page } from '@playwright/test';

import type { RollEntry, RollFeedResponse } from '../../packages/contracts/src/dice/rolls.ts';
import { makeLighthouseTable, pairLighthouseScreen } from './support/lighthouse.ts';
import { closePages, freshPage } from './support/pages.ts';
import { openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN } from './support/sign-in.ts';

test.use({
  baseURL: SIGN_IN_ORIGIN,
  trace: 'off',
  screenshot: 'off',
  launchOptions: { args: ['--enable-unsafe-swiftshader'] },
});
test.afterEach(closePages);

async function answerCheck(dm: Page, player: Page, privateCheck = false) {
  await openSheet(dm, 'Кубики');
  const ask = dm.locator('#sheet-dice').getByRole('region', { name: 'Попросить проверку' });
  await ask.getByLabel('Персонаж', { exact: true }).selectOption({ label: 'Ася Вереск' });
  await ask.getByRole('checkbox', { name: /^Наедине/ }).setChecked(privateCheck);
  await ask.getByRole('button', { name: 'Попросить', exact: true }).click();
  const reply = player.waitForResponse(
    (r) => new URL(r.url()).pathname.endsWith('/rolls') && r.request().method() === 'POST',
  );
  const request = player.locator(
    '#sheet-player-book:visible .dice-request.is-open, .asked-check:visible',
  );
  await request.getByRole('button', { name: 'Бросить', exact: true }).first().click();
  const response = await reply;
  expect(response.status()).toBe(201);
  return ((await response.json()) as { roll: RollEntry }).roll;
}

test('the DM casts a player’s actual roll over a scene and a fight, keeping private rolls off the TV', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const opts = { baseURL: SIGN_IN_ORIGIN, locale: 'ru-RU', viewport: { width: 1440, height: 900 } };
  const dm = await freshPage(browser, opts);
  const player = await freshPage(browser, { ...opts, viewport: { width: 390, height: 844 } });
  const tv = await freshPage(browser, { ...opts, viewport: { width: 1280, height: 720 } });
  const table = await makeLighthouseTable(dm, SIGN_IN_CAMPAIGNS.lighthouseTvDice);
  await pairLighthouseScreen(dm, tv);
  await player.goto(table.link);
  await player.getByRole('button', { name: /Ася/ }).click();
  await expect(player.locator('#sheet-player-book')).toBeVisible({ timeout: 30_000 });

  const settings = dm
    .locator('#sheet-screen')
    .getByRole('region', { name: 'Что показывают экраны' });
  const optIn = settings.getByRole('checkbox', { name: 'Показывать открытые броски игроков в 3D' });
  const cast = settings.getByRole('button', { name: 'Показать на экранах' });
  const stage = tv.locator('.display-dice-stage');
  await expect(optIn).not.toBeChecked();
  await expect(stage).toHaveCount(0);
  await optIn.check();
  await cast.click();
  await expect(stage).toBeAttached({ timeout: 20_000 });
  // Pair the receiver once; reloading the TV retains the DM's choice without replaying old rolls.
  await tv.reload();
  await expect(stage).toBeAttached({ timeout: 20_000 });
  const rollsPath = '/api/campaigns/' + table.campaignId + '/rolls';
  const sent = new Set<string>();
  tv.on('response', async (response) => {
    if (new URL(response.url()).pathname === rollsPath && response.ok()) {
      const feed = (await response.json().catch(() => null)) as RollFeedResponse | null;
      for (const entry of feed?.rolls ?? []) sent.add(entry.rollId);
    }
  });

  const secret = await answerCheck(dm, player, true);
  expect(secret.private).toBe(true);
  const secretDm = await dm.request.post(rollsPath, {
    headers: { origin: SIGN_IN_ORIGIN },
    params: { perspective: 'DM' },
    data: { kind: 'dice', dice: [{ sides: 20, count: 1 }], modifier: 0, hidden: true },
  });
  expect(secretDm.status()).toBe(201);
  const privateDmId = ((await secretDm.json()) as { roll: RollEntry }).roll.rollId;
  await expect(stage).toBeHidden();

  const sceneRoll = await answerCheck(dm, player);
  const sceneGroup = sceneRoll.groups[0];
  if (!sceneGroup) throw new Error('The requested check has no dice');
  await expect(stage).toHaveAttribute('data-roll', sceneRoll.rollId, { timeout: 20_000 });
  await expect(stage).toHaveAttribute('data-rolling', '', { timeout: 12_000 });
  await expect(stage.locator('.dice-plate-who')).toContainText('Ася');
  await expect(stage.locator('.dice-plate-sum')).toHaveCount(0);
  await expect(stage).toHaveAttribute('data-landed', '', { timeout: 12_000 });
  await expect(stage.locator('.display-die-face')).toHaveText(
    sceneGroup.dice.map((die) => String(die.value)),
  );
  await expect(stage.locator('.dice-plate-sum')).toHaveText(
    new RegExp('(?:^|= )' + String(sceneGroup.total) + '$'),
  );
  await expect(stage).toBeHidden({ timeout: 15_000 });
  await expect(tv.locator('.display-scene')).toBeVisible();
  expect(sent.has(sceneRoll.rollId)).toBe(true);
  expect(sent.has(secret.rollId)).toBe(false);
  expect(sent.has(privateDmId)).toBe(false);
  await tv.reload();
  await expect(stage).toBeAttached({ timeout: 20_000 });
  await expect(stage).toBeHidden();

  await openSheet(dm, 'Схватка');
  await dm
    .locator('#sheet-encounter')
    .getByRole('button', { name: 'Начать: Смотрители причала' })
    .click();
  await expect(tv.locator('.display-board')).toBeVisible({ timeout: 30_000 });
  await tv.emulateMedia({ reducedMotion: 'reduce' });
  const battleRoll = await answerCheck(dm, player);
  await expect(stage).toHaveAttribute('data-roll', battleRoll.rollId, { timeout: 20_000 });
  await expect(stage).toHaveAttribute('data-landed', '');
  await expect(stage).not.toHaveAttribute('data-rolling', '');
  await expect(stage.locator('.display-die-face')).toHaveText(
    battleRoll.groups.flatMap((group) => group.dice.map((die) => String(die.value))),
  );
  await expect(stage).toBeHidden({ timeout: 15_000 });
  await expect(tv.locator('.display-battle .initiative-band')).toBeVisible();

  await openSheet(dm, 'Экран стола');
  await expect(optIn).toBeChecked();
  await optIn.uncheck();
  await cast.click();
  await expect(stage).toHaveCount(0, { timeout: 20_000 });
  const plain = await answerCheck(dm, player);
  await expect(tv.locator('.display-big-roll')).toHaveAttribute('data-roll', plain.rollId, {
    timeout: 20_000,
  });
  await expect(tv.locator('.display-board')).toBeVisible();

  await openSheet(dm, 'Экран стола');
  await optIn.check();
  await cast.click();
  await expect(stage).toBeAttached({ timeout: 20_000 });
  const last = await answerCheck(dm, player);
  await expect(stage).toHaveAttribute('data-roll', last.rollId, { timeout: 20_000 });
  await openSheet(dm, 'Экран стола');
  await settings.getByRole('radio', { name: /тёмный экран/i }).check();
  await cast.click();
  await expect(tv.locator('main.display')).toHaveAttribute('data-cast', 'blank', {
    timeout: 20_000,
  });
  await expect(stage).toHaveCount(0);
});

import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

import { makeLighthouseTable, pairLighthouseScreen } from './support/lighthouse.ts';
import { closePages, freshPage } from './support/pages.ts';
import { openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN } from './support/sign-in.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });
test.afterEach(closePages);
const book = (p: Page) => p.locator('#sheet-player-book');
const name = 'Янтарь Ветрочёт';

async function createHero(player: Page) {
  await book(player).getByRole('button', { name: 'Создать своего героя' }).click();
  const form = player.locator('dialog.builder-dialog[open]');
  const next = form.getByRole('button', { name: 'Далее', exact: true });
  const firstChoices = async (group: RegExp, count: number) => {
    const choices = form.getByRole('group', { name: group }).getByRole('checkbox');
    for (let n = 0; n < count; n++) await choices.nth(n).check();
  };
  await form.getByRole('radio', { name: /^Плут/ }).click();
  await next.click();
  await form.getByRole('radio', { name: /^Полурослик/ }).click();
  await form.getByRole('radio', { name: /^Преступник/ }).click();
  await firstChoices(/^Языки помимо/, 3);
  await next.click();
  await next.click();
  await firstChoices(/^Навыки класса/, 4);
  await firstChoices(/^Мастерство(?! оружия)/, 2);
  await firstChoices(/^Мастерство оружия/, 2);
  for (let n = 0; n < 3; n++) await next.click();
  await expect(form.locator('.builder-nav-open')).toHaveCount(0);
  await form.getByLabel('Имя', { exact: true }).fill(name);
  await form.getByRole('button', { name: 'Создать персонажа', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(book(player).getByRole('heading', { name })).toBeVisible({ timeout: 30_000 });
}

async function playFight(dm: Page, player: Page, tv: Page, campaignId: string) {
  await openSheet(dm, 'Схватка');
  const controls = dm.locator('#sheet-encounter');
  await expect(controls.getByRole('button', { name: 'Начать: Смотрители причала' })).toBeEnabled();
  await expect(controls.getByRole('checkbox', { name: new RegExp(name) })).toBeChecked();
  await controls.getByRole('checkbox', { name: /Ася Вереск/ }).uncheck();
  const start = controls.getByRole('button', { name: 'Начать схватку', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  const field = player.getByRole('region', { name: 'Поле боя', exact: true });
  await expect(field).toBeVisible({ timeout: 30_000 });
  await expect(book(player)).toBeHidden();
  await expect(tv.locator('.display-board')).toHaveAttribute('inert', '', { timeout: 30_000 });
  await expect(tv.locator('.display-battle .initiative-band')).toBeVisible();
  await expect(tv.locator('.turn-tray')).toHaveCount(0);
  await expect(tv.locator('.display-board .miniature[data-plinth]').first()).toBeVisible({
    timeout: 30_000,
  });
  const panels = player.getByRole('button', { name: 'Панели боя' });
  await expect(panels).toHaveAttribute('aria-expanded', 'false');
  const viewport = field.locator('.board-viewport');
  for (const width of [390, 320]) {
    await player.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        viewport.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return box.top < 180 && box.width >= innerWidth * 0.9 && box.height >= innerHeight * 0.45;
        }),
      )
      .toBe(true);
  }
  await panels.click();
  const expand = player.getByRole('button', { name: 'Развернуть карту' });
  await expect(expand).toHaveAttribute('aria-expanded', 'true');
  await expand.click();
  await field.getByRole('button', { name: 'Показать всё поле' }).click();
  await expect
    .poll(async () => {
      const plane = await field.locator('.board-plane').boundingBox();
      const frame = await viewport.boundingBox();
      return !!plane && !!frame && plane.width <= frame.width && plane.height <= frame.height;
    })
    .toBe(true);
  await player.setViewportSize({ width: 1440, height: 900 });
  const path = '/api/campaigns/' + campaignId;
  const read = async () => {
    const response = await dm.request.get(path + '/encounter', { params: { perspective: 'DM' } });
    expect(response.ok()).toBe(true);
    return (
      (await response.json()) as {
        encounter: {
          currentCombatantId: string;
          combatants: {
            entity: { entityId: string; name: string };
            position: { x: number; y: number };
          }[];
        };
      }
    ).encounter;
  };
  let fight = await read();
  const hero = fight.combatants.find((c) => c.entity.name === name);
  if (!hero) throw new Error('New party member did not join the harbour fight');
  for (
    let n = 0;
    n < fight.combatants.length && fight.currentCombatantId !== hero.entity.entityId;
    n++
  ) {
    const ended = await dm.request.post(path + '/commands', {
      headers: { origin: SIGN_IN_ORIGIN },
      data: {
        commandId: randomUUID(),
        command: { type: 'EndTurn', combatantId: fight.currentCombatantId },
      },
    });
    expect(await ended.json()).toMatchObject({ status: 'accepted' });
    fight = await read();
  }
  const tray = player.locator('.turn-tray');
  await expect(tray).toBeVisible({ timeout: 30_000 });
  const x = hero.position.x + 1,
    y = hero.position.y;
  await field.locator(`button[data-x="${String(x)}"][data-y="${String(y)}"]`).focus();
  await player.keyboard.press('Enter');
  await field.getByRole('button', { name: 'Идти сюда', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await read()).combatants.find((c) => c.entity.entityId === hero.entity.entityId)?.position,
    )
    .toEqual({ x, y });
  await tray.getByRole('button', { name: 'Закончить ход', exact: true }).click();
  await expect(tray).toBeHidden();
  await controls.getByRole('button', { name: 'Завершить схватку', exact: true }).click();
  await controls.getByRole('button', { name: 'Да, завершить схватку', exact: true }).click();
  await expect(field).toBeHidden({ timeout: 30_000 });
}

test('a Lighthouse player takes a seat, creates a hero, rolls, fights and reads their chapter', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const options = {
    baseURL: SIGN_IN_ORIGIN,
    locale: 'ru-RU',
    viewport: { width: 1440, height: 900 },
  };
  const dm = await freshPage(browser, options);
  const player = await freshPage(browser, options);
  const companion = await freshPage(browser, options);
  const tv = await freshPage(browser, { ...options, viewport: { width: 1920, height: 1080 } });
  dm.setDefaultTimeout(15_000);
  player.setDefaultTimeout(15_000);
  const table = await makeLighthouseTable(dm, SIGN_IN_CAMPAIGNS.lighthousePlayerBook);
  await openSheet(dm, 'Сессия');
  const session = dm.locator('#sheet-session');
  await session.getByLabel('Название', { exact: true }).fill('Первый огонь');
  await session.getByRole('button', { name: 'Начать сессию', exact: true }).click();
  await pairLighthouseScreen(dm, tv);

  await player.goto(table.link);
  const seats = player.locator('[data-seat-edition="lighthouse"]');
  await expect(seats.locator('.table-seat')).toHaveCount(3);
  for (const hero of ['Финн', 'Тэс', 'Ася'])
    await expect(seats.getByRole('button', { name: new RegExp(hero) })).toBeVisible();
  await seats.getByRole('button', { name: /Ася/ }).click();
  await expect(book(player)).toBeVisible({ timeout: 30_000 });
  await expect(book(player)).toContainText('Ася');
  await expect(book(player).locator('.folio-portrait img')).toBeVisible();
  await expect(player.locator('#dock-book')).toHaveCount(0);
  await companion.goto(table.link);
  const remaining = companion.locator('[data-seat-edition="lighthouse"]');
  await expect(remaining.locator('.table-seat')).toHaveCount(2);
  await expect(remaining.getByRole('button', { name: /Ася/ })).toHaveCount(0);
  await remaining.getByRole('button', { name: /Финн/ }).click();
  await expect(book(companion).getByRole('heading', { name: /Финн/ })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await player.setViewportSize({ width, height: 900 });
    expect(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(
      book(player).getByRole('button', { name: 'Создать своего героя' }),
    ).toBeInViewport();
  }
  await player.setViewportSize(options.viewport);
  await book(player).getByRole('button', { name: 'Рюкзак и снаряжение' }).click();
  await expect(player.locator('dialog[open] .inventory')).toBeVisible();
  await player.keyboard.press('Escape');
  await book(player).getByRole('button', { name: 'Заклинания' }).click();
  await expect(player.getByRole('tab', { name: 'Заклинания' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await player.keyboard.press('Escape');
  for (const [label, id] of [
    ['Места и путешествия', 'places'],
    ['Открытия и материалы', 'journal'],
    ['Броски и просьбы мастера', 'dice'],
  ] as const) {
    await book(player).getByRole('button', { name: label }).click();
    const sheet = player.locator('#sheet-' + id);
    await expect(sheet).toBeVisible();
    await sheet.locator('.sheet-close').click();
    await expect(book(player)).toBeVisible();
  }
  await book(player).getByRole('button', { name: 'Разговор за столом' }).click();
  const chat = player.locator('#sheet-chat');
  await chat.locator('textarea').fill('Я вижу огонь маяка.');
  await chat.locator('button[type=submit]').click();
  await expect(chat.locator('.chat-log')).toContainText('Я вижу огонь маяка.');
  await chat.locator('.sheet-close').click();
  await createHero(player);
  await player.reload();
  await expect(book(player).getByRole('heading', { name })).toBeVisible({ timeout: 30_000 });

  await openSheet(dm, 'Отряд');
  const ask = dm.locator('#sheet-party').getByRole('region', { name: /проверку/i });
  await ask.getByLabel('Персонаж', { exact: true }).selectOption({ label: name });
  await ask.getByRole('button', { name: 'Попросить', exact: true }).click();
  const asked = player.locator('.asked-check');
  await expect(asked).toBeVisible();
  await expect(companion.locator('.asked-check')).toHaveCount(0);
  await asked.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect(asked).toHaveCount(0);
  await playFight(dm, player, tv, table.campaignId);
  await openSheet(dm, 'Сессия');
  await session.getByRole('button', { name: 'Завершить сессию', exact: true }).click();
  const kept = 'Мы провели первый бой у фонарей гавани.';
  await session.getByLabel(/^Главное за вечер/).fill(kept);
  await expect(
    session.getByRole('checkbox', { name: 'Написать главу об этой сессии' }),
  ).toBeChecked();
  await session.getByRole('button', { name: 'Да, завершить сессию', exact: true }).click();
  await expect(session.locator('.session-ended')).toContainText('Игроки прочтут её в хронике', {
    timeout: 30_000,
  });
  await openSheet(player, 'Книга игрока');
  await book(player).getByRole('button', { name: 'Хроника', exact: true }).click();
  await expect(
    player.locator('.chronicle-dialog[open]').getByRole('heading', { name: 'Первый огонь' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(player.locator('.chronicle-dialog[open]')).toContainText(kept);
  await openSheet(dm, 'Экран стола');
  const cast = dm.locator('#sheet-screen').getByRole('region', { name: 'Что показывают экраны' });
  await cast.getByRole('radio', { name: 'Новую главу хроники', exact: true }).check();
  await cast.getByRole('button', { name: 'Показать на экранах', exact: true }).click();
  await expect(tv.locator('.display-chronicle')).toContainText(kept, { timeout: 30_000 });
});

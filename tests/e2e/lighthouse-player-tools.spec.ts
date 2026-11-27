import { randomUUID } from 'node:crypto';
import { expect as baseExpect, test, type Page } from '@playwright/test';

import type {
  EncounterResponse,
  EncounterView,
} from '../../packages/contracts/src/combat/views.ts';
import type { CharacterSheetResponse } from '../../packages/contracts/src/rules/character-view.ts';
import type { LobbyResponse } from '../../packages/contracts/src/session/lobby.ts';
import { expectAccessible } from './support/axe.ts';
import { makeLighthouseTable } from './support/lighthouse.ts';
import { closePages, freshPage } from './support/pages.ts';
import { openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN } from './support/sign-in.ts';

const expect = baseExpect.configure({ timeout: 18_000 });
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });
test.afterEach(closePages);
const desktop = {
  baseURL: SIGN_IN_ORIGIN,
  locale: 'ru-RU',
  viewport: { width: 1440, height: 900 },
};
const phone = { ...desktop, viewport: { width: 390, height: 844 } };
const headers = { origin: SIGN_IN_ORIGIN };
const book = (p: Page) => p.locator('#sheet-player-book');

async function takeSeat(p: Page, link: string, name: RegExp) {
  p.setDefaultTimeout(18_000);
  await p.goto(link);
  await p.locator('.table-offer').getByRole('button', { name }).click();
  await expect(book(p).getByRole('heading', { name })).toBeVisible();
}

async function leaf(p: Page, name: string) {
  const button = book(p).getByRole('navigation').getByRole('button', { name, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
}

async function read<T>(page: Page, path: string, perspective = 'DM'): Promise<T> {
  const response = await page.request.get(path, { params: { perspective } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as T;
}

async function notesOf(p: Page) {
  await leaf(p, 'Дневник');
  await book(p).getByRole('button', { name: 'Личные заметки и предыстория' }).click();
  const notes = p.getByRole('dialog').getByRole('region', { name: 'Мои заметки' });
  await expect(notes).toBeVisible();
  return notes;
}

async function startSession(dm: Page) {
  await openSheet(dm, 'Сессия');
  const session = dm.locator('#sheet-session');
  await session.getByLabel('Название', { exact: true }).fill('Сигнал из гавани');
  await session.getByRole('button', { name: 'Начать сессию', exact: true }).click();
  await expect(session.getByRole('button', { name: 'Начать сессию', exact: true })).toBeHidden();
}

test('three Lighthouse seats use their own book, private handouts, notes and meeting', async ({
  browser,
}) => {
  test.setTimeout(210_000);
  const dm = await freshPage(browser, desktop);
  const asya = await freshPage(browser, phone);
  const finn = await freshPage(browser, phone);
  const tess = await freshPage(browser, desktop);
  const table = await makeLighthouseTable(dm, SIGN_IN_CAMPAIGNS.lighthousePlayerTools);
  const path = '/api/campaigns/' + table.campaignId;
  await takeSeat(asya, table.link, /Ася/);
  await takeSeat(finn, table.link, /Финн/);
  await takeSeat(tess, table.link, /Тэс/);
  const lobby = await read<LobbyResponse>(dm, path + '/lobby');
  const id = lobby.characters.find((c) => c.character.name.includes('Ася'))?.character.entityId;
  if (!id) throw new Error('Ася отсутствует в отряде');
  const { sheet } = await read<CharacterSheetResponse>(
    asya,
    path + '/entities/' + id + '/sheet',
    'PLAYER',
  );
  await expect(book(asya).locator('.folio-vitals dd').first()).toContainText(
    String(sheet.hitPoints.current),
  );
  await expect(book(asya).locator('.folio-vitals dd').nth(1)).toHaveText(String(sheet.armorClass));
  await book(asya).getByRole('button', { name: 'Навыки', exact: true }).click();
  await expect(asya.getByRole('tab', { name: 'Навыки' })).toHaveAttribute('aria-selected', 'true');
  await asya.keyboard.press('Escape');

  const mine = await notesOf(asya);
  const secret = 'Красную линзу я отдала смотрителю.';
  await mine.getByRole('button', { name: 'Написать заметку' }).click();
  await mine.getByLabel('Заметка', { exact: true }).fill(secret);
  await mine.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect(mine.locator('.story-notes li')).toContainText(secret);
  await asya.keyboard.press('Escape');
  const journalLink = book(asya).getByRole('button', { name: 'Открытия и материалы' });
  await journalLink.click();
  await asya.reload();
  await asya
    .locator('#sheet-journal')
    .getByRole('button', { name: /^Закрыть:/ })
    .click();
  await expect(journalLink).toBeFocused();
  await expect(book(asya).getByRole('button', { name: 'Дневник', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const title = 'Ключ для Аси';
  const clue = 'В сундуке у восточного окна лежит вторая линза.';
  const given = await dm.request.post(path + '/handouts', {
    headers,
    params: { perspective: 'DM' },
    data: { title, text: clue, recipientId: id },
  });
  expect(given.ok()).toBe(true);
  await book(asya)
    .getByRole('button', { name: 'Прочитать новый материал «' + title + '»' })
    .click();
  const handout = asya.locator('#sheet-journal .handout').filter({ hasText: title });
  await expect(handout).toBeFocused();
  await expect(handout).toContainText(clue);
  await asya
    .locator('#sheet-journal')
    .getByRole('button', { name: /^Закрыть:/ })
    .click();
  await expect(book(asya).locator('.folio-new-handout')).toHaveCount(0);
  await expect(book(asya).locator('.folio-handouts')).toContainText(title);
  for (const other of [finn, tess]) {
    const theirs = await notesOf(other);
    await expect(theirs.locator('.story-notes li')).toHaveCount(0);
    await other.keyboard.press('Escape');
    await expect(book(other)).not.toContainText(title);
    expect(JSON.stringify(await read<unknown>(other, path + '/handouts', 'PLAYER'))).not.toContain(
      clue,
    );
  }

  await leaf(asya, 'Отряд');
  const party = book(asya).locator('.folio-companions');
  await expect(party.locator('.rail-member')).toHaveCount(3);
  await party.getByRole('button', { name: /Финн/ }).click();
  await expect(asya.locator('.detail-panel:not([hidden])')).toContainText('Финн');
  await asya.keyboard.press('Escape');
  await expect(party.getByRole('button', { name: /Финн/ })).toBeFocused();

  await leaf(asya, 'Встреча');
  const meeting = book(asya).locator('.folio-meeting');
  await meeting.getByRole('button', { name: 'Я готов', exact: true }).click();
  await expect(meeting.getByRole('button', { name: 'Готов — отменить' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const when = new Date(Date.now() + 7 * 86400_000).toISOString();
  expect(
    (
      await dm.request.post(path + '/lobby', {
        headers,
        params: { perspective: 'DM' },
        data: {
          mode: 'online',
          nextGame: { at: when, note: 'Продолжение у причала' },
        },
      })
    ).ok(),
  ).toBe(true);
  await meeting.getByRole('button', { name: 'Приду' }).click();
  await expect(meeting.getByRole('button', { name: 'Приду' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(book(asya).getByRole('button', { name: 'Экран стола' })).toBeVisible();
  await book(asya).getByRole('button', { name: 'Правила' }).click();
  await asya
    .locator('#sheet-rules')
    .getByRole('button', { name: /^Закрыть:/ })
    .click();
  await expect(book(asya).getByRole('button', { name: 'Правила' })).toBeFocused();

  await startSession(dm);
  await meeting.getByRole('button', { name: 'Что я могу сделать?' }).click();
  await expect(asya.locator('dialog.hint-dialog:modal')).toBeVisible();
  await asya.keyboard.press('Escape');
  await meeting.getByRole('button', { name: 'Попросить паузу' }).click();
  await expect(meeting.locator('.pause-asked')).toBeVisible();
  await expect(dm.locator('.pause-card')).toContainText('Ася');
  await leaf(finn, 'Встреча');
  await expect(book(finn).getByRole('button', { name: 'Попросить паузу' })).toBeVisible();
  await expect(book(finn).locator('.pause-asked')).toHaveCount(0);
  await expectAccessible(asya, 'the player’s Lighthouse meeting page');

  const session = dm.locator('#sheet-session');
  await session.getByRole('button', { name: 'Завершить сессию', exact: true }).click();
  await session.getByLabel(/^Главное за вечер/).fill('Мы зажгли обе линзы.');
  await session.getByRole('button', { name: 'Да, завершить сессию', exact: true }).click();
  const stars = meeting.locator('.stars-card');
  await stars.getByRole('button', { name: 'Написать' }).click();
  const memory = 'Вместе нашли вторую линзу.';
  const wish = 'Хочу поговорить с хранителем архива.';
  await stars.getByLabel(/^Звезда:/).fill(memory);
  await stars.getByLabel(/^Пожелание:/).fill(wish);
  await leaf(asya, 'Отряд');
  await leaf(asya, 'Встреча');
  await expect(stars.getByLabel(/^Пожелание:/)).toHaveValue(wish);
  await stars.getByRole('button', { name: 'Сохранить', exact: true }).click();
  const otherStars = book(finn).locator('.stars-card');
  await expect(otherStars).toContainText(memory);
  await expect(otherStars).not.toContainText(wish);
  await book(asya).getByRole('button', { name: 'Хроника', exact: true }).click();
  await expect(asya.locator('.chronicle-dialog[open]')).toContainText('Мы зажгли обе линзы.');
});

async function command(dm: Page, path: string, action: object) {
  const response = await dm.request.post(path + '/commands', {
    headers,
    data: { commandId: randomUUID(), command: action },
  });
  expect(await response.json()).toMatchObject({ status: 'accepted' });
}

function emptyLane(fight: EncounterView) {
  const { width, height, walls = [] } = fight.battlefield;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x + 2 < width; x++) {
      const lane = [x, x + 1, x + 2].map((column) => ({ x: column, y }));
      const clear = lane.every(
        (cell) =>
          !walls.some((wall) => wall.x === cell.x && wall.y === cell.y) &&
          fight.combatants.every(
            ({ position }) =>
              Math.max(Math.abs(position.x - cell.x), Math.abs(position.y - cell.y)) > 1,
          ),
      );
      if (clear) return lane;
    }
  }
  throw new Error('На карте нет свободного прохода');
}

test('a Lighthouse player answers a reaction over an unsaved page and resumes writing', async ({
  browser,
}) => {
  test.setTimeout(160_000);
  const dm = await freshPage(browser, desktop);
  const asya = await freshPage(browser, phone);
  const table = await makeLighthouseTable(dm, SIGN_IN_CAMPAIGNS.lighthousePlayerReaction);
  await takeSeat(asya, table.link, /Ася/);
  await startSession(dm);
  await openSheet(dm, 'Схватка');
  await dm
    .locator('#sheet-encounter')
    .getByRole('button', { name: 'Начать: Смотрители причала' })
    .click();
  await expect(asya.getByRole('region', { name: 'Поле боя', exact: true })).toBeVisible();
  const path = '/api/campaigns/' + table.campaignId;
  const encounter = async () => {
    const { encounter: fight } = await read<EncounterResponse>(dm, path + '/encounter');
    if (!fight) throw new Error('Бой в гавани ещё не начался');
    return fight;
  };
  let fight = await encounter();
  const hero = fight.combatants.find((c) => c.entity.name?.includes('Ася'));
  const foe = fight.combatants.find((c) => hero && c.side !== hero.side);
  if (!hero || !foe) throw new Error('Не найдены участники боя');
  const [home, beside, away] = emptyLane(fight);
  await command(dm, path, {
    type: 'PlaceCombatant',
    combatantId: hero.entity.entityId,
    position: home,
  });
  await command(dm, path, {
    type: 'PlaceCombatant',
    combatantId: foe.entity.entityId,
    position: beside,
  });
  for (let i = 0; i < fight.order.length && fight.currentCombatantId !== foe.entity.entityId; i++) {
    await command(dm, path, { type: 'EndTurn', combatantId: fight.currentCombatantId });
    fight = await encounter();
  }
  await asya.locator('#dock-player-book').click();
  const notes = await notesOf(asya);
  await notes.getByRole('button', { name: 'Написать заметку' }).click();
  const draft = notes.getByLabel('Заметка', { exact: true });
  const words = 'Смотритель покинул пост у лестницы.';
  await draft.fill(words);
  await command(dm, path, {
    type: 'MoveCombatant',
    combatantId: foe.entity.entityId,
    path: [away],
  });
  const reaction = asya.getByRole('alertdialog');
  await expect(reaction).toBeVisible();
  await asya.keyboard.press('Escape');
  await expect(reaction).toBeVisible();
  await reaction.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await expect(reaction).toBeHidden();
  await expect(draft).toBeFocused();
  await expect(draft).toHaveValue(words);
  await notes.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect(notes.locator('.story-notes li')).toContainText(words);
  await notes.locator('.story-notes li [data-delete]').click();
  await expect(notes.getByText('Удалить эту заметку насовсем?')).toBeVisible();
  await notes.getByRole('button', { name: 'Да, удалить' }).click();
  await expect(notes.locator('.story-notes li')).toHaveCount(0);
});

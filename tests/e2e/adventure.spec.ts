import { expect, test, type Page } from '@playwright/test';

import { dockButton, openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  joinPath,
} from './support/sign-in.ts';

/**
 * The starter adventure in the browser (docs/adr/0058-campaign-content.md §5), on the
 * invitation-mode servers: a DM with a login leads a new campaign of The Bells of Hollowmere from
 * the hub, in English and in Russian. It opens at Ravenford's North Gate with its picture, its four
 * ready-made characters free to invite, its quests in the journal, its prepared encounters, and the
 * handouts and random tables it was written with in the DM's library.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const words = WORDS.en;
const LIVE = { timeout: 20_000 };
const hub = (page: Page) => page.getByRole('region', { name: 'Your campaigns', exact: true });

test('a DM leads a new campaign of The Bells of Hollowmere from the hub', async ({ browser }) => {
  test.setTimeout(150_000);
  const page = await (await browser.newContext()).newPage();
  await page.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.adventure)));
  const invited = accessState(page, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Ada');
  await invited.getByLabel('Login', { exact: true }).fill('ada-bells');
  await invited.getByLabel('Password', { exact: true }).fill('a bell under the water');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await expect(dockButton(page, words.players)).toBeVisible(LIVE);

  for (const [language, copy, quest, table] of [
    ['en', 'In English: The Bells of Hollowmere', 'The Widow’s Wagon', 'The Mill Road'],
    // The hub speaks the browser's language; the Russian copy then speaks Russian.
    ['ru', 'In Russian: The Bells of Hollowmere', 'Повозка вдовы', 'Мельничная дорога'],
  ] as const) {
    await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
    await hub(page).getByRole('button', { name: copy, exact: true }).click();
    const said = language === 'en' ? WORDS.en : WORDS.ru;
    await expect(dockButton(page, said.players)).toBeVisible(LIVE);
    // It opens at the North Gate, with the picture the adventure was made with.
    await expect(page.locator('.stage-backdrop .backdrop-art')).toBeVisible(LIVE);

    // The four ready-made characters wait for the DM's invitations.
    await openSheet(page, said.players);
    const character = page.locator('#sheet-players').getByLabel(said.character, { exact: true });
    for (const name of language === 'en'
      ? ['Bryn Ashdown', 'Hesk Coalbeard', 'Lyra Venn', 'Wren Underbough']
      : ['Брин Эшдаун', 'Хеск Коулберд', 'Лира Венн', 'Рен Андербоу'])
      await expect(character).toContainText(name, LIVE);
    await page.keyboard.press('Escape');

    // Its own quests, prepared encounters, kept handouts and random tables.
    await openSheet(page, language === 'en' ? 'Journal' : 'Журнал');
    await expect(page.locator('#sheet-journal')).toContainText(quest, LIVE);
    await page.keyboard.press('Escape');
    await openSheet(page, language === 'en' ? 'Encounter' : 'Схватка');
    await expect(page.locator('#sheet-encounter')).toContainText(
      language === 'en' ? 'Ambush at the Willow Ford' : 'Засада у Ивового брода',
      LIVE,
    );
    await page.keyboard.press('Escape');
    await openSheet(page, language === 'en' ? 'Party' : 'Отряд');
    await expect(page.locator('#sheet-party')).toContainText(
      language === 'en' ? 'A letter of hire' : 'Письмо о найме',
      LIVE,
    );
    await page.keyboard.press('Escape');
    await openSheet(page, language === 'en' ? 'Dice' : 'Кубики');
    await expect(page.locator('#sheet-dice')).toContainText(table, LIVE);
    await page.keyboard.press('Escape');
  }
});

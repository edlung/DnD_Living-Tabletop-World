import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { openSheet } from './support/shell.ts';
import { SIGN_IN_CAMPAIGNS, SIGN_IN_ORIGIN, WORDS, joinAsDm } from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * Theatre of the mind on the table's screen (docs/adr/0073-table-ideas.md §8, Stage 870), on the
 * invitation-mode servers, where the table's screen lives: the DM writes a few lines — or takes
 * none of the party's chapters, where there are none yet — and shows them with a place's picture;
 * the TV fills with the picture and the words. No trace or screenshot is kept: the pages show
 * links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 20_000 };
const SPACED_CODE = /^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/;
const LINES = 'The road bends north.\nThe lanterns of Ravenford fall behind you.';

test('the DM shows one picture and the words read aloud', async ({ browser }) => {
  test.setTimeout(180_000);
  const tv = await freshPage(browser, { viewport: { width: 1280, height: 720 } });
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(SPACED_CODE, LIVE);
  const dm = await freshPage(browser);
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.storyCast);
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(tv.locator('.display-cast')).toBeVisible(LIVE);

  const form = screen.getByRole('region', { name: 'What the screens show' });
  await form.getByRole('radio', { name: 'A picture with words to read aloud', exact: true }).check();
  // Words are needed; a picture is not.
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('Write the words first.');
  await form.getByLabel('The picture', { exact: true }).selectOption({ label: 'Market Square' });
  const words = form.getByLabel('The words to read aloud', { exact: true });
  await words.fill(LINES);
  await expect(form).toContainText(`${String(LINES.length)} of 600 characters.`);
  await expectAccessible(dm, 'the cast form with the story’s fields');
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(form).toContainText('Now: A picture with words to read aloud', LIVE);

  // The TV: the words, each line its own paragraph, over one picture that fills the screen.
  const story = tv.getByRole('region', { name: 'A story read aloud' });
  await expect(story.locator('p')).toHaveText(
    ['The road bends north.', 'The lanterns of Ravenford fall behind you.'],
    LIVE,
  );
  const art = story.locator('img.display-story-art');
  await expect(art).toBeVisible();
  const box = await art.boundingBox();
  expect(box?.width).toBe(1280);
  expect(box?.height).toBe(720);
  // Nothing runs off the screen.
  expect(
    await tv.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  await expectAccessible(tv, 'the story cast on the table’s screen');

  // Words alone: the game's own art stands behind them.
  await form.getByLabel('The picture', { exact: true }).selectOption({ index: 0 });
  await words.fill('Night falls.');
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(story.locator('p')).toHaveText(['Night falls.'], LIVE);
  await expect(story.locator('img.display-story-art')).toHaveAttribute('alt', '');
});

test('по-русски: картина со словами', async ({ browser }) => {
  test.setTimeout(120_000);
  const dm = await freshPage(browser);
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.storyCastRu, 0, WORDS.ru);
  await openSheet(dm, 'Экран стола');
  const form = dm.locator('#sheet-screen').getByRole('region', { name: 'Что показывают экраны' });
  await form
    .getByRole('radio', { name: 'Картину со словами для чтения вслух', exact: true })
    .check();
  await expect(form.getByLabel('Картина', { exact: true })).toBeVisible();
  await form.getByLabel('Слова, которые читают вслух', { exact: true }).fill('Наступает ночь.');
  await expect(form).toContainText('15 из 600 знаков. Их читают все за столом.');
  await expectAccessible(dm, 'форма показа с полями истории');
});

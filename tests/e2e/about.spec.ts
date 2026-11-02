import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { SIGN_IN_ORIGIN, WORDS, accessState } from './support/sign-in.ts';

/**
 * About the game (docs/adr/0051-srd-data.md §1): from the foot of the sign-in panel, the SRD
 * 5.2.1's attribution statement word for word with its links, in English beside Russian words;
 * Escape closes it and focus goes back to its button.
 */
test.use({ baseURL: SIGN_IN_ORIGIN });

const ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

test('the signed-out screen credits the SRD on its About page', async ({ page }) => {
  await page.goto('/');
  await expect(accessState(page, WORDS.en.none)).toBeVisible();
  const about = page.getByRole('button', { name: 'About this game', exact: true });
  await about.click();
  const dialog = page.getByRole('dialog', { name: 'About this game' });
  await expect(dialog.locator('blockquote')).toHaveText(ATTRIBUTION);
  await expect(dialog.getByRole('link', { name: 'https://www.dndbeyond.com/srd' })).toHaveAttribute(
    'href',
    'https://www.dndbeyond.com/srd',
  );
  await expect(
    dialog.getByRole('link', { name: 'https://creativecommons.org/licenses/by/4.0/legalcode' }),
  ).toHaveAttribute('target', '_blank');
  await expectAccessible(page, 'the About page');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(about).toBeFocused();
});

test('in Russian, the page speaks Russian and quotes the attribution as given', async ({
  browser,
}) => {
  const page = await (await browser.newContext({ locale: 'ru-RU' })).newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Об игре', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Об игре' });
  await expect(dialog.getByRole('heading', { name: 'Правила' })).toBeVisible();
  await expect(dialog.locator('blockquote')).toHaveText(ATTRIBUTION);
  await expect(dialog.locator('blockquote')).toHaveAttribute('lang', 'en');
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(dialog).toBeHidden();
});

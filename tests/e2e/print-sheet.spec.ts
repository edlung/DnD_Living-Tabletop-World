import { expect as baseExpect, test } from '@playwright/test';

import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter } from './support/shell.ts';

/**
 * A character's sheet on paper (docs/adr/0056-characters-from-the-srd.md §5): Elowen's player asks
 * to print her sheet from its Overview; the sheet is laid out for the printer — her numbers,
 * skills, spells, features and pack — and the screen's own chrome is not printed.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('a player prints her character’s sheet in plain ink', async ({ page }) => {
  test.setTimeout(90_000);
  // The browser's print dialog is the browser's: here it only says it was asked.
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset['printed'] = 'yes';
    };
  });
  await enterWorld(page, TOKENS.player, 'ui-items-play');
  const overview = await openCharacter(page, 'Overview');
  await overview.getByRole('button', { name: 'Print the sheet' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'yes');
  const sheet = page.locator('.print-sheet');
  await expect(sheet).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { level: 1 })).toHaveText('Elowen Starwhisper');
  await expect(sheet).toContainText('Ranger 7');
  await expect(sheet).toContainText('Spellcasting');
  await expect(sheet).toContainText('Ravenford brigandine');
  // Nothing of the screen is printed beside it.
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByRole('dialog')).toBeVisible();
});

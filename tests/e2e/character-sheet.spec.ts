import { expect, test } from '@playwright/test';

import { expectAccessible, WIDTHS } from './support/axe.ts';
import { enterWorld, expectPlayerBoundary, TOKENS } from './support/session.ts';
import { dockButton, openCharacter } from './support/shell.ts';

/**
 * The character dialog (Stage 500, work-orders/STAGE_500.md): the acting character's card and the
 * complete sheet with the rules' numbers from the server, in tabs. Reads only; the item journeys
 * (items.spec.ts) act in its Inventory tab.
 */
const CAMPAIGN = 'ui-items-play';

test('the dock opens the character: card, abilities, attacks, skills and spells', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.player, CAMPAIGN);
  const overview = await openCharacter(page, 'Overview');
  const dialog = page.getByRole('dialog', { name: 'Character: Elowen Starwhisper' });
  await expect(dialog.getByRole('heading', { name: 'Elowen Starwhisper' })).toBeVisible();
  await expect(dialog).toContainText('Level 15');
  await expect(dialog).toContainText('Ranger 7 (Hunter) · Wizard 8 (Evoker)');
  await expect(dialog).toContainText(/Armor class\s*17/i);
  // Every ability with its modifier, score and saving throw (Dexterity 18: +4, save +9).
  await expect(overview.getByText('Dexterity 18, modifier +4, saving throw +9')).toBeAttached();
  await expect(overview.locator('.ability-tile')).toHaveCount(6);
  await expect(overview).toContainText('Longbow');
  await expect(overview).toContainText('+11');
  await expect(overview).toContainText('1d8 + 4');

  const skills = await openCharacter(page, 'Skills');
  await expect(skills.locator('.skill-row')).toHaveCount(18);
  await expect(skills.locator('.skill-row.is-expertise')).toContainText(['Perception']);
  await expect(skills.locator('.skill-row').filter({ hasText: 'Perception' })).toContainText('+12');
  await expect(skills).toContainText('Passive Perception');

  const spells = await openCharacter(page, 'Spells');
  await expect(spells.locator('.spell-card')).toHaveCount(6);
  await expect(spells).toContainText('Save DC 16');
  await expect(spells.locator('.slot-row')).toHaveCount(6);
  await expectPlayerBoundary(page);

  // Escape closes it, and focus returns to the dock's button.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(dockButton(page, 'Character')).toBeFocused();
});

test('a Russian character reads only Russian', async ({ page }) => {
  await enterWorld(page, TOKENS.player, 'ui-items-ru');
  const panels = [];
  for (const tab of ['Обзор', 'Навыки', 'Заклинания']) {
    const panel = await openCharacter(page, tab, 'Персонаж');
    panels.push(await panel.innerText());
  }
  const card = await page.getByRole('dialog').locator('.hero-card').innerText();
  const english = [...panels, card]
    .flatMap((text) => text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? [])
    // Dice notation (1d8) is the one Latin the sheet shows.
    .filter((word) => !/^\d*d\d+$/.test(word));
  expect(english).toEqual([]);
});

for (const size of WIDTHS) {
  test(`the character dialog passes axe and keeps to the screen at ${size.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await enterWorld(page, TOKENS.player, CAMPAIGN);
    for (const tab of ['Overview', 'Skills', 'Spells']) {
      await openCharacter(page, tab);
      await expectAccessible(page, `${size.name} character ${tab}`);
      const wide = await page
        .getByRole('dialog')
        .evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth + 1);
      expect(wide, `${tab} scrolls sideways`).toBe(false);
    }
  });
}

import { expect, test } from '@playwright/test';

import { UI_RULES_CAMPAIGNS } from '../../apps/server/src/testing/ui-rules-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter, openSheet } from './support/shell.ts';

/**
 * The rules reference (docs/adr/0055-rules-reference-and-toolbox.md §2–3): a player finds a rule
 * by tag and by name and follows what it names; a condition on the character's card opens its
 * words in place and gives focus back on Escape; the DM reads the Gameplay Toolbox's traps, which
 * a player's sheet does not offer; a Russian table finds the same rules, their words still English.
 */
test('a player finds a rule, and a condition’s words open where it is shown', async ({ page }) => {
  await enterWorld(page, TOKENS.player, UI_RULES_CAMPAIGNS.en);
  await openSheet(page, 'Rules');
  const sheet = page.locator('#sheet-rules');
  // A player reads the glossary; the toolbox is the DM's.
  await expect(sheet.getByRole('tab')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Conditions', exact: true }).click();
  await expect(sheet.locator('.rules-list li')).toHaveCount(15);
  await sheet.getByRole('button', { name: 'All', exact: true }).click();
  await sheet.getByRole('searchbox', { name: 'Find a rule' }).fill('armor tra');
  await sheet.getByRole('button', { name: /^Armor Training/ }).click();
  const entry = sheet.locator('.rules-entry');
  await expect(entry.getByRole('heading', { name: 'Armor Training' })).toBeFocused();
  await expect(entry).toContainText('you have Disadvantage on any D20 Test');
  // What it names is one tap away.
  await entry
    .getByRole('navigation', { name: 'See also' })
    .getByRole('button', { name: 'Disadvantage' })
    .click();
  await expect(entry.getByRole('heading', { name: 'Disadvantage' })).toBeVisible();
  await expectAccessible(page, 'the rules sheet');
  await sheet.getByRole('button', { name: 'Close Rules' }).click();

  // Prone on Elowen's card: its words beside it, and back to it on Escape.
  await openCharacter(page, 'Overview');
  const term = page.getByRole('dialog').getByRole('button', { name: 'Prone', exact: true });
  await term.click();
  const popover = page.locator('.rule-popover:popover-open');
  await expect(popover.getByRole('heading', { name: 'Prone' })).toBeVisible();
  await expect(popover).toContainText('Restricted Movement.');
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(term).toBeFocused();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('the DM reads the Gameplay Toolbox: a trap, its trigger and its tiers', async ({ page }) => {
  await enterWorld(page, TOKENS.dm, UI_RULES_CAMPAIGNS.en);
  await openSheet(page, 'Rules');
  const sheet = page.locator('#sheet-rules');
  await sheet.getByRole('tab', { name: 'Toolbox' }).click();
  await sheet.getByRole('button', { name: 'Traps', exact: true }).click();
  const roof = sheet
    .locator('.rules-section')
    .filter({ has: page.getByRole('heading', { name: 'Collapsing Roof' }) });
  await expect(roof).toContainText('Deadly Trap (Levels 1–4)');
  await expect(roof).toContainText('Trigger: A creature crosses a trip wire');
  await expect(roof.getByRole('table')).toContainText('99 (18d10)');
  await expectAccessible(page, 'the toolbox');
});

test('a Russian table finds the same rules, their words in English for now', async ({ page }) => {
  await enterWorld(page, TOKENS.player, UI_RULES_CAMPAIGNS.ru);
  await openSheet(page, 'Правила');
  const sheet = page.locator('#sheet-rules');
  await sheet.getByRole('searchbox', { name: 'Найти правило' }).fill('Prone');
  await sheet.getByRole('button', { name: /^Prone/ }).click();
  await expect(sheet.getByRole('heading', { name: /^Prone/ })).toBeFocused();
  await expect(sheet.locator('.rules-entry .srd-blocks')).toHaveAttribute('lang', 'en');
});

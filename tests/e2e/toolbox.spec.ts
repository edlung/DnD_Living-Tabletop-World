import { expect, test, type Locator, type Page } from '@playwright/test';

import { UI_RULES_CAMPAIGNS } from '../../apps/server/src/testing/ui-rules-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The Gameplay Toolbox at the table (docs/adr/0055-rules-reference-and-toolbox.md §4): from the
 * Party sheet the DM springs a hidden pit on Elowen — a fall, so damage and Prone — puts her mind
 * under the Far Realm's stress, and gives her Cackle Fever and follows its course; the World Engine
 * rolls, and her card shows what it did.
 */
const ELOWEN = 'Elowen Starwhisper';
const card = (page: Page) =>
  page
    .locator('#sheet-party')
    .getByRole('listitem')
    .filter({ has: page.getByText(ELOWEN, { exact: true }) });
const hitPoints = async (on: Locator) =>
  Number(/(\d+)\//.exec(await on.locator('.party-hp').innerText())?.[1]);

test('the DM springs a trap and puts a mind under stress', async ({ page }) => {
  await enterWorld(page, TOKENS.dm, UI_RULES_CAMPAIGNS.toolbox);
  await openSheet(page, 'Party');
  const elowen = card(page);
  await expect(elowen).toContainText('No conditions');
  const before = await hitPoints(elowen);

  const trap = page.getByRole('form', { name: 'A trap' });
  await trap.getByLabel('Trap').selectOption({ label: 'Hidden pit' });
  await trap.getByLabel('For characters of').selectOption({ label: 'levels 5–10' });
  // It asks who it catches first.
  await trap.getByRole('button', { name: 'Spring the trap' }).click();
  await expect(trap.getByRole('alert')).toHaveText('Choose who it catches.');
  await trap.getByRole('checkbox', { name: ELOWEN }).check();
  await trap.getByRole('button', { name: 'Spring the trap' }).click();
  // A 30-foot fall: 3d6, and Prone.
  await expect(elowen.locator('.party-conditions')).toHaveText('Prone');
  const fallen = await hitPoints(elowen);
  expect(before - fallen).toBeGreaterThanOrEqual(3);
  expect(before - fallen).toBeLessThanOrEqual(18);

  const stress = page.getByRole('form', { name: 'Mental stress' });
  await stress.getByRole('button', { name: 'The Far Realm: Wisdom DC 20, 9d6' }).click();
  await expect(stress.getByLabel('DC')).toHaveValue('20');
  await stress.getByRole('checkbox', { name: ELOWEN }).check();
  await stress.getByRole('button', { name: 'Inflict mental stress' }).click();
  // The DM's history keeps it (and a command sent while one is in flight would be dropped: wait).
  await openSheet(page, 'History');
  const history = page.locator('#sheet-history');
  await expect(history).toContainText(`Hidden pit (levels 5–10) sprung on ${ELOWEN}`);
  await expect(history).toContainText(`Mental stress (DC 20, 9d6) on ${ELOWEN}`);
  await openSheet(page, 'Party');
  await expect.poll(() => hitPoints(elowen)).toBeLessThanOrEqual(fallen);
  // Cackle Fever: no save against a tainted potion; its course on her card.
  const contagion = page.getByRole('form', { name: 'A contagion' });
  await contagion.getByLabel('Contagion').selectOption({ label: 'Cackle Fever' });
  await contagion.getByLabel('Who').selectOption({ label: ELOWEN });
  await contagion.getByRole('button', { name: 'Infect' }).click();
  await expect(elowen).toContainText('Cackle Fever: not taken hold yet');
  await elowen.getByRole('button', { name: `It takes hold: ${ELOWEN}` }).click();
  await expect(elowen).toContainText('Cackle Fever: taken hold');
  await expect(elowen.locator('.party-conditions')).toContainText('Exhaustion 1');
  await expectAccessible(page, 'the Toolbox forms');
  await elowen.getByRole('button', { name: `End it: ${ELOWEN}` }).click();
  await expect(elowen).not.toContainText('Cackle Fever');
  await expect(elowen.locator('.party-conditions')).not.toContainText('Exhaustion');
  await openSheet(page, 'History');
  await expect(history).toContainText(`${ELOWEN}: given Cackle Fever`);
  await expect(history).toContainText(`${ELOWEN}: Cackle Fever ended`);
});

import { expect as baseExpect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { COMBAT_CAMPAIGNS, battlefield, enterCombat, square } from './support/combat.ts';
import { TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

/**
 * The DM's bestiary (docs/adr/0053-monsters-as-data.md §3): in a running fight the DM finds the
 * Wolf among the SRD's stat blocks and adds it on a free square; the board shows it.
 */
const expect = baseExpect.configure({ timeout: 15_000 });

test('the DM adds a wolf from the bestiary to the running fight', async ({ page }) => {
  await enterCombat(page, COMBAT_CAMPAIGNS.bestiary, TOKENS.dm);
  await openSheet(page, 'Encounter');
  const form = page.getByRole('form', { name: 'From the bestiary' });
  await form.getByLabel('Find by name or type', { exact: true }).fill('wolf');
  const creature = form.getByLabel('Creature', { exact: true });
  await expect(creature).toContainText('Wolf · CR 1/4');
  await creature.selectOption({ label: 'Wolf · CR 1/4' });
  await expect(form).toContainText('Medium Beast · AC 12 · 11 HP · 50 XP');
  // Its whole SRD text, read when the DM opens it.
  await form.getByText('Its stat block', { exact: true }).click();
  await expect(form).toContainText('HP 11 (2d8 + 2) · 40 ft.');
  await expect(form).toContainText('Pack Tactics. The wolf has Advantage on attack rolls');
  await expect(form).toContainText('Bite.');
  await form.getByLabel('Square across', { exact: true }).fill('0');
  await form.getByLabel('Square down', { exact: true }).fill('0');
  await expectAccessible(page, 'the bestiary form');
  await form.getByRole('button', { name: 'Add to the fight' }).click();
  await expect(form.getByRole('status')).toHaveText('Wolf joins the fight.');
  await expect(square(page, 0, 0)).toHaveAccessibleName(/Wolf/);
  await expect(battlefield(page)).toBeVisible();
  // Another on its square is refused, and nothing is added.
  await form.getByRole('button', { name: 'Add to the fight' }).click();
  await expect(form.getByRole('status')).toHaveText(
    'Someone already stands there. Choose another square.',
  );

  // The fight's difficulty counts the wolf's XP; the road's raiders name none.
  const difficulty = page.getByRole('note').filter({ hasText: 'Difficulty:' });
  await expect(difficulty).toContainText('Foes 50 XP');
  await expect(difficulty).toContainText('without XP in their stat block');

  // A legendary creature: its legendary attacks wait for another's turn.
  await form.getByLabel('Find by name or type', { exact: true }).fill('adult red');
  await form.getByLabel('Square across', { exact: true }).fill('12');
  await form.getByLabel('Square down', { exact: true }).fill('0');
  await form.getByRole('button', { name: 'Add to the fight' }).click();
  await expect(form.getByRole('status')).toHaveText('Adult Red Dragon joins the fight.');
  const legendary = page.getByRole('region', { name: 'Legendary actions' });
  await expect(legendary).toContainText('3 left this round');
  await expect(legendary.getByRole('button', { name: 'Rend (legendary)' })).toBeVisible();
});

import { expect as baseExpect, test, type Locator } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeCharacter, openCharacter, openSheet } from './support/shell.ts';

/**
 * Conditions in a fight (docs/adr/0045-conditions-and-actions.md): the DM puts one on a goblin from
 * the turn order — with its source and the turn that ends it — and one on whoever acts now, ended
 * by a save; the active combatant's card says how each ends. On Elowen, Poisoned and Exhaustion:
 * her player's sheet says what they do, and a check the DM asks says what Poisoned does to it.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.conditions;
const ELOWEN = 'Elowen Starwhisper';

async function condition(
  form: Locator,
  name: string,
  reason: string,
  more: (form: Locator) => Promise<void> = async () => {},
) {
  await form.getByLabel('Condition', { exact: true }).selectOption({ label: name });
  await more(form);
  await form.getByLabel('Why (kept in your history)', { exact: true }).fill(reason);
  await form.getByRole('button', { name: 'Apply the condition', exact: true }).click();
}

test('the DM sets conditions in a fight, and the player reads what they do', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const wide = { viewport: { width: 1440, height: 900 } };
  const dm = await (await browser.newContext(wide)).newPage();
  const player = await (await browser.newContext(wide)).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await openSheet(dm, 'Encounter');
  const sheet = dm.locator('#sheet-encounter');
  await sheet
    .getByRole('button', { name: 'Start: Ambush on the Old Trade Road', exact: true })
    .click();
  const rows = sheet.getByRole('region', { name: 'Turn order' }).locator('ol.turn-order > li');
  await expect(rows.first()).toBeVisible();
  const now = rows.filter({ hasText: 'Now' });
  const nowName = (await now.locator('.turn-order-name').innerText()).replace('Now', '').trim();

  // A goblin, Frightened of whoever acts now, until the end of that one's next turn.
  const goblin = rows.filter({ hasText: 'Goblin Raider' }).first();
  const goblinName = (await goblin.locator('.turn-order-name').innerText()).trim();
  await goblin.getByRole('button', { name: `Conditions of ${goblinName}`, exact: true }).click();
  const goblinForm = goblin.locator('form.hand-form');
  await goblinForm.getByLabel('Condition', { exact: true }).selectOption({ label: 'Frightened' });
  await expectAccessible(dm, 'the DM’s condition form in a fight');
  await condition(goblinForm, 'Frightened', 'A war cry', async (form) => {
    await form.getByLabel('It comes from (optional)', { exact: true }).selectOption({
      label: nowName,
    });
    await form.getByRole('radio', { name: 'At the end of a turn', exact: true }).check();
    await form.getByLabel('Whose turn', { exact: true }).selectOption({ label: nowName });
  });
  await expect(goblinForm).toHaveCount(0);
  await expect(dm.locator('.token-pip[title="Frightened"]')).toHaveCount(1);

  // Whoever acts now is Poisoned until a Constitution save of DC 12 at the end of a turn.
  await now.getByRole('button', { name: `Conditions of ${nowName}`, exact: true }).click();
  await condition(now.locator('form.hand-form'), 'Poisoned', 'A goblin’s dart', async (form) => {
    await form.getByLabel('A save ends it at the end of each of its turns').check();
    await form.getByLabel('Saving throw', { exact: true }).selectOption({ label: 'Constitution' });
    await form.getByLabel('Difficulty (DC)', { exact: true }).fill('12');
  });
  await dm.keyboard.press('Escape');
  const active = dm.getByRole('region', { name: 'Active combatant', exact: true });
  await expect(active.getByRole('list', { name: 'Conditions' })).toContainText('Poisoned');
  await expect(active.getByRole('list', { name: 'How they end' })).toContainText(
    'Poisoned: a Constitution save of DC 12 ends it',
  );

  // Elowen, Poisoned and twice exhausted, from her Party card.
  await openSheet(dm, 'Party');
  const card = dm
    .locator('#sheet-party')
    .getByRole('listitem')
    .filter({ has: dm.getByText(ELOWEN, { exact: true }) });
  await card.getByRole('button', { name: `Condition: ${ELOWEN}`, exact: true }).click();
  await condition(card.locator('form.hand-form'), 'Poisoned', 'Bad water');
  await card.getByRole('button', { name: `Condition: ${ELOWEN}`, exact: true }).click();
  const form = card.locator('form.hand-form');
  await form.getByLabel('Condition', { exact: true }).selectOption({ label: 'Exhaustion' });
  await form.getByLabel('Exhaustion level', { exact: true }).selectOption('2');
  await form.getByLabel('Why (kept in your history)', { exact: true }).fill('No sleep');
  await form.getByRole('button', { name: 'Set the level', exact: true }).click();
  await expect(card.locator('.party-conditions')).toHaveText('Poisoned · Exhaustion 2');

  // Her player's sheet says what they do.
  const overview = await openCharacter(player, 'Overview');
  const dialog = player.getByRole('dialog');
  await expect(overview).toBeVisible();
  const effects = dialog.getByRole('list', { name: 'What they do' });
  await expect(effects).toContainText('Poisoned: Disadvantage on its attacks and ability checks.');
  await expect(effects).toContainText('Exhaustion 2: −4 to every d20 roll, Speed 10 ft less.');
  // Exhaustion 2 takes 10 ft from her Speed: the sheet shows what she can move.
  await expect(dialog.getByText('20 ft', { exact: true })).toBeVisible();
  await closeCharacter(player);

  // A check the DM asks of her: her screen says what Poisoned does to it.
  const ask = dm.locator('#sheet-party').getByRole('region', { name: 'Ask for a check' });
  await ask.getByLabel('Character', { exact: true }).selectOption({ label: ELOWEN });
  await ask.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(player.locator('.asked-check')).toContainText(
    'Your conditions give Disadvantage. Exhaustion: −4 to the roll.',
  );
});

import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeSheet, openCharacter, openSheet } from './support/shell.ts';

/**
 * The DM's editors without AI (Stage 680a, docs/adr/0058-campaign-content.md §1): the DM makes a
 * mill in Ravenford, its miller, a goblin there, a sealed letter for Elowen, a clue and what the
 * party knows, all by hand; the history lists each; the goblin's Armor Class is set on its card and
 * that change undone; Elowen carries the letter.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.editors;

async function choose(make: Locator, what: string) {
  await make.getByLabel('What to make', { exact: true }).selectOption({ label: what });
}
async function resolved(page: Page) {
  await expect(
    page.getByRole('status').filter({ hasText: 'Action resolved' }).first(),
  ).toBeVisible();
}

test('the DM makes a mill, its miller, a goblin, a letter, a clue and lore by hand', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const dm = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await openSheet(dm, 'Add to the world');
  const make = dm.locator('.make-by-hand');
  await expectAccessible(dm, 'making by hand');

  // A place in Ravenford.
  await make.getByLabel('Name', { exact: true }).fill('The Old Mill');
  await make.getByLabel('Kind of place').selectOption({ label: 'A building' });
  await make.getByLabel('It lies in').selectOption({ label: 'Ravenford' });
  await make.getByRole('button', { name: 'Make the place' }).click();
  await resolved(dm);

  // Its miller.
  await choose(make, 'A person');
  await make.getByLabel('Name', { exact: true }).fill('Old Tomas');
  await make.getByLabel('Where it is').selectOption({ label: 'The Old Mill' });
  await make.getByRole('button', { name: 'Make the person' }).click();
  await resolved(dm);

  // A goblin from the bestiary, at the mill.
  await choose(make, 'A creature from the bestiary');
  await make.getByLabel('Find by name').fill('goblin warrior');
  await make.getByLabel('Its name (optional)').fill('Snitch');
  await make.getByLabel('Where it is').selectOption({ label: 'The Old Mill' });
  await make.getByRole('button', { name: 'Make the creature' }).click();
  await expect(make).toContainText('Snitch is in the world.');

  // A sealed letter for Elowen.
  await choose(make, 'A story object');
  await make.getByLabel('Name', { exact: true }).fill('A sealed letter');
  await make.getByLabel('Where it is').selectOption({ label: 'Elowen Starwhisper' });
  await make.getByRole('button', { name: 'Make the object' }).click();
  await expect(make).toContainText('A sealed letter is in the world.');

  // A clue at the mill, and what the party knows.
  await choose(make, 'A clue');
  await make.getByLabel('On what').selectOption({ label: 'The Old Mill' });
  await make.getByLabel('What it reveals').fill('Flour footprints lead down to the cellar.');
  await make.getByRole('button', { name: 'Leave the clue' }).click();
  await resolved(dm);
  await choose(make, 'What someone knows');
  await make.getByLabel('What they know').fill('The miller has not been seen for three nights.');
  await make.getByLabel('About (optional)').selectOption({ label: 'The Old Mill' });
  await make.getByRole('button', { name: 'Record it' }).click();
  await resolved(dm);

  // A quest by hand the party knows, its first step ticked.
  await choose(make, 'A quest');
  await make.getByLabel('Title', { exact: true }).fill("The miller's cellar");
  await make.getByLabel('Its steps, one a line').fill('Find the cellar door\nSee what lies below');
  await make.getByRole('button', { name: 'Write the quest' }).click();
  await resolved(dm);
  const kept = make.locator('.kept-quest').filter({ hasText: "The miller's cellar" });
  await kept.getByRole('checkbox', { name: 'Find the cellar door' }).check();
  await resolved(dm);

  // The history lists each.
  await openSheet(dm, 'History');
  const history = dm.locator('.dm-history');
  for (const line of [
    'Made the place The Old Mill',
    'Made Old Tomas',
    'Made the creature Snitch',
    'Gave A sealed letter to Elowen Starwhisper',
    'A clue on The Old Mill: “Flour footprints lead down to the cellar.”',
    'Known to the party: “The miller has not been seen for three nights.”',
    "Wrote the quest The miller's cellar",
    'Step 1 of a quest done',
  ])
    await expect(history).toContainText(line);

  // Snitch's Armor Class set on its card, then undone.
  await openSheet(dm, 'Places');
  await dm.getByLabel('Location', { exact: true }).selectOption({ label: 'The Old Mill' });
  await closeSheet(dm, 'Places');
  await dm.getByRole('button', { name: 'Snitch', exact: true }).first().click();
  const card = dm.locator('.change-by-hand');
  await card.getByText('Change by hand (DM)', { exact: true }).click();
  await card.getByLabel('Armor Class').fill('17');
  await card.getByRole('button', { name: 'Save the numbers' }).click();
  await resolved(dm);
  await openSheet(dm, 'History');
  // The newest first: the numbers set by hand, above the block the bestiary gave it.
  const numbers = history.locator('li').filter({ hasText: 'Set the numbers of Snitch' }).first();
  await numbers.getByRole('button', { name: 'Undo this change' }).click();
  await expect(numbers).toContainText('Undone');

  // Elowen carries the letter.
  const player = await (await browser.newContext()).newPage();
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  const pack = await openCharacter(player, 'Inventory');
  await expect(pack.getByRole('button', { name: /^A sealed letter/ })).toBeVisible();
  await player.keyboard.press('Escape');
  // The party's journal holds the quest, its first step done.
  await openSheet(player, 'Journal');
  const quest = player.locator('.quest-card').filter({ hasText: "The miller's cellar" });
  await expect(quest).toContainText('Done');
  await expect(quest).toContainText('See what lies below');
});

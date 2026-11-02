import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { closeSheet, dockButton, openSheet } from './support/shell.ts';

/**
 * The table's chat (docs/adr/0044-online-play.md §1, Stage 630): a player speaks to the table as
 * their character and whispers to the DM; the DM sees the new messages marked and answers that
 * player alone; the table's rolls show in the log.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const CAMPAIGN = UI_PARTY_CAMPAIGNS.chat;

const chat = (page: Page) => page.locator('#sheet-chat');
const logOf = (page: Page) => chat(page).getByRole('list', { name: 'The table’s talk and rolls' });

async function say(page: Page, text: string, to: string, as: string): Promise<void> {
  await chat(page).getByLabel('To', { exact: true }).selectOption({ label: to });
  await chat(page).getByLabel('As', { exact: true }).selectOption({ label: as });
  await chat(page).getByLabel('Message', { exact: true }).fill(text);
  await chat(page).getByLabel('Message', { exact: true }).press('Enter');
}

test('the table talks, whispers to the DM, and the DM answers one player', async ({ browser }) => {
  test.setTimeout(120_000);
  const dm = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await enterWorld(dm, TOKENS.dm, CAMPAIGN);
  await enterWorld(player, TOKENS.player, CAMPAIGN);

  await openSheet(player, 'Chat');
  await expect(chat(player)).toContainText('Nothing said yet.');
  await chat(player).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(chat(player).getByRole('alert')).toHaveText('Write something first.');
  await say(player, 'We should follow the ruts north.', 'The table', 'My character');
  // The next words, typed while the first are on their way, are kept and sent too.
  await chat(player).getByLabel('Message', { exact: true }).fill('Before the rain comes.');
  await chat(player).getByLabel('Message', { exact: true }).press('Enter');
  await expect(logOf(player)).toContainText('We should follow the ruts north.');
  await expect(logOf(player)).toContainText('Before the rain comes.');
  await expect(chat(player).getByLabel('Message', { exact: true })).toHaveValue('');
  await say(player, 'Can I check the cart for poison?', 'Only the DM', 'Out of character');
  await expect(logOf(player)).toContainText('to the DM');
  await expectAccessible(player, 'the chat');

  // The DM's Chat is marked until it is read.
  const marked = dockButton(dm, 'Chat');
  await expect(marked).toHaveClass(/has-waiting/);
  await openSheet(dm, 'Chat');
  await expect(logOf(dm)).toContainText('Elowen Starwhisper');
  await expect(logOf(dm)).toContainText('Can I check the cart for poison?');
  await expect(marked).not.toHaveClass(/has-waiting/);
  await say(
    dm,
    'You notice a faint smell of bitter almonds.',
    'Only Elowen Starwhisper',
    'Out of character',
  );
  await expect(logOf(player)).toContainText('You notice a faint smell of bitter almonds.');
  await expect(logOf(player)).toContainText('to Elowen Starwhisper');

  // A reload reads the table afresh: what was already said is not news.
  await closeSheet(player, 'Chat');
  await player.reload();
  await enterWorld(player, TOKENS.player, CAMPAIGN);
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();
  await expect(dockButton(player, 'Chat')).toBeVisible();
  await player.waitForTimeout(1500);
  await expect(dockButton(player, 'Chat')).not.toHaveClass(/has-waiting/);

  // A roll joins the log.
  await openSheet(player, 'Dice');
  const dice = player.locator('#sheet-dice');
  await dice.getByRole('button', { name: 'Add a d20', exact: true }).click();
  await dice.getByRole('button', { name: 'Roll', exact: true }).click();
  await openSheet(player, 'Chat');
  await expect(logOf(player).locator('.chat-line--roll')).toHaveCount(1);
});

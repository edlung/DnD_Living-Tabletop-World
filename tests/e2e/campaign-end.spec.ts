import { expect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openChronicle, openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * A campaign's end (docs/adr/0072-keepsakes.md §2, Stage 780): the DM closes the last evening and
 * finishes the campaign with last words; it has no next session and no next date; the player's
 * lobby says the adventure is finished and asks what their hero keeps — a thing carried, with a
 * line; the DM chooses a chapter for a player who said theirs aloud; the book ends with what the
 * heroes keep, the DM's words and "The end"; reopened, the campaign is played again. Chromium on
 * a laptop and WebKit on an iPad, each on a campaign of its own.
 */
const campaignOf = () =>
  test.info().project.name === 'ipad' ? UI_PARTY_CAMPAIGNS.endingIpad : UI_PARTY_CAMPAIGNS.ending;

const FIRST = 'Session 1: Arrival in Ravenford';
const LAST_WORDS = 'You brought the caravan home. Thank you for the road.';
const CLOAK = 'item:item-5a1c7e30';
const LINE = 'It still smells of the road.';
const ELOWEN = 'Elowen Starwhisper';
const BRANN = 'Brann Ironvale';
const WAIT = { timeout: 20_000 };

test('the DM finishes the campaign, the heroes keep something, the book says “The end”', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);

  // While the evening is open the end waits for it to close.
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  const end = sheet.getByRole('region', { name: 'The adventure’s end' });
  await expect(end).toContainText(
    'When the adventure is over, end the session first, then finish the campaign here.',
    WAIT,
  );
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await sheet
    .getByRole('group', { name: 'The evening’s moments' })
    .getByLabel('What mattered most tonight, in your own words (optional)', { exact: true })
    .fill('We came home with the caravan.');
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(sheet.locator('.session-ended')).toContainText(
    /Chapter written( as the plain record: [^.]+)?\./,
    WAIT,
  );

  // The DM finishes the campaign, with last words: no next session, no next date.
  await end.getByText('Finish the campaign', { exact: true }).click();
  await expect(end).toContainText('You can open it for play again at any time.');
  await end
    .getByLabel('A few closing words for the table (optional)', { exact: true })
    .fill(LAST_WORDS);
  await end.getByRole('button', { name: 'Yes, finish the campaign', exact: true }).click();
  const said = end.locator('.campaign-end-said');
  await expect(said).toHaveText(
    'The campaign is finished. Everyone may choose what their hero keeps.',
    WAIT,
  );
  // The button that was pressed is gone: the block's title holds focus.
  await expect(end.getByRole('heading', { name: 'The adventure’s end' })).toBeFocused();
  await expect(end).toContainText(/Finished on .*\d{4}\. Now it can only be read\./);
  await expect(end).toContainText(LAST_WORDS);
  await expect(end).toContainText(
    'Nobody has chosen a keepsake yet. Players choose on their own screens.',
  );
  await expect(sheet.getByRole('button', { name: 'Start the session', exact: true })).toHaveCount(
    0,
  );
  await expect(sheet.getByRole('region', { name: 'The next game' })).toHaveCount(0);
  await expectAccessible(dm, 'the Session sheet of a finished campaign');

  // The player's lobby: finished, the DM's words, and the question of a keepsake.
  const card = player.getByRole('region', { name: 'The adventure is finished' });
  await expect(card).toContainText('The game is over. The whole story is in the book.', WAIT);
  await expect(card.getByRole('figure', { name: 'The DM’s closing words' })).toContainText(
    LAST_WORDS,
  );
  await expect(card).toContainText(`What does ${ELOWEN} keep to remember it by?`);
  await expect(player.getByText('The session has not started yet.')).toHaveCount(0);
  await expectAccessible(player, 'a finished adventure in the lobby');
  await card.getByRole('button', { name: 'Choose a keepsake', exact: true }).click();
  const what = card.getByLabel(`What ${ELOWEN} keeps`, { exact: true });
  await expect(what).toBeFocused();
  await expect(card).toContainText('Everyone at the table reads it, and it goes into the book.');
  // Nothing chosen is said, not sent.
  await card.getByRole('button', { name: 'Keep this', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveText('Choose a thing or a chapter first.');
  await expect(what).toBeFocused();
  await expectAccessible(player, 'the keepsake being chosen');
  await what.selectOption(CLOAK);
  const cloak = (await what.locator('option:checked').innerText()).trim();
  await card.getByLabel('A few words about it (optional)', { exact: true }).fill(LINE);
  await card.getByRole('button', { name: 'Keep this', exact: true }).click();
  const kept = card.locator('.stars-kept');
  await expect(kept).toContainText(`${ELOWEN} keeps`, WAIT);
  await expect(kept).toContainText(cloak);
  await expect(kept).toContainText(LINE);
  await expect(
    card.getByRole('button', { name: 'Change the keepsake', exact: true }),
  ).toBeFocused();
  await expect(card.getByRole('status')).toHaveText('Kept.');

  // The DM reads it, and chooses a chapter for Brann, who said his aloud.
  await expect(end).toContainText(`${ELOWEN} keeps: ${cloak}`, WAIT);
  await end.getByText('Choose a keepsake for someone', { exact: true }).click();
  const who = end.getByLabel('Who is it for?', { exact: true });
  await who.selectOption({ label: BRANN });
  const forBrann = end.getByLabel(`What ${BRANN} keeps`, { exact: true });
  await forBrann.selectOption({ label: FIRST }, WAIT);
  await end.getByRole('button', { name: 'Keep this', exact: true }).click();
  await expect(end).toContainText(`${BRANN} keeps the chapter “${FIRST}”`, WAIT);
  await expect(said).toHaveText(`Kept for ${BRANN}.`);
  await expect(who).toBeFocused();
  await expect(card.getByText('What the heroes keep: 2', { exact: true })).toBeVisible(WAIT);

  // The book ends with what the heroes keep, the DM's words and "The end".
  await card.getByRole('button', { name: 'Open the book', exact: true }).click();
  const dialog = player.locator('dialog.chronicle-dialog');
  const book = dialog.getByRole('region', { name: 'The book of the campaign' });
  const keepsakes = book.getByRole('region', { name: 'What the heroes keep' });
  await expect(keepsakes).toContainText(`${ELOWEN} keeps: ${cloak}`, WAIT);
  await expect(keepsakes).toContainText(LINE);
  await expect(keepsakes).toContainText(`${BRANN} keeps the chapter “${FIRST}”`);
  await expect(book.getByRole('figure', { name: 'The DM’s closing words' })).toContainText(
    LAST_WORDS,
  );
  await expect(book.locator('.keepsake-ending')).toHaveText('The end');
  await expectAccessible(player, 'a finished adventure’s book');
  await dialog.getByRole('button', { name: 'Close the Chronicle', exact: true }).click();

  // Reopened, the campaign is played again: the lobby is the lobby, the book goes on.
  await end.getByRole('button', { name: 'Reopen the campaign', exact: true }).click();
  await expect(said).toHaveText('The campaign is open for play again.', WAIT);
  await expect(end.getByRole('heading', { name: 'The adventure’s end' })).toBeFocused();
  await expect(sheet.getByRole('button', { name: 'Start the session', exact: true })).toBeVisible(
    WAIT,
  );
  await expect(card).toHaveCount(0, WAIT);
  await expect(player.getByText('The session has not started yet.')).toBeVisible(WAIT);
  await openChronicle(player);
  await expect(book.locator('.keepsake-ending')).toHaveText('To be continued…', WAIT);
});

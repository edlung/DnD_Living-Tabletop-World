import { expect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { closePages, freshPage } from './support/pages.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The table's agreement and the DM's guide (docs/adr/0071-memory-and-ritual.md §4, Stage 740): the
 * DM writes the page from a family table's start; a player reads it in the lobby and says
 * "Understood"; the DM says it for a child who said it aloud; changed words ask again; the page
 * stays in "How to play", where a player asks for a pause in words only the DM reads; the guide
 * has the DM's pages for the DM alone. Chromium on a laptop and WebKit on an iPad, each on a
 * campaign of its own. The table's screen is in `agreement-screens.spec.ts`.
 */
const campaignOf = () =>
  test.info().project.name === 'ipad'
    ? UI_PARTY_CAMPAIGNS.agreementIpad
    : UI_PARTY_CAMPAIGNS.agreement;
const WAIT = { timeout: 15_000 };
const session = (page: Page) => page.locator('#sheet-session');

test('the DM writes the agreement; a player reads it, agrees, and asks for a pause', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  const received: string[] = [];
  player.on('response', (response) => {
    if (response.url().includes('/api/'))
      void response.text().then(
        (body) => received.push(body),
        () => undefined,
      );
  });

  // Nothing is asked of a player while no page is written.
  await expect(player.locator('.agreement-card')).toHaveCount(0);

  // The campaign begins with its first session open: the DM's sheet starts from a family table's
  // page, and one press keeps it.
  await openSheet(dm, 'Session');
  const tool = session(dm).getByRole('region', { name: 'The table’s agreement' });
  await expect(tool).toContainText('Not written yet.');
  await expect(tool.getByRole('radio', { name: /^Adventurous/ })).toBeChecked();
  await expect(tool.getByRole('checkbox', { name: 'Torture', exact: true })).toBeChecked();
  await expect(tool.getByRole('checkbox', { name: 'Romance', exact: true })).not.toBeChecked();
  await tool.getByRole('radio', { name: /^Cosy/ }).check();
  await tool.getByRole('checkbox', { name: 'Sudden frights', exact: true }).check();
  await tool.getByLabel('Anything else, one per line (optional)', { exact: true }).fill('Spiders');
  await tool.getByLabel('Our sign for a pause (optional)', { exact: true }).fill('Raise a hand');
  await tool.getByRole('button', { name: 'Save the agreement', exact: true }).click();
  await expect(tool.getByRole('heading', { name: /^Understood: 0 of \d+$/ })).toBeVisible(WAIT);
  await expect(tool.locator('.agreement-page')).toContainText('Cosy');
  await expectAccessible(dm, 'the agreement on the Session sheet');

  // The player is asked once, reads the page, and says "Understood".
  const card = player.locator('.agreement-card');
  await expect(card).toContainText('Before you play', WAIT);
  // "Later" puts it away for this visit; it is there again when the screen is opened anew.
  await card.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(card).toHaveCount(0);
  await enterWorld(player, TOKENS.player, campaign);
  await expect(card).toContainText('Before you play', WAIT);
  await expectAccessible(player, 'the lobby with the agreement card');
  await card.getByRole('button', { name: 'Read it', exact: true }).click();
  const page = player.getByRole('dialog', { name: 'The table’s agreement' });
  await expect(page).toContainText('Cosy: warm, funny, nobody is in real danger');
  await expect(page).toContainText('Spiders');
  await expect(page).toContainText('Raise a hand');
  await expectAccessible(player, 'the agreement’s dialog');
  await page.getByRole('button', { name: 'Understood', exact: true }).click();
  await expect(card).toHaveCount(0, WAIT);
  await expect(tool.getByRole('heading', { name: /^Understood: 1 of \d+$/ })).toBeVisible(WAIT);

  // A child said it aloud: the DM says it for them.
  await tool.getByRole('button', { name: 'Said it aloud: Brann Ironvale', exact: true }).click();
  await expect(tool.getByRole('heading', { name: /^Understood: 2 of \d+$/ })).toBeVisible(WAIT);

  // Changed words ask everyone again.
  // The form stays open where the DM left it; a change says beforehand that it asks again.
  await expect(tool).toContainText('A change asks everyone to read it again.');
  await tool.getByRole('radio', { name: /^Spooky/ }).check();
  await tool.getByRole('button', { name: 'Save the changes', exact: true }).click();
  await expect(tool.getByRole('heading', { name: /^Understood: 0 of \d+$/ })).toBeVisible(WAIT);
  await expect(card).toContainText('the DM has updated it', WAIT);
  await card.getByRole('button', { name: 'Read it', exact: true }).click();
  await page.getByRole('button', { name: 'Understood', exact: true }).click();
  await expect(card).toHaveCount(0, WAIT);

  // It stays in "How to play": the last page, with the quiet ways to the DM.
  await player.getByRole('button', { name: 'How to play' }).first().click();
  const guide = player.getByRole('dialog', { name: 'How to play' });
  await expect(guide.getByRole('button', { name: 'For the DM', exact: true })).toHaveCount(0);
  await guide.getByRole('button', { name: 'Our table', exact: true }).click();
  await expect(guide).toContainText('Spooky: shivers and mysteries, nothing cruel');
  await expect(guide).toContainText('Only the DM will see either of these.');
  await guide.getByRole('button', { name: 'Ask for a pause', exact: true }).click();
  await expect(guide.getByRole('status')).toHaveText(
    'Only the DM was told that you would like a pause.',
  );
  // A second press sends no second request.
  await guide.getByRole('button', { name: 'Pause asked', exact: true }).click({ force: true });
  // The DM reads it on a card of their own (ADR 0073 §2), and not in Chat: it is not table talk.
  const asked = dm.locator('.pause-card');
  await expect(asked).toHaveCount(1, WAIT);
  await expect(asked).toContainText('asks for a pause. Only you see this.');
  await openSheet(dm, 'Chat');
  await expect(dm.locator('#sheet-chat')).not.toContainText('pause');
  await asked.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(guide.getByRole('status')).toHaveText(
    'The DM has seen that you asked for a pause.',
    WAIT,
  );
  // "Tell the DM privately" opens the chat with the DM chosen.
  await guide.getByRole('button', { name: 'Tell the DM privately', exact: true }).click();
  await expect(guide).toBeHidden();
  await expect(player.locator('#sheet-chat').getByLabel('To', { exact: true })).toHaveValue('dm');

  // The guide's pages for the DM are the DM's alone.
  await dm.getByRole('button', { name: 'How to play' }).first().click();
  const dmGuide = dm.getByRole('dialog', { name: 'How to play' });
  await expect(dmGuide.getByRole('button', { name: 'For the DM', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dmGuide).toContainText('Before the evening');
  await expectAccessible(dm, 'the DM’s guide');
  await dmGuide.getByRole('button', { name: 'For players', exact: true }).click();
  await expect(dmGuide).toContainText('Your screens');

  // Who has said "Understood" never reached the player's browser.
  expect(received.some((body) => body.includes('"readers":['))).toBe(false);
});

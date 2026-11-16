import { expect, test } from '@playwright/test';

import { closePages, freshPage } from './support/pages.ts';
import { expectAccessible } from './support/axe.ts';
import { openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  joinPath,
} from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The table's agreement on the table's screen (docs/adr/0071-memory-and-ritual.md §4, Stage 740),
 * on the invitation-mode servers: the DM writes the page and shows it for the first meeting; the
 * TV reads the same page, follows a change of its words, and receives nothing of who has said
 * "Understood".
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const WAIT = { timeout: 15_000 };

test('the DM shows the agreement on the table’s screen for the first meeting', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = SIGN_IN_CAMPAIGNS.agreement;
  const words = WORDS.en;

  const tv = await freshPage(browser);
  const received: string[] = [];
  tv.on('response', (response) => {
    if (response.url().includes('/agreement')) {
      void response.text().then(
        (body) => received.push(body),
        () => undefined,
      );
    }
  });
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^\S{4} \S{4}$/, WAIT);
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(campaign)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Ada');
  await invited.getByLabel('Login', { exact: true }).fill('ada-agreement');
  await invited.getByLabel('Password', { exact: true }).fill('a lantern in the rain');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(screen.getByRole('status')).toHaveText(
    'The screen is paired: it shows what you choose below.',
  );

  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');

  // The page is written and shown; the TV reads it.
  const tool = sheet.getByRole('region', { name: 'The table’s agreement' });
  await tool.getByLabel('Anything else, one per line (optional)', { exact: true }).fill('Spiders');
  await tool.getByLabel('Our sign for a pause (optional)', { exact: true }).fill('Raise a hand');
  await tool.getByRole('button', { name: 'Save the agreement', exact: true }).click();
  await tool
    .getByRole('button', { name: 'Show the agreement on the table’s screens', exact: true })
    .click();
  await expect(tool.getByRole('status').filter({ hasText: 'Read it aloud' })).toBeVisible(WAIT);
  const shown = tv.locator('.display-agreement');
  await expect(shown).toContainText('Adventurous: danger and daring, and it ends well', WAIT);
  await expect(shown).toContainText('Spiders');
  await expect(shown).toContainText('Raise a hand');
  await expect(shown).toContainText('Then everyone presses “Understood” on their own screen.');
  await expectAccessible(tv, 'the agreement on the table’s screen');
  // Changed words reach the screen as it stands.
  await tool.getByRole('radio', { name: /^Cosy/ }).check();
  await tool.getByRole('button', { name: 'Save the changes', exact: true }).click();
  await expect(shown).toContainText('Cosy: warm, funny, nobody is in real danger', WAIT);

  // Who has said "Understood" is the DM's alone: the screen was sent no list.
  expect(received.length).toBeGreaterThan(0);
  expect(received.some((body) => body.includes('"readers":['))).toBe(false);

  // A campaign the same DM starts anew: nothing has been played, and the Session sheet says what
  // to do before the first evening — ticked as it is done, with the way to the DM's guide.
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await dm.getByRole('button', { name: 'In English: The Missing Caravan', exact: true }).click();
  await openSheet(dm, 'Session');
  const first = sheet.getByRole('region', { name: 'Before the first evening' });
  const step = first.getByRole('listitem').filter({ hasText: 'Write the table’s agreement' });
  await expect(step).toBeVisible(WAIT);
  await expect(step).not.toContainText('(done)');
  await sheet
    .getByRole('region', { name: 'The table’s agreement' })
    .getByRole('button', { name: 'Save the agreement', exact: true })
    .click();
  await expect(step).toContainText('(done)', WAIT);
  await expectAccessible(dm, 'the Session sheet before the first evening');
  await first.getByRole('button', { name: 'How to run the game', exact: true }).click();
  const guide = dm.getByRole('dialog', { name: 'How to play' });
  await expect(guide).toContainText('Before the evening');
});

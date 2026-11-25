import { expect, test } from '@playwright/test';

import { closePages, freshPage } from './support/pages.ts';
import { openSheet, openTopMenu } from './support/shell.ts';
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
 * Finished adventures in the account's list (docs/adr/0072-keepsakes.md §2, Stage 780), on the
 * invitation-mode servers where accounts live: once its DM has finished it, a campaign leaves the
 * list of those being played for "Adventures we finished" — the days it was played, its heroes,
 * the book first — and its book ends with "The end". No trace or screenshot is kept: the pages
 * show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 20_000 };

test('a finished campaign stands among the adventures we finished', async ({ browser }) => {
  test.setTimeout(180_000);
  const words = WORDS.en;
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(SIGN_IN_CAMPAIGNS.ending)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Ada');
  await invited.getByLabel('Login', { exact: true }).fill('ada-ending');
  await invited.getByLabel('Password', { exact: true }).fill('a lantern in the rain');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();

  // The last evening closes with its chapter; the DM finishes the campaign.
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await sheet
    .getByRole('group', { name: 'The evening’s moments' })
    .getByLabel('What mattered most tonight, in your own words (optional)', { exact: true })
    .fill('We came home with the caravan.');
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(sheet.locator('.session-ended')).toContainText(
    /Chapter written( as the plain record: [^.]+)?\./,
    LIVE,
  );
  const end = sheet.getByRole('region', { name: 'The adventure’s end' });
  await end.getByText('Finish the campaign', { exact: true }).click();
  await end.getByRole('button', { name: 'Yes, finish the campaign', exact: true }).click();
  await expect(end).toContainText(/Finished on .*\. Now it can only be read\./, LIVE);
  // The DM, too, reads on the stage that the adventure is finished.
  await expect(dm.getByRole('region', { name: 'The adventure is finished' })).toBeVisible(LIVE);

  await openTopMenu(dm);
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const finished = dm.getByRole('region', { name: 'Adventures we finished', exact: true });
  await expect(finished.getByRole('listitem')).toHaveCount(1, LIVE);
  await expect(finished).toContainText(/Played on .*\d{4}/);
  await expect(finished).toContainText(/Heroes: .*Brann Ironvale/);
  // It is no longer among the campaigns being played.
  await expect(
    dm.getByRole('list', { name: 'Your campaigns', exact: true }).getByRole('listitem'),
  ).toHaveCount(0);

  // Its first door is the book, which says "The end".
  await finished.getByRole('button', { name: /^The book of / }).click();
  const dialog = dm.locator('dialog.chronicle-dialog');
  const book = dialog.getByRole('region', { name: 'The book of the campaign' });
  await expect(book).toContainText('We came home with the caravan.', LIVE);
  await expect(book.locator('.keepsake-ending')).toHaveText('The end');
});

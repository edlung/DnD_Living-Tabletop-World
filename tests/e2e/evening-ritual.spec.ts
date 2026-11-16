import { expect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import boundary from '../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import { closePages, freshPage } from './support/pages.ts';
import { dmRequest } from './support/authoring.ts';
import { expectAccessible } from './support/axe.ts';
import { collectApiBodies, enterWorld, expectPlayerBoundary, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * An evening closed and the next one opened (docs/adr/0071-memory-and-ritual.md §1, Stage 710):
 * the DM keeps the evening's moments and a line of their own, ends the session and has the
 * party's chapter of that session written; the player — also one who missed the evening — reads
 * "Previously…" while the table waits and finds the party's chapter in their own book; the DM's
 * start form offers the recap. Then an evening of which nothing is kept: no chapter, said plainly,
 * and the recap stays the last chapter there is. Chromium on a laptop and WebKit on an iPad, each
 * on a campaign of its own; the table's screen and an online player's are in
 * `evening-ritual-screens.spec.ts`.
 */
test.describe.configure({ mode: 'serial' });
const campaignOf = () =>
  test.info().project.name === 'ipad' ? UI_PARTY_CAMPAIGNS.ritualIpad : UI_PARTY_CAMPAIGNS.ritual;

const FIRST = 'Session 1: Arrival in Ravenford';
const LINE = 'We swore to find the missing caravan.';
const WAIT = { timeout: 15_000 };
const UNNAMED_PLACE = '"location-f3b82c8b"';
const session = (page: Page) => page.locator('#sheet-session');
const book = (page: Page) => page.getByRole('dialog', { name: 'Chronicle' });

test('the DM closes an evening; its chapter and “Previously…” reach the player', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  const received = collectApiBodies(player);
  // What the player's browser reads of the Chronicle, its own view and the party's.
  const chronicles: Promise<string>[] = [];
  player.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('/chronicle')) {
      chronicles.push(response.text().catch(() => ''));
    }
  });
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);

  // Something for the game to have noted: a day passes during the session.
  const day = await dmRequest(dm, campaign, 'post', 'commands', {
    commandId: `${campaign}.next-day`,
    command: { type: 'AdvanceWorldTime', by: 86_400 },
  });
  expect(day.body).toMatchObject({ status: 'accepted' });

  // Closing the evening: the moments to keep, a line of the DM's own, the chapter.
  await openSheet(dm, 'Session');
  const sheet = session(dm);
  await expect(sheet).toContainText(FIRST);
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  const moments = sheet.getByRole('group', { name: 'The evening’s moments' });
  await expect(moments.getByRole('listitem').filter({ hasText: 'Day 2 dawned.' })).toBeVisible(
    WAIT,
  );
  for (const box of await moments.getByRole('checkbox').all()) await expect(box).toBeChecked();
  await moments
    .getByLabel('What mattered most tonight, in your own words (optional)', { exact: true })
    .fill(LINE);
  await expect(
    sheet.getByRole('checkbox', { name: 'Write a chapter about this session', exact: true }),
  ).toBeChecked();
  await expectAccessible(dm, 'closing the evening');
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();

  const closed = sheet.locator('.session-ended');
  await expect(closed).toContainText('The session is over.', WAIT);
  // The button that closed the evening went with the session: the summary has the focus.
  await expect(closed.getByText('The session is over.', { exact: true })).toBeFocused();
  await expect(closed).toContainText(/Moments kept: [2-9]\./);
  await expect(closed).toContainText(
    'Chapter written as the plain record: the narrator was unavailable.',
  );
  await expect(sheet.getByRole('alert')).toHaveCount(0);
  await expectAccessible(dm, 'the evening closed');

  // The chapter is this session's, told from the party, and opens from the sheet.
  await closed.getByRole('button', { name: 'Open the chapter', exact: true }).click();
  const told = book(dm).getByRole('article', { name: FIRST });
  await expect(told).toBeVisible(WAIT);
  await expect(told).toContainText(LINE);
  await expect(told).toContainText('told from the party');
  await dm.keyboard.press('Escape');

  // The player who waits (or missed the evening) reads "Previously…" and says ready.
  await expect(player.getByText('The session has not started yet.')).toBeVisible(WAIT);
  const brief = player.getByRole('region', { name: 'Previously…' });
  await expect(brief).toContainText(FIRST, WAIT);
  await expectAccessible(player, 'the lobby with the recap in brief');
  await brief.getByRole('button', { name: 'Read the recap', exact: true }).click();
  const recap = player.getByRole('article', { name: FIRST });
  await expect(recap).toContainText('Previously…');
  await expect(recap.locator('.previously-passage').first()).toBeVisible();
  await expect(recap.locator('.previously-passage')).not.toHaveCount(0);
  // The DM's own line is the evening's most salient moment: the recap tells it.
  await expect(recap).toContainText(LINE);
  await expectAccessible(player, 'the lobby with the whole recap');
  // Folded back, it is still there, and focus is where it was opened from.
  await recap.getByRole('button', { name: 'Close the recap', exact: true }).click();
  await expect(brief.getByRole('button', { name: 'Read the recap', exact: true })).toBeFocused();
  await brief.getByRole('button', { name: 'Read the recap', exact: true }).click();
  await expect(recap.getByRole('heading', { name: FIRST })).toBeFocused();

  // The party's chapter is in the player's own book, read in the party's view.
  await recap.getByRole('button', { name: 'Open in the Chronicle', exact: true }).click();
  const page = book(player).getByRole('article', { name: FIRST });
  await expect(page).toBeVisible(WAIT);
  await expect(page).toContainText(LINE);
  await expect(page).toContainText('told from the party');
  await expectAccessible(player, 'the party’s chapter in the player’s book');
  await player.keyboard.press('Escape');
  await player.getByRole('button', { name: 'I am ready', exact: true }).click();

  // The next session: the start form offers "Previously…" with the words to read; this DM starts
  // without it (the screens' side is `evening-ritual-screens.spec.ts`).
  // Opening the chapter put the sheet away; the DM comes back to it for the next evening.
  await openSheet(dm, 'Session');
  await expect(sheet.getByLabel('Title', { exact: true })).toHaveValue('Session 2');
  const opening = sheet.getByRole('checkbox', {
    name: 'Open with “Previously…” on the table’s screen',
    exact: true,
  });
  await expect(opening).toBeChecked();
  // The recap in brief: its title and where the evening left off — the DM's own line.
  const preview = sheet.locator('.previously-brief--form');
  await expect(preview).toContainText(FIRST);
  await expect(preview).toContainText(LINE);
  await expectAccessible(dm, 'the start form with the recap');
  await opening.uncheck();
  await expect(preview).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Start the session', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Pause the game', exact: true })).toBeVisible(
    WAIT,
  );
  await expect(sheet.getByRole('alert')).toHaveCount(0);
  await expect(player.getByRole('region', { name: 'Previously…' })).toHaveCount(0, WAIT);

  // The Chronicle the player read holds the party's chapter and nothing the party may not know.
  const read = (await Promise.all(chronicles)).join('\n');
  expect(read).toContain(LINE);
  for (const marker of [...boundary.forbiddenMarkers.PARTY, UNNAMED_PLACE]) {
    expect(read, `the player’s Chronicle holds ${marker}`).not.toContain(marker);
  }
  // Everything else the browser received and shows keeps the player's boundary; the unnamed place
  // down the road is what Elowen perceives where she stands (ADR 0012), as in other journeys.
  await received.assertPlayerBoundary([], [UNNAMED_PLACE]);
  await expectPlayerBoundary(player);
});

test('an evening of which nothing is kept has no chapter, and says so', async ({ browser }) => {
  test.setTimeout(120_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await openSheet(dm, 'Session');
  const sheet = session(dm);
  await expect(sheet).toContainText('Session 2');
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  const moments = sheet.getByRole('group', { name: 'The evening’s moments' });
  // The first evening's day is not offered again: the clock stood still since.
  await expect(moments).toContainText(
    'Nothing new to keep: the party already remembers what the game noted tonight.',
    WAIT,
  );
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  const closed = sheet.locator('.session-ended');
  await expect(closed).toContainText(
    'No chapter this time: the party kept no memories of this session. Next time, tick a moment or add a line of your own before you end.',
    WAIT,
  );
  // Nothing to open and nothing to write: the sheet offers neither.
  await expect(closed.getByRole('button')).toHaveCount(0);
  // "Previously…" stays the last chapter there is.
  await expect(player.getByRole('region', { name: 'Previously…' })).toContainText(FIRST, WAIT);
});

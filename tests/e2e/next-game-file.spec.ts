import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { closePages, freshPage } from './support/pages.ts';
import { expectAccessible } from './support/axe.ts';
import { openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  invite,
  joinPath,
  openInvitation,
} from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The next game where it leaves the campaign's own screens (docs/adr/0071-memory-and-ritual.md §3,
 * Stage 730), on the invitation-mode servers: a player saves the date as a calendar file — the
 * campaign's name, the instant, the DM's line, nothing of the world; the TV's join screen and the
 * hub's card say when the table meets again. No trace or screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const WAIT = { timeout: 15_000 };
const session = (page: Page) => page.locator('#sheet-session');

/** A day `days` ahead at 18:00, as a date field holds it and as a calendar file writes it. */
function evening(days: number) {
  const at = new Date();
  at.setDate(at.getDate() + days);
  at.setHours(18, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    field: `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T18:00`,
    stamp: at
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z'),
  };
}

/** The DM ends the session without a chapter: the players' lobby is what this journey reads. */
async function endSession(sheet: ReturnType<typeof session>) {
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await sheet
    .getByRole('checkbox', { name: 'Write a chapter about this session', exact: true })
    .uncheck();
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Start the session', exact: true })).toBeVisible(
    WAIT,
  );
}

test('a player saves the calendar file; the hub’s card and the TV say when', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = SIGN_IN_CAMPAIGNS.nextGame;
  const words = WORDS.en;

  // A TV waits with its code; the DM joins with a login (the hub needs one) and pairs it.
  const tv = await freshPage(browser);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^\S{4} \S{4}$/, WAIT);
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(campaign)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Ada');
  await invited.getByLabel('Login', { exact: true }).fill('ada-next-game');
  await invited.getByLabel('Password', { exact: true }).fill('a lantern in the rain');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(screen.getByRole('status')).toHaveText(
    'The screen is paired: it shows what you choose below.',
  );
  const link = await invite(dm, 'Elowen Starwhisper');
  const player = await freshPage(browser, { acceptDownloads: true });
  await openInvitation(player, link);
  await expect(player.locator('nav.book-parts')).toBeVisible(WAIT);

  // The evening ends; the DM sets the next game.
  await openSheet(dm, 'Session');
  const sheet = session(dm);
  await endSession(sheet);
  const tool = sheet.getByRole('region', { name: 'The next game' });
  const six = evening(6);
  await tool.getByLabel('Day and time', { exact: true }).fill(six.field);
  await tool
    .getByLabel('A note for everyone (optional)', { exact: true })
    .fill('Bring dice; snacks');
  await tool.getByRole('button', { name: 'Set the date', exact: true }).click();

  // The DM's own sheet offers the file too.
  await expect(tool.getByRole('link', { name: 'Add to calendar', exact: true })).toBeVisible(WAIT);

  // The player saves it as a calendar file: the campaign's name, the instant, the DM's line.
  const line = player.locator('.next-game--lobby');
  await expect(line).toContainText(/in 6 days\s+Bring dice; snacks/, WAIT);
  const saving = player.waitForEvent('download');
  await line.getByRole('link', { name: 'Add to calendar', exact: true }).click();
  const saved = await saving;
  expect(saved.suggestedFilename()).toBe(`next-game-${campaign}.ics`);
  const file = await readFile(await saved.path(), 'utf8');
  expect(file).toContain(`DTSTART:${six.stamp}`);
  expect(file).toContain('SUMMARY:The Missing Caravan');
  expect(file).toContain('DESCRIPTION:Bring dice\\; snacks');
  expect(file).toContain('TRIGGER:-P1D');
  expect(file).not.toMatch(/Elowen|Market Square/);

  // The TV's join screen says when the table meets again.
  await openSheet(dm, 'Table screen');
  const form = screen.getByRole('region', { name: 'What the screens show' });
  await form
    .getByRole('radio', { name: 'The QR code to join, with “last time”', exact: true })
    .check();
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  await expect(tv.locator('.display-join .next-game')).toContainText(
    /Next game: .*(18:00|6:00\sPM) — in 6 days\s+Bring dice; snacks/,
    WAIT,
  );
  await expectAccessible(tv, 'the join screen with the next game');

  // The hub's card says it too, before the campaign is opened.
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const hub = dm.getByRole('region', { name: 'Your campaigns', exact: true });
  await expect(hub.locator('.next-game--hub')).toContainText(
    /Next game: .*(18:00|6:00\sPM) — in 6 days\s+Bring dice; snacks/,
    WAIT,
  );
  await expectAccessible(dm, 'the hub with the next game');
  // …and gives the file by the account alone, whichever campaign was opened last.
  const fromHub = dm.waitForEvent('download');
  await hub.getByRole('link', { name: 'Add to calendar', exact: true }).click();
  const hubFile = await readFile(await (await fromHub).path(), 'utf8');
  expect(hubFile).toContain(`DTSTART:${six.stamp}`);
  expect(hubFile).toContain('SUMMARY:The Missing Caravan');
});

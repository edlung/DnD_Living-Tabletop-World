import { expect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { closePages, freshPage } from './support/pages.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The next game (docs/adr/0071-memory-and-ritual.md §3, Stage 730): the DM sets when the table
 * meets again; a waiting player reads it in their own time zone; the DM changes it and takes it
 * away; the game that was dated clears its date as it starts. Chromium on a laptop and WebKit on
 * an iPad, each on a campaign of its own. The calendar file, the hub's card and the TV's join
 * screen are in `next-game-file.spec.ts`, on the invitation-mode servers.
 */
const campaignOf = () =>
  test.info().project.name === 'ipad'
    ? UI_PARTY_CAMPAIGNS.nextGameIpad
    : UI_PARTY_CAMPAIGNS.nextGame;
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

/** An hour from now, as a date field holds it: the game about to begin. */
function soon() {
  const at = new Date(Date.now() + 3_600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
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

test('the DM sets the next game; a waiting player reads it; the game that begins clears it', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await openSheet(dm, 'Session');
  const sheet = session(dm);
  await endSession(sheet);

  // No date yet; a form without a day says so and sets nothing.
  const tool = sheet.getByRole('region', { name: 'The next game' });
  await expect(tool).toContainText(
    'No date yet. Set one, and everyone sees it in the campaign and in their campaign list.',
  );
  await tool.getByRole('button', { name: 'Set the date', exact: true }).click();
  await expect(tool.getByRole('alert')).toHaveText('Choose the day and the time first.');
  await expect(player.locator('.next-game--lobby')).toHaveCount(0);

  // Six days ahead at six in the evening, at Grandma's.
  await tool.getByLabel('Day and time', { exact: true }).fill(evening(6).field);
  await tool.getByLabel('A note for everyone (optional)', { exact: true }).fill('At Grandma’s');
  await tool.getByRole('button', { name: 'Set the date', exact: true }).click();
  // Under its heading the sheet says the date alone; the form says it was set and keeps the focus.
  await expect(tool).toContainText(/(18:00|6:00\sPM) — in 6 days\s+At Grandma’s/, WAIT);
  await expect(tool.getByRole('status')).toHaveText(
    'The date is set. Everyone at the table sees it.',
  );
  // (Safari gives a pressed button no focus to keep; a keyboard's focus stays either way.)
  if (test.info().project.name !== 'ipad') {
    await expect(tool.getByRole('button', { name: 'Change the date', exact: true })).toBeFocused();
  }
  await expectAccessible(dm, 'the next game on the Session sheet');
  const line = player.locator('.next-game--lobby');
  await expect(line).toContainText(
    /Next game: .*(18:00|6:00\sPM) — in 6 days\s+At Grandma’s/,
    WAIT,
  );
  // This server signs in by a typed token: a link could not carry it, so no file is offered.
  await expect(line.getByRole('link')).toHaveCount(0);
  await expect(tool.getByRole('link')).toHaveCount(0);
  await expectAccessible(player, 'the lobby with the next game');

  // Changed to tomorrow, then taken away: the fields stay, so a slip is one press to undo.
  await tool.getByLabel('Day and time', { exact: true }).fill(evening(1).field);
  await tool.getByRole('button', { name: 'Change the date', exact: true }).click();
  await expect(line).toContainText(/(18:00|6:00\sPM) — tomorrow/, WAIT);
  await tool.getByRole('button', { name: 'Remove the date', exact: true }).click();
  await expect(player.locator('.next-game--lobby')).toHaveCount(0, WAIT);
  await expect(tool.getByRole('status')).toHaveText(
    'The date is removed. Set it again if that was a slip.',
  );
  await expect(tool.getByLabel('Day and time', { exact: true })).toHaveValue(evening(1).field);
  await expect(tool.getByLabel('A note for everyone (optional)', { exact: true })).toHaveValue(
    'At Grandma’s',
  );
  await tool.getByRole('button', { name: 'Set the date', exact: true }).click();
  await expect(line).toContainText(/(18:00|6:00\sPM) — tomorrow\s+At Grandma’s/, WAIT);

  // An evening already over is not a next game: said at the field, nothing sent.
  await tool.getByLabel('Day and time', { exact: true }).fill(evening(-2).field);
  await tool.getByRole('button', { name: 'Change the date', exact: true }).click();
  await expect(tool.getByRole('alert')).toHaveText(
    'That time has already passed. Choose a later one.',
  );
  await expect(tool.getByLabel('Day and time', { exact: true })).toBeFocused();
  await expect(line).toContainText('tomorrow');

  // A date for this very evening is cleared by the session it was set for.
  await tool.getByLabel('Day and time', { exact: true }).fill(soon());
  await tool.getByRole('button', { name: 'Change the date', exact: true }).click();
  await expect(line).toContainText(/today|tomorrow/, WAIT);
  await expect(tool.getByRole('status')).toHaveText(
    'The date is set. Everyone at the table sees it.',
  );
  await sheet.getByRole('button', { name: 'Start the session', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Pause the game', exact: true })).toBeVisible(
    WAIT,
  );
  await expect(tool).toContainText('No date yet.', WAIT);
});

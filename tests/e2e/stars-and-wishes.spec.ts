import { expect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { closePages, freshPage } from './support/pages.ts';
import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * Stars and wishes at an evening's end (docs/adr/0071-memory-and-ritual.md §2, Stage 720): the
 * DM ends the session; the player's lobby asks for a star and a wish and keeps them; the DM reads
 * the star and — alone — the wish, and writes for a player who said theirs aloud; the player reads
 * that star and never that wish; the next session's start puts the card away. Chromium on a
 * laptop and WebKit on an iPad, each on a campaign of its own; the table's screen is in
 * `evening-ritual-screens.spec.ts`.
 */
const campaignOf = () =>
  test.info().project.name === 'ipad' ? UI_PARTY_CAMPAIGNS.starsIpad : UI_PARTY_CAMPAIGNS.stars;

const FIRST = 'Session 1: Arrival in Ravenford';
const STAR = 'The chase over the roofs!';
const WISH = 'I wish the fights were shorter.';
const BRANN_STAR = 'Brann held the bridge alone.';
const BRANN_WISH = 'More riddles, please.';
const SAID_ALOUD = 'The chase over the roofs, and the leap!';
const ELOWEN = 'Elowen Starwhisper';
const WAIT = { timeout: 15_000 };
const session = (page: Page) => page.locator('#sheet-session');

test('a player’s star is the table’s, a wish is the DM’s alone', async ({ browser }) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  // Everything the player's browser reads of stars and wishes.
  const read: Promise<string>[] = [];
  player.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('/reflections')) {
      read.push(response.text().catch(() => ''));
    }
  });
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);

  // The DM ends the evening (its closing is `evening-ritual.spec.ts`'s journey).
  await openSheet(dm, 'Session');
  const sheet = session(dm);
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await expect(
    sheet.getByRole('checkbox', {
      name: 'Ask everyone for stars and wishes on the table’s screens',
      exact: true,
    }),
  ).toBeChecked();
  await sheet
    .getByRole('checkbox', { name: 'Write a chapter about this session', exact: true })
    .uncheck();
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  const after = sheet.getByRole('region', { name: 'Stars and wishes' });
  await expect(after).toContainText(
    'Nobody has written yet. Players write on their own screens; you can write for someone who said it aloud.',
    WAIT,
  );

  // The player's lobby asks, and keeps what is written.
  const card = player.getByRole('region', { name: 'Stars and wishes' });
  await expect(card).toContainText(
    `The game is over: “${FIRST}”. Leave a star — what you liked — and a wish for next time.`,
    WAIT,
  );
  await expectAccessible(player, 'the lobby asking for a star and a wish');
  await card.getByRole('button', { name: 'Write mine', exact: true }).click();
  const star = card.getByLabel('A star: what did you like best?', { exact: true });
  await expect(star).toBeFocused();
  await expect(card).toContainText(
    'Everyone at the table reads your star. It also shows on the table’s screen.',
  );
  await expect(card).toContainText('Only the DM reads your wish. The other players never see it.');
  // Nothing written and nothing kept: nothing to send.
  await expect(card.getByRole('button', { name: 'Keep them', exact: true })).toBeDisabled();
  await expectAccessible(player, 'the star and the wish being written');
  await star.fill(STAR);
  await card.getByLabel('A wish: what do you want next time?', { exact: true }).fill(WISH);
  await card.getByRole('button', { name: 'Keep them', exact: true }).click();
  // The card shows what was kept, each with who reads it.
  await expect(card.locator('.stars-kept')).toContainText(STAR, WAIT);
  await expect(card.locator('.stars-kept')).toContainText('Your wish (only the DM reads it)');
  await expect(card.locator('.stars-kept')).toContainText(WISH);
  await expect(card.getByRole('button', { name: 'Change mine', exact: true })).toBeFocused();

  // The DM reads the star and, alone, the wish.
  await expect(after.locator('.evening-words').first()).toContainText(STAR, WAIT);
  await expect(after).toContainText(ELOWEN);
  // Wishes stay folded until the DM asks for them: the sheet may lie open at the table.
  const wishes = after.locator('.evening-wishes').first();
  await expect(wishes.locator('.evening-words')).toBeHidden();
  await wishes.getByText('Wishes: 1 — only you read them', { exact: true }).click();
  await expect(wishes).toContainText(WISH);
  await wishes.locator('summary').click();
  // A child said theirs aloud: the DM writes it for them.
  await after.getByText('Write a star and a wish for someone', { exact: true }).click();
  await after.getByLabel('Whose words', { exact: true }).selectOption({ label: 'Brann Ironvale' });
  await after.getByLabel('Star (everyone reads it)', { exact: true }).fill(BRANN_STAR);
  await after.getByLabel('Wish (only you read it)', { exact: true }).fill(BRANN_WISH);
  await after.getByRole('button', { name: 'Keep them', exact: true }).click();
  await expect(
    after.getByRole('status').filter({ hasText: 'Kept for Brann Ironvale.' }),
  ).toBeVisible(WAIT);
  await expect(after.getByLabel('Whose words', { exact: true })).toBeFocused();
  await expect(after).toContainText(BRANN_STAR);

  // Writing a star for someone who already wrote never wipes their wish: the form holds what they
  // kept, and says whose words these are.
  await after.getByLabel('Whose words', { exact: true }).selectOption({ label: ELOWEN });
  await expect(after).toContainText(`${ELOWEN} has already written. You are changing their words.`);
  await expect(after.getByLabel('Star (everyone reads it)', { exact: true })).toHaveValue(STAR);
  await expect(after.getByLabel('Wish (only you read it)', { exact: true })).toHaveValue(WISH);
  await after.getByLabel('Star (everyone reads it)', { exact: true }).fill(SAID_ALOUD);
  await after.getByRole('button', { name: 'Keep them', exact: true }).click();
  await expect(after.getByRole('status').filter({ hasText: `Kept for ${ELOWEN}.` })).toBeVisible(
    WAIT,
  );
  await wishes.locator('summary').click();
  await expect(wishes).toContainText(WISH);
  await expect(wishes).toContainText(BRANN_WISH);
  await expect(card.locator('.stars-kept')).toContainText(SAID_ALOUD, WAIT);
  await expect(card.locator('.stars-kept')).toContainText(WISH);
  await expectAccessible(dm, 'the DM’s stars and wishes');

  // The player reads Brann's star, never Brann's wish — on the screen or in what was received.
  await card.getByText('Everyone’s stars: 2', { exact: true }).click(WAIT);
  await expect(card).toContainText(BRANN_STAR);
  await expect(card).toContainText('Brann Ironvale');
  await expect(player.locator('body')).not.toContainText(BRANN_WISH);
  const received = (await Promise.all(read)).join('\n');
  expect(received).toContain(BRANN_STAR);
  expect(received).toContain(WISH);
  expect(received).not.toContain(BRANN_WISH);
  await expectAccessible(player, 'the table’s stars in the lobby');

  // The next session starts: the card goes; the DM keeps the evening's words for later.
  await sheet.getByRole('button', { name: 'Start the session', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Pause the game', exact: true })).toBeVisible(
    WAIT,
  );
  await expect(player.getByRole('region', { name: 'Stars and wishes' })).toHaveCount(0, WAIT);
});

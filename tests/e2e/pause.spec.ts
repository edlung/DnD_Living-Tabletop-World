import { expect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { isLiveStream } from './support/session.ts';
import { openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  invite,
  joinAsDm,
  openInvitation,
} from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * A short way to a pause (docs/adr/0073-table-ideas.md §2, Stage 810), on the invitation-mode
 * servers, where a table has two players and a screen: one press on a player's own screen tells
 * the DM alone — a card on the DM's screen; the other player's screen and the table's screen show
 * nothing and are sent nothing of it. The DM says "Not now", and later pauses the game. Chromium
 * on a laptop and WebKit on an iPad, each on a campaign of its own. No trace or screenshot is
 * kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 20_000 };
const ELOWEN = 'Elowen Starwhisper';
const TOLD = 'Only the DM was told that you would like a pause.';
const SEEN = 'The DM has seen that you asked for a pause. You can ask again in a minute.';
const PAUSED = 'The DM paused the game. It waits until they resume.';

/** Everything a page received about requests for a pause. */
function collectPauseReads(page: Page): () => Promise<string> {
  const bodies: Promise<string>[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/') && !isLiveStream(response)) {
      bodies.push(response.text().catch(() => ''));
    }
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

test('one press tells the DM alone: not the other player, not the table’s screen', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ipad = test.info().project.name === 'ipad';
  const campaign = ipad ? SIGN_IN_CAMPAIGNS.pauseIpad : SIGN_IN_CAMPAIGNS.pause;
  const words = WORDS.en;

  // The table: a TV, the DM, two players.
  const tv = await freshPage(browser);
  const tvReceived = collectPauseReads(tv);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^\S{4} \S{4}$/, LIVE);
  const dm = await freshPage(browser);
  await joinAsDm(dm, campaign);
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(tv.locator('.display-cast')).toBeVisible(LIVE);
  const elowen = await freshPage(browser);
  const first = await invite(dm, ELOWEN);
  await openInvitation(elowen, first);
  const brann = await freshPage(browser);
  const brannReceived = collectPauseReads(brann);
  const players = dm.locator('#sheet-players');
  await players
    .getByLabel(words.character, { exact: true })
    .selectOption({ label: 'Brann Ironvale' });
  await players.getByRole('button', { name: words.create, exact: true }).click();
  const field = players.getByLabel(words.link, { exact: true });
  await expect(field).not.toHaveValue(first, LIVE);
  await openInvitation(brann, await field.inputValue());
  await expect(elowen.locator('nav.dock')).toBeVisible(LIVE);
  await expect(brann.locator('nav.dock')).toBeVisible(LIVE);
  await dm.keyboard.press('Escape');

  // The game plays: each player's own screen has the button, one press away; the DM's has none.
  const ask = elowen.getByRole('button', { name: 'Ask for a pause', exact: true });
  await expect(ask).toBeVisible(LIVE);
  await expect(brann.getByRole('button', { name: 'Ask for a pause', exact: true })).toBeVisible(
    LIVE,
  );
  await expect(dm.getByRole('button', { name: 'Ask for a pause', exact: true })).toHaveCount(0);
  await expect(dm.locator('.pause-card')).toHaveCount(0);
  await expectAccessible(elowen, 'a player’s screen with the way to a pause');

  // One press.
  await ask.click();
  await expect(elowen.locator('.pause-asked')).toHaveText(TOLD, LIVE);
  await expect(ask).toHaveCount(0);
  // The button pressed is gone: the line that answers has the focus.
  await expect(elowen.locator('.pause-asked')).toBeFocused();

  // The DM's screen, and no other, shows who asks.
  const card = dm.locator('.pause-card');
  await expect(card).toHaveCount(1, LIVE);
  await expect(card).toContainText(`${ELOWEN} asks for a pause. Only you see this.`);
  await expectAccessible(dm, 'the DM’s screen with a request for a pause');
  // It is not table talk: the DM's chat holds no message of it.
  await openSheet(dm, 'Chat');
  await expect(dm.locator('#sheet-chat')).not.toContainText('pause');
  await dm.keyboard.press('Escape');
  // Brann's screen keeps its own button and says nothing; the TV says nothing.
  await expect(brann.locator('.pause-asked')).toHaveCount(0);
  await expect(brann.locator('.pause-card')).toHaveCount(0);
  await expect(brann.getByRole('button', { name: 'Ask for a pause', exact: true })).toBeVisible();
  await expect(tv.locator('body')).not.toContainText('pause');

  // "Not now": the asker reads that the DM has seen it; the game plays on.
  await card.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(card).toHaveCount(0, LIVE);
  // The card's last word stays where it was, with the focus its button held.
  const said = dm.locator('.pause-said');
  await expect(said).toHaveText(`${ELOWEN} will read that you have seen it.`);
  await expect(said).toBeFocused();
  await expect(elowen.locator('.pause-asked')).toHaveText(SEEN, LIVE);
  await expect(elowen.getByText(PAUSED, { exact: true })).toHaveCount(0);

  // The same request from "How to play": Brann asks there; the DM pauses the game.
  await brann.getByRole('button', { name: 'How to play' }).first().click();
  const guide = brann.getByRole('dialog', { name: 'How to play' });
  await guide.getByRole('button', { name: 'Our table', exact: true }).click();
  await guide.getByRole('button', { name: 'Ask for a pause', exact: true }).click();
  await expect(guide.getByRole('status')).toHaveText(TOLD, LIVE);
  await guide.getByRole('button', { name: 'Close the guide', exact: true }).click();
  await expect(card).toContainText('Brann Ironvale asks for a pause.', LIVE);
  await card.getByRole('button', { name: 'Pause the game', exact: true }).click();
  await expect(card).toHaveCount(0, LIVE);
  await expect(said).toHaveText('The game is paused. Resume it in Session.');
  // Everyone reads the pause — which names nobody.
  await expect(elowen.getByText(PAUSED, { exact: true })).toBeVisible(LIVE);
  await expect(brann.getByText(PAUSED, { exact: true })).toBeVisible(LIVE);
  await expect(brann.getByRole('button', { name: 'Ask for a pause', exact: true })).toHaveCount(0);

  // What the others were sent: no request but their own.
  const toTv = await tvReceived();
  expect(toTv, 'the screen was sent a request for a pause').not.toContain('"asks"');
  const toBrann = await brannReceived();
  expect(toBrann, 'a player was sent another’s request for a pause').not.toContain(
    'elowen-starwhisper"},"seen"',
  );
  expect(toBrann).not.toMatch(/"asks":\[\{"character":\{"entityId":"elowen/);

  // The DM resumes; the way to a pause is back.
  await openSheet(dm, 'Session');
  await dm
    .locator('#sheet-session')
    .getByRole('button', { name: 'Resume the game', exact: true })
    .click();
  await expect(elowen.getByRole('button', { name: 'Ask for a pause', exact: true })).toBeVisible(
    LIVE,
  );
});

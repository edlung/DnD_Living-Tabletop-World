import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';

import { dockButton, openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  invite,
} from './support/sign-in.ts';

/**
 * Release 1.0's journeys (docs/FULL_GAME_PLAN.md Stage 699, `work-orders/STAGE_699.md` 699b), on
 * the invitation-mode servers, in Chromium and WebKit: a DM with a login leads a new campaign of The
 * Bells of Hollowmere from the hub and invites three players, who join with logins of their own.
 * - At the table: a TV pairs by its code and shows the scene; the session starts at the table; a
 *   player's roll reaches the DM; the TV follows; the session ends and the players wait for the next.
 * - Online: the session starts online; every player has the table's screen and follows the DM's
 *   title card; what one player says in chat the others and the DM read.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const expect = baseExpect.configure({ timeout: 20_000 });
const words = WORDS.en;
const PASSWORD = 'three bells under the water';
const PARTY = ['Bryn Ashdown', 'Hesk Coalbeard', 'Lyra Venn'] as const;

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function takeSeatWithNewLogin(page: Page, name: string, login: string): Promise<void> {
  const invited = accessState(page, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill(name);
  await invited.getByLabel('Login', { exact: true }).fill(login);
  await invited.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
}

/**
 * The DM's new campaign of the starter adventure, and its three players seated. Each browser has a
 * campaign of its own to join from (its DM's links work once) and logins of its own.
 */
async function table(browser: Browser, index: number, prefix: string) {
  const engine = test.info().project.name;
  const campaign =
    engine === 'webkit' ? SIGN_IN_CAMPAIGNS.releaseWebkit : SIGN_IN_CAMPAIGNS.release;
  prefix = `${prefix}-${engine}`;
  const dm = await freshPage(browser);
  await dm.goto(`/join#${dmToken(campaign, index)}`);
  await takeSeatWithNewLogin(dm, 'Ada', `${prefix}-dm`);
  await expect(dockButton(dm, words.players)).toBeVisible();
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await dm
    .getByRole('region', { name: 'Your campaigns', exact: true })
    .getByRole('button', { name: 'In English: The Bells of Hollowmere', exact: true })
    .click();
  await expect(dockButton(dm, words.players)).toBeVisible();
  const players: Page[] = [];
  for (const [seat, character] of PARTY.entries()) {
    const link = await invite(dm, character);
    await dm.keyboard.press('Escape');
    const player = await freshPage(browser);
    await player.goto(link);
    await takeSeatWithNewLogin(
      player,
      character.split(' ')[0] ?? character,
      `${prefix}-p${String(seat)}`,
    );
    await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();
    players.push(player);
  }
  return { dm, players };
}

async function startSession(dm: Page, where: 'At the table' | 'Online'): Promise<void> {
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  await sheet.getByRole('radio', { name: where, exact: true }).check();
  await sheet.getByRole('button', { name: 'Start the session', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Pause the game', exact: true })).toBeVisible();
}

test('at the table: the DM, the TV and three players play a session', async ({ browser }) => {
  test.setTimeout(240_000);
  const { dm, players } = await table(browser, 0, 'table');
  for (const player of players) {
    await expect(player.getByText('The session has not started yet.')).toBeVisible();
  }

  // The TV pairs by its code and shows the party's scene.
  const tv = await freshPage(browser);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^[A-HJKMNP-Z2-9]{4} [A-HJKMNP-Z2-9]{4}$/);
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(screen.getByRole('status')).toHaveText(
    'The screen is paired: it shows what you choose below.',
  );
  await expect(tv.locator('main.display')).toHaveAttribute('data-cast', 'scene');
  await dm.keyboard.press('Escape');

  // The session starts at the table: every player's waiting banner goes.
  await startSession(dm, 'At the table');
  for (const player of players) {
    await expect(player.getByText('The session has not started yet.')).toBeHidden();
  }

  // A player rolls; the DM reads it in the table's log.
  const [first] = players;
  if (!first) throw new Error('no player');
  await openSheet(first, 'Dice');
  const dice = first.locator('#sheet-dice');
  await dice.getByRole('button', { name: 'Add a d20', exact: true }).click();
  await dice.getByRole('button', { name: 'Roll', exact: true }).click();
  await openSheet(dm, 'Chat');
  await expect(dm.locator('#sheet-chat .chat-line--roll')).toHaveCount(1);
  await dm.keyboard.press('Escape');

  // The session ends: the players wait for the next one; the TV still shows the table.
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  for (const player of players) {
    await expect(player.getByText('The session has not started yet.')).toBeVisible();
  }
  await expect(tv.locator('main.display')).toBeVisible();
});

test('online: every player has the table’s screen and the table’s talk', async ({ browser }) => {
  test.setTimeout(240_000);
  const { dm, players } = await table(browser, 1, 'online');
  await startSession(dm, 'Online');
  for (const player of players) await expect(dockButton(player, 'Table screen')).toBeAttached();

  // The DM's title card reaches every player's table's screen.
  await openSheet(dm, 'Table screen');
  const form = dm.locator('#sheet-screen').getByRole('region', { name: 'What the screens show' });
  await form.getByRole('radio', { name: 'A title card', exact: true }).check();
  await form.getByLabel('Title', { exact: true }).fill('The Bells Ring');
  await form.getByRole('button', { name: 'Show on the screens', exact: true }).click();
  for (const player of players) {
    await expect(
      player.locator('#sheet-shared').getByRole('heading', { name: 'The Bells Ring' }),
    ).toBeVisible();
  }
  await dm.keyboard.press('Escape');

  // One player speaks to the table; the others and the DM read it.
  const [speaker, ...others] = players;
  if (!speaker) throw new Error('no player');
  await openSheet(speaker, 'Chat');
  const chat = speaker.locator('#sheet-chat');
  await chat.getByLabel('Message', { exact: true }).fill('The bells are under the mill pond.');
  await chat.getByLabel('Message', { exact: true }).press('Enter');
  for (const reader of [dm, ...others]) {
    await openSheet(reader, 'Chat');
    await expect(reader.locator('#sheet-chat')).toContainText('The bells are under the mill pond.');
  }
});

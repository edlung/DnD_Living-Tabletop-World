import { expect, test, type Page } from '@playwright/test';

import boundary from '../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import { closePages, freshPage } from './support/pages.ts';
import { isLiveStream } from './support/session.ts';
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

/**
 * The ritual's checkpoint (docs/MEMORY_RITUAL_PLAN.md, Stage 760; ADR 0071 §1–4): one evening from
 * end to end with the DM, two players and the table's screen, on the invitation-mode servers —
 * the agreement read and understood, play, the evening closed with its chapter, stars and wishes,
 * the next date in the lobby and in the list of campaigns, and the next evening opened with
 * "Previously…". Then what each screen was sent: the party's view, nobody else's wish, no list of
 * who has agreed, none of the DM's secrets. Chromium on a laptop and WebKit on an iPad, each on a
 * campaign of its own. No trace or screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 20_000 };
const FIRST = 'Session 1: Arrival in Ravenford';
const LINE = 'We swore to find the missing caravan.';
const ELOWEN_STAR = 'The song by the fire.';
const ELOWEN_WISH = 'Shorter fights, please.';
const BRANN_STAR = 'Brann held the bridge alone.';
const BRANN_WISH = 'More riddles next time.';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/** Everything a page received, the live stream aside. */
function collectBodies(page: Page): () => Promise<string> {
  const bodies: Promise<string>[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/') && !isLiveStream(response)) {
      bodies.push(response.text().catch(() => ''));
    }
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

/** Six days ahead at 18:00, as a date field holds it. */
function nextSaturday() {
  const at = new Date();
  at.setDate(at.getDate() + 6);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T18:00`;
}

test('one evening from the agreement to “Previously…”, on every screen', async ({ browser }) => {
  test.setTimeout(300_000);
  const ipad = test.info().project.name === 'ipad';
  const campaign = ipad ? SIGN_IN_CAMPAIGNS.checkpointIpad : SIGN_IN_CAMPAIGNS.checkpoint;
  const words = WORDS.en;

  // The table: a TV with its code, the DM with a login (the list of campaigns needs one), two
  // players by their invitations.
  const tv = await freshPage(browser);
  const tvReceived = collectBodies(tv);
  await tv.goto('/display');
  const code = tv.locator('.display-code');
  await expect(code).toHaveText(/^\S{4} \S{4}$/, LIVE);
  const dm = await freshPage(browser);
  await dm.goto(joinPath(dmToken(campaign)));
  const invited = accessState(dm, words.invited);
  await invited.getByLabel('Your name at the table', { exact: true }).fill('Ada');
  await invited
    .getByLabel('Login', { exact: true })
    .fill(ipad ? 'ada-checkpoint-ipad' : 'ada-checkpoint');
  await invited.getByLabel('Password', { exact: true }).fill('a lantern in the rain');
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
  await openSheet(dm, 'Table screen');
  const screen = dm.locator('#sheet-screen');
  await screen.getByLabel('The screen’s code', { exact: true }).fill(await code.innerText());
  await screen.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(screen.getByRole('status')).toHaveText(
    'The screen is paired: it shows what you choose below.',
  );
  const elowen = await freshPage(browser);
  const elowenReceived = collectBodies(elowen);
  const first = await invite(dm, 'Elowen Starwhisper');
  await openInvitation(elowen, first);
  const brann = await freshPage(browser);
  const brannReceived = collectBodies(brann);
  // The second link, not the first still standing in the field.
  const players = dm.locator('#sheet-players');
  await players
    .getByLabel(words.character, { exact: true })
    .selectOption({ label: 'Brann Ironvale' });
  await players.getByRole('button', { name: words.create, exact: true }).click();
  const field = players.getByLabel(words.link, { exact: true });
  await expect(field).not.toHaveValue(first, LIVE);
  await openInvitation(brann, await field.inputValue());
  await expect(elowen.locator('nav.book-parts')).toBeVisible(LIVE);
  await expect(brann.locator('nav.book-parts')).toBeVisible(LIVE);

  // 1. The agreement: written, shown on the TV, read and understood by both players.
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  const agreement = sheet.getByRole('region', { name: 'The table’s agreement' });
  await agreement
    .getByLabel('Our sign for a pause (optional)', { exact: true })
    .fill('Raise a hand');
  await agreement.getByRole('button', { name: 'Save the agreement', exact: true }).click();
  await agreement
    .getByRole('button', { name: 'Show the agreement on the table’s screens', exact: true })
    .click();
  await expect(tv.locator('.display-agreement')).toContainText('Raise a hand', LIVE);
  for (const player of [elowen, brann]) {
    const card = player.locator('.agreement-card');
    await card.getByRole('button', { name: 'Read it', exact: true }).click({ timeout: 20_000 });
    const page = player.getByRole('dialog', { name: 'The table’s agreement' });
    await expect(page).toContainText('Raise a hand');
    await page.getByRole('button', { name: 'Understood', exact: true }).click();
    await expect(card).toHaveCount(0, LIVE);
  }
  await expect(agreement.getByRole('heading', { name: /^Understood: 2 of \d+$/ })).toBeVisible(
    LIVE,
  );

  // 2. Play: the session is open; a player asks for a pause in words only the DM reads.
  await elowen.getByRole('button', { name: 'How to play' }).first().click();
  const guide = elowen.getByRole('dialog', { name: 'How to play' });
  await guide.getByRole('button', { name: 'Our table', exact: true }).click();
  await guide.getByRole('button', { name: 'Ask for a pause', exact: true }).click();
  await expect(guide.getByRole('status')).toHaveText(
    'Only the DM was told that you would like a pause.',
  );
  await guide.getByRole('button', { name: 'Close the guide', exact: true }).click();
  // The DM alone reads it, on a card (ADR 0073 §2), and answers.
  const asked = dm.locator('.pause-card');
  await expect(asked).toContainText('Elowen Starwhisper asks for a pause.', LIVE);
  await asked.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(asked).toHaveCount(0, LIVE);

  // 3. The evening closes with its chapter; the TV stays paired and asks for stars and wishes.
  await sheet.getByRole('button', { name: 'End the session', exact: true }).click();
  await sheet
    .getByRole('group', { name: 'The evening’s moments' })
    .getByLabel('What mattered most tonight, in your own words (optional)', { exact: true })
    .fill(LINE);
  await sheet.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(sheet.locator('.session-ended')).toContainText(
    /Chapter written( as the plain record: [^.]+)?\./,
    LIVE,
  );
  const stars = tv.locator('.display-stars');
  await expect(stars).toContainText('A star for tonight: what did you like?', LIVE);

  // 4. Stars and wishes: each player's star is the table's, each wish the DM's alone.
  for (const [player, star, wish] of [
    [elowen, ELOWEN_STAR, ELOWEN_WISH],
    [brann, BRANN_STAR, BRANN_WISH],
  ] as const) {
    const card = player.getByRole('region', { name: 'Stars and wishes' });
    await card.getByRole('button', { name: 'Write mine', exact: true }).click({ timeout: 20_000 });
    await card.getByLabel('A star: what did you like best?', { exact: true }).fill(star);
    await card.getByLabel('A wish: what do you want next time?', { exact: true }).fill(wish);
    await card.getByRole('button', { name: 'Keep them', exact: true }).click();
    await expect(stars).toContainText(star, LIVE);
  }
  const words720 = sheet.getByRole('region', { name: 'Stars and wishes' });
  await words720.getByText(/^Wishes: 2/).click();
  await expect(words720).toContainText(ELOWEN_WISH, LIVE);
  await expect(words720).toContainText(BRANN_WISH);
  await expect(elowen.getByRole('region', { name: 'Stars and wishes' })).toContainText(
    BRANN_STAR,
    LIVE,
  );

  // 5. The next game: in each lobby, and on the campaign's card in the DM's list.
  const next = sheet.getByRole('region', { name: 'The next game' });
  await next.getByLabel('Day and time', { exact: true }).fill(nextSaturday());
  await next.getByLabel('A note for everyone (optional)', { exact: true }).fill('At Grandma’s');
  await next.getByRole('button', { name: 'Set the date', exact: true }).click();
  for (const player of [elowen, brann]) {
    await expect(player.locator('.next-game--lobby')).toContainText(
      /in 6 days\s+At Grandma’s/,
      LIVE,
    );
  }
  await expect(elowen.getByRole('region', { name: 'Previously…' })).toContainText(FIRST, LIVE);

  // 6. The next evening opens with "Previously…" on the TV; the date for a later day stays.
  await expect(
    sheet.getByRole('checkbox', {
      name: 'Open with “Previously…” on the table’s screen',
      exact: true,
    }),
  ).toBeChecked();
  await sheet.getByRole('button', { name: 'Start the session', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Pause the game', exact: true })).toBeVisible(
    LIVE,
  );
  const recap = tv.locator('.display-chronicle');
  await expect(recap.getByRole('heading', { level: 1, name: FIRST })).toBeVisible(LIVE);
  await expect(recap).toContainText('Previously…');
  await expect(next).toContainText('in 6 days');
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  await expect(
    dm.getByRole('region', { name: 'Your campaigns', exact: true }).locator('.next-game--hub'),
  ).toContainText(/Next game: .* — in 6 days\s+At Grandma’s/, LIVE);

  // What each screen was sent. The TV: the party's view — the chapter, the stars — and no wish,
  // no list of who agreed, none of the DM's secrets.
  const onTv = await tvReceived();
  expect(onTv).toContain(FIRST);
  expect(onTv).toContain(ELOWEN_STAR);
  for (const wish of [ELOWEN_WISH, BRANN_WISH]) {
    expect(onTv, 'the screen received a wish').not.toContain(wish);
  }
  expect(onTv, 'the screen received who agreed').not.toContain('"readers":[');
  for (const marker of boundary.forbiddenMarkers.PARTY) {
    expect(onTv, `the screen received ${marker}`).not.toContain(marker);
  }
  // A player: their own wish, never the other's; no list of who agreed; no request for a pause
  // that was not theirs.
  const toElowen = await elowenReceived();
  expect(toElowen).toContain(ELOWEN_WISH);
  expect(toElowen, 'a player received another’s wish').not.toContain(BRANN_WISH);
  expect(toElowen).not.toContain('"readers":[');
  const toBrann = await brannReceived();
  expect(toBrann, 'a player received another’s wish').not.toContain(ELOWEN_WISH);
  expect(toBrann, 'a player received another’s request for a pause').not.toMatch(/"asks":\[\{/);
  expect(toBrann).not.toContain('"readers":[');
});

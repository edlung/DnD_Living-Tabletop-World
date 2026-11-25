import { expect, test, type Page } from '@playwright/test';

import boundary from '../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import { closePages, freshPage } from './support/pages.ts';
import { isLiveStream } from './support/session.ts';
import { openSheet, openTopMenu } from './support/shell.ts';
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
import { tile } from './support/choices.ts';

/**
 * The close of Part 2 (docs/MEMORY_RITUAL_PLAN.md, Stage 799; ADR 0072 §1–3): a campaign's last
 * evening and what it leaves, with the DM, two players and the table's screen, on the
 * invitation-mode servers — a cheer on every screen, the DM's break, the evening closed with its
 * chapter and a star, the campaign finished with closing words, a keepsake chosen by a player and
 * one by the DM for another, the whole book down to "The end", applause for its last page, and
 * the adventure among those finished in the DM's list. Then what each screen was sent: the
 * party's view, nobody else's wish, none of the DM's secrets, and of a cheer its mark and a name.
 * Chromium on a laptop and WebKit on an iPad, each on a campaign of its own. No trace or
 * screenshot is kept: the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 20_000 };
const FIRST = 'Session 1: Arrival in Ravenford';
const LINE = 'We brought the caravan home.';
const ELOWEN = 'Elowen Starwhisper';
const BRANN = 'Brann Ironvale';
const ELOWEN_STAR = 'The song by the fire.';
const ELOWEN_WISH = 'A dragon next time, please.';
const LAST_WORDS = 'Thank you for the road. Until the next world.';
const KEPT_LINE = 'It still smells of the road.';
const PAUSED = 'The DM paused the game. It waits until they resume.';

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

const cheerRow = (page: Page) => page.getByRole('group', { name: 'Without words', exact: true });

test('a last evening, the campaign’s end and its book, on every screen', async ({ browser }) => {
  test.setTimeout(360_000);
  const ipad = test.info().project.name === 'ipad';
  const campaign = ipad ? SIGN_IN_CAMPAIGNS.keepsakesIpad : SIGN_IN_CAMPAIGNS.keepsakes;
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
    .fill(ipad ? 'ada-keepsakes-ipad' : 'ada-keepsakes');
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
  const first = await invite(dm, ELOWEN);
  await openInvitation(elowen, first);
  const brann = await freshPage(browser);
  const brannReceived = collectBodies(brann);
  // The second link, not the first still standing in the field.
  const players = dm.locator('#sheet-players');
  await tile(players, words.character, BRANN).check();
  await players.getByRole('button', { name: words.create, exact: true }).click();
  const field = players.getByLabel(words.link, { exact: true });
  await expect(field).not.toHaveValue(first, LIVE);
  await openInvitation(brann, await field.inputValue());
  await expect(elowen.locator('nav.book-parts')).toBeVisible(LIVE);
  await expect(brann.locator('nav.book-parts')).toBeVisible(LIVE);

  // 1. Small comforts in play. Brann applauds: the TV, the DM and Elowen see whose it is.
  await openSheet(brann, 'Dice');
  await cheerRow(brann).getByRole('button', { name: 'Applause', exact: true }).click();
  const onScreen = tv.locator('.cheer-layer--display');
  await expect(onScreen.locator('.cheer-by')).toHaveText(BRANN, LIVE);
  await expect(onScreen.locator('.cheer')).toHaveCount(0, LIVE);
  // Elowen reads at the largest text; nobody else's screen changes.
  await openSheet(elowen, 'Dice');
  const dice = elowen.locator('#sheet-dice');
  await dice.getByText('This screen: sound, motion, text size', { exact: true }).click();
  await tile(dice, 'Text size', 'Largest').check();
  await expect(elowen.locator('html')).toHaveAttribute('data-text-size', 'larger');
  await expect(brann.locator('html')).not.toHaveAttribute('data-text-size');
  await expect(tv.locator('html')).not.toHaveAttribute('data-text-size');

  // The DM's break: the count stands a few seconds short of an hour (the count itself is
  // `break-timer.test.ts`'s); the TV says "Break", the players wait, and the table comes back.
  const sessionId = await dm.evaluate(async (id) => {
    const lobby = (await (await fetch(`/api/campaigns/${id}/lobby?perspective=DM`)).json()) as {
      session: { sessionId: string } | null;
    };
    return lobby.session?.sessionId ?? '';
  }, campaign);
  expect(sessionId).not.toBe('');
  await dm.evaluate(
    ([key, id]) => {
      const state = {
        sessionId: id,
        played: 60 * 60_000 - 1_000,
        seenAt: Date.now() - 2_000,
        pausedAt: null,
        onBreak: false,
        shown: false,
        resume: null,
        askAt: 0,
        awaited: false,
      };
      window.localStorage.setItem(key, JSON.stringify(state));
    },
    [`ltw.break:${campaign}`, sessionId] as const,
  );
  await dm.reload();
  await expect(dm.locator('nav.book-parts')).toBeVisible(LIVE);
  await openSheet(dm, 'Session');
  const sheet = dm.locator('#sheet-session');
  await sheet
    .getByLabel('Remind me to take a break', { exact: true })
    .selectOption({ label: 'After 60 minutes of play' });
  const ask = dm.getByRole('region', { name: 'Time for a break?', exact: true });
  await ask.getByRole('button', { name: 'Take a break', exact: true }).click(LIVE);
  await expect(
    tv.locator('.display-title').getByRole('heading', { level: 1, name: 'Break', exact: true }),
  ).toBeVisible(LIVE);
  for (const player of [elowen, brann]) await expect(player.getByText(PAUSED)).toBeVisible(LIVE);
  await dm
    .getByRole('region', { name: 'Break', exact: true })
    .getByRole('button', { name: 'Back to the game', exact: true })
    .click();
  await expect(tv.getByRole('heading', { level: 1, name: 'Break', exact: true })).toHaveCount(
    0,
    LIVE,
  );
  for (const player of [elowen, brann]) await expect(player.getByText(PAUSED)).toBeHidden(LIVE);

  // 2. The last evening closes with its chapter; Elowen leaves a star and a wish.
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
  const starsCard = elowen.getByRole('region', { name: 'Stars and wishes' });
  await starsCard.getByRole('button', { name: 'Write mine', exact: true }).click(LIVE);
  await starsCard.getByLabel('A star: what did you like best?', { exact: true }).fill(ELOWEN_STAR);
  await starsCard
    .getByLabel('A wish: what do you want next time?', { exact: true })
    .fill(ELOWEN_WISH);
  await starsCard.getByRole('button', { name: 'Keep them', exact: true }).click();
  await expect(tv.locator('.display-stars')).toContainText(ELOWEN_STAR, LIVE);

  // 3. The DM finishes the campaign with closing words; every lobby says so.
  const end = sheet.getByRole('region', { name: 'The adventure’s end' });
  await end.getByText('Finish the campaign', { exact: true }).click();
  await end
    .getByLabel('A few closing words for the table (optional)', { exact: true })
    .fill(LAST_WORDS);
  await end.getByRole('button', { name: 'Yes, finish the campaign', exact: true }).click();
  await expect(end).toContainText(/Finished on .*\d{4}\. Now it can only be read\./, LIVE);
  const cardOf = (page: Page) => page.getByRole('region', { name: 'The adventure is finished' });
  for (const player of [elowen, brann]) {
    await expect(
      cardOf(player).getByRole('figure', { name: 'The DM’s closing words' }),
    ).toContainText(LAST_WORDS, LIVE);
  }

  // 4. Keepsakes: Elowen chooses a thing she carries, with a line; the DM chooses the chapter for
  // Brann, who said his aloud. Everyone reads both.
  const card = cardOf(elowen);
  await card.getByRole('button', { name: 'Choose a keepsake', exact: true }).click();
  const what = card.getByLabel(`What ${ELOWEN} keeps`, { exact: true });
  const thing = what.locator('optgroup[label="Things the hero carries"] option').first();
  await expect(thing).toBeAttached(LIVE);
  const carried = (await thing.innerText()).trim();
  await what.selectOption(await thing.getAttribute('value'));
  await card.getByLabel('A few words about it (optional)', { exact: true }).fill(KEPT_LINE);
  await card.getByRole('button', { name: 'Keep this', exact: true }).click();
  await expect(card.locator('.stars-kept')).toContainText(carried, LIVE);
  await end.getByText('Choose a keepsake for someone', { exact: true }).click();
  await end.getByLabel('Who is it for?', { exact: true }).selectOption({ label: BRANN });
  await end.getByLabel(`What ${BRANN} keeps`, { exact: true }).selectOption({ label: FIRST }, LIVE);
  await end.getByRole('button', { name: 'Keep this', exact: true }).click();
  await expect(end).toContainText(`${BRANN} keeps the chapter “${FIRST}”`, LIVE);
  await expect(cardOf(brann).getByText('What the heroes keep: 2', { exact: true })).toBeVisible(
    LIVE,
  );

  // 5. The whole book, on Brann's screen: the evening, its star, what the heroes keep, the DM's
  // words, "The end" — and no wish.
  await cardOf(brann).getByRole('button', { name: 'Open the book', exact: true }).click();
  const dialog = brann.locator('dialog.chronicle-dialog');
  const book = dialog.getByRole('region', { name: 'The book of the campaign' });
  await expect(book.getByRole('region', { name: FIRST })).toContainText(LINE, LIVE);
  await expect(book.getByRole('list', { name: 'What we loved that evening' })).toContainText(
    ELOWEN_STAR,
  );
  const keepsakes = book.getByRole('region', { name: 'What the heroes keep' });
  await expect(keepsakes).toContainText(`${ELOWEN} keeps: ${carried}`);
  await expect(keepsakes).toContainText(KEPT_LINE);
  await expect(keepsakes).toContainText(`${BRANN} keeps the chapter “${FIRST}”`);
  await expect(book.getByRole('figure', { name: 'The DM’s closing words' })).toContainText(
    LAST_WORDS,
  );
  await expect(book.locator('.keepsake-ending')).toHaveText('The end');
  await expect(book).not.toContainText(ELOWEN_WISH);
  await dialog.getByRole('button', { name: 'Close the Chronicle', exact: true }).click();

  // 6. Applause for the last page: a finished campaign refuses play and still takes a cheer.
  // (From Chat: at a laptop's size the finished adventure's card lies over the top of an open
  // sheet, where Dice keeps its row.)
  await openSheet(brann, 'Chat');
  await brann
    .locator('#sheet-chat')
    .getByRole('group', { name: 'Without words', exact: true })
    .getByRole('button', { name: 'Love it!', exact: true })
    .click();
  await expect(onScreen.locator('.cheer-by')).toHaveText(BRANN, LIVE);
  await expect(dm.locator('.cheer-layer .cheer-by')).toHaveText(BRANN, LIVE);

  // 7. The home between worlds: the adventure among those finished in the DM's list, its heroes
  // and what they keep, the book first.
  await openTopMenu(dm);
  await dm.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const finished = dm.getByRole('region', { name: 'Adventures we finished', exact: true });
  await expect(finished.getByRole('listitem').first()).toBeVisible(LIVE);
  await expect(finished).toContainText(/Played on .*\d{4}/);
  await expect(finished).toContainText(new RegExp(`Heroes: .*${BRANN}`));
  await expect(finished).toContainText(carried);
  await expect(finished.getByRole('button', { name: /^The book of / })).toBeVisible();

  // What each screen was sent. The TV: the party's view — the chapter, the star, the cheers —
  // and no wish, none of the DM's secrets. (It asks for nothing of the end: no cast shows it.)
  const onTv = await tvReceived();
  expect(onTv).toContain(FIRST);
  expect(onTv).toContain(ELOWEN_STAR);
  expect(onTv).toContain('"mark":"applause"');
  expect(onTv, 'the screen received a wish').not.toContain(ELOWEN_WISH);
  for (const marker of boundary.forbiddenMarkers.PARTY) {
    expect(onTv, `the screen received ${marker}`).not.toContain(marker);
  }
  // A player: their own wish and never another's; the book as the party, with no wish in it.
  const toElowen = await elowenReceived();
  expect(toElowen).toContain(ELOWEN_WISH);
  for (const marker of boundary.forbiddenMarkers['CHARACTER:elowen-starwhisper']) {
    expect(toElowen, `a player received ${marker}`).not.toContain(marker);
  }
  const toBrann = await brannReceived();
  expect(toBrann, 'a player received another’s wish').not.toContain(ELOWEN_WISH);
  expect(toBrann).toContain(KEPT_LINE);
  // Of a cheer a screen is sent its mark and who gave it, and nothing else.
  expect(toElowen).toMatch(
    /"cheers":\[\{"cheerId":"[0-9a-f-]{36}","mark":"applause","by":\{"entityId":"[^"]+","name":"Brann Ironvale"\}\}\]/,
  );
});

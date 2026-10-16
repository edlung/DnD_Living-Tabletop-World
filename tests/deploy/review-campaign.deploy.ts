import { expect, test, type Page } from '@playwright/test';

import { WORDS, accessState, takeSeat } from '../e2e/support/sign-in.ts';
import { chooseLocation, dockButton, openSheet, sceneRegion } from '../e2e/support/shell.ts';
import {
  START,
  captureRequests,
  curatedHash,
  curatedHashes,
  deploymentLogs,
  expectServedAsContent,
  holdsAny,
  instrument,
  isInvitationLink,
  openLink,
  operatorDmLink,
  sessionOf,
  shownPicture,
  tokenOf,
  watchPictures,
} from './support.ts';

/**
 * The review campaign on the deployment, in Russian browsers, through Caddy over HTTPS
 * (docs/adr/0037-deployment.md, "Full product"; the screens of docs/STAGE_340_DESIGN.md "Part B";
 * the pictures of docs/STAGE_330_DESIGN.md): the operator issues the DM's link in the server
 * container; the DM takes the seat on the join page, invites a player for Elowen from the
 * Players sheet; the player takes the seat and sees the market square with its curated picture
 * and the figures standing in it, served as authorized content and shown without a policy
 * violation; the player acts once; the DM revokes the player, whose screen says "You are signed
 * out" through the live stream alone; the DM signs out. No token in a request URL, outside the
 * redeem, or in the proxy's and the server's logs.
 */
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const ru = WORDS.ru;
const ELOWEN = 'Эловен Старвиспер';
const SQUARE = 'Рыночная площадь';

/** The DM revokes Elowen's player in the open Players sheet, asked first. */
async function revoke(dm: Page): Promise<void> {
  const sheet = dm.locator('#sheet-players');
  const seat = sheet
    .getByRole('region', { name: ru.members })
    .getByRole('listitem')
    .filter({ hasText: ELOWEN });
  await seat.getByRole('button', { name: ru.revoke(ELOWEN) }).click();
  await seat.getByRole('button', { name: ru.revokeYes }).click();
  await expect(sheet).toContainText(
    `${ELOWEN}: доступ игрока отозван, персонажа можно пригласить снова.`,
  );
}

/** The command a press sends, and the World Engine's answer to it. */
async function acted(page: Page, press: () => Promise<void>): Promise<void> {
  const answer = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/commands') &&
      response.request().method() === 'POST',
  );
  await press();
  const response = await answer;
  expect(response.status()).toBe(200);
  expect(((await response.json()) as { status: string }).status).toBe('accepted');
}

test('по-русски через Caddy: DM приглашает, игрок видит площадь с картинами, отзыв выводит его', async ({
  browser,
}) => {
  // The operator's link for the DM, from the server container (never printed).
  const dmLink = await operatorDmLink();
  const dmContext = await browser.newContext({ locale: 'ru-RU' });
  const dmRequests = captureRequests(dmContext);
  const dmViolations = await instrument(dmContext);
  const dm = await dmContext.newPage();
  const pagePolicy = await openLink(dm, dmLink);
  // The page's policy lets the client show pictures from object URLs.
  expect(pagePolicy).toContain("img-src 'self' blob: data:");
  await expect(accessState(dm, ru.invited)).toContainText(
    'Пока вы не займёте место, приглашение не используется.',
  );
  await takeSeat(dm, ru);
  await expect(dockButton(dm, ru.players)).toBeVisible();
  expect(dm.url() === START, 'the DM page keeps the start page as its address').toBe(true);

  // The DM invites a player for Elowen; the link is shown once. (A run that stopped half-way
  // may have left a player in Elowen's seat: the DM frees it first.)
  await openSheet(dm, ru.players);
  const sheet = dm.locator('#sheet-players');
  // The listing has been read once the players at the table show.
  const members = sheet.getByRole('region', { name: ru.members });
  await expect(members).toBeVisible();
  const seat = members.getByRole('listitem').filter({ hasText: ELOWEN });
  if ((await seat.count()) > 0) await revoke(dm);
  await sheet.getByLabel(ru.character, { exact: true }).selectOption({ label: ELOWEN });
  await sheet.getByRole('button', { name: ru.create, exact: true }).click();
  const field = sheet.getByLabel(ru.link, { exact: true });
  await expect(field).toBeVisible();
  const playerLink = await field.inputValue();
  expect(isInvitationLink(playerLink), 'the link is <PUBLIC_ORIGIN>/join#<token>').toBe(true);
  await expect(sheet).toContainText('Показывается один раз.');

  // The player takes the seat in another browser.
  const playerContext = await browser.newContext({ locale: 'ru-RU' });
  const playerRequests = captureRequests(playerContext);
  const playerViolations = await instrument(playerContext);
  const player = await playerContext.newPage();
  const pictures = watchPictures(player);
  await openLink(player, playerLink);
  await takeSeat(player, ru);
  await expect(player.getByRole('heading', { level: 1, name: 'Пропавший караван' })).toBeVisible();
  expect(player.url() === START, 'the player page keeps the start page as its address').toBe(true);
  const sessions = [await sessionOf(dmContext), await sessionOf(playerContext)];
  expect(
    sessions.every((session) => session.length === 43),
    'two session cookies',
  ).toBe(true);

  // A rerun on the same deployment finds Elowen where the last journey left her (the HTTP
  // journeys end at the caravan site): she walks back to the market square first.
  const scene = sceneRegion(player, 'Сцена');
  const place = scene.locator('.cartouche h2');
  await expect(place).toHaveText(/\S/);
  if ((await place.textContent()) !== SQUARE) {
    const explore = player.getByRole('button', { name: `Осмотреть: ${SQUARE}`, exact: true });
    if (!(await explore.first().isVisible())) await openSheet(player, 'Места');
    await explore.first().click();
    const details = player.getByRole('complementary', { name: 'Подробности', exact: true });
    await acted(player, () =>
      details.getByRole('button', { name: `Войти: ${SQUARE}`, exact: true }).click(),
    );
  }
  await chooseLocation(player, 'market-square', { sheet: 'Места', label: 'Место' });
  await expect(place).toHaveText(SQUARE);

  // The market square: its curated picture behind the scene, Mira standing as her figure.
  const backdrop = await shownPicture(player.locator('.stage-backdrop .backdrop-art'));
  expect(curatedHashes('market-square', 'image')).toContain(backdrop);
  const mira = player.getByRole('button', { name: 'Мира Вейл', exact: true });
  expect(await shownPicture(mira.locator('.miniature-art'))).toBe(
    curatedHash('mira-vale--figure.webp'),
  );
  // Everyone standing in the scene is a curated figure (Mira, and Elowen herself).
  const standing = await scene.locator('.miniature-art').all();
  expect(standing.length).toBeGreaterThanOrEqual(2);
  for (const figure of standing) {
    const hash = await shownPicture(figure);
    expect(curatedHashes(null, 'figure')).toContain(hash);
    expectServedAsContent(await pictures.get(hash));
  }
  expectServedAsContent(await pictures.get(backdrop));
  await expect(player.getByText('Изображения пока нет', { exact: true })).toHaveCount(0);

  // The player acts once: Elowen looks Mira over.
  await mira.click();
  const details = player.getByRole('complementary', { name: 'Подробности', exact: true });
  await expect(details.getByRole('heading', { name: 'Что вы хотите сделать?' })).toBeVisible();
  await acted(player, () =>
    details.getByRole('button', { name: 'Осмотреть', exact: true }).click(),
  );

  // The DM sees the player at the table and revokes the access.
  await expect(seat).toContainText('Вход выполнен');
  // Quiet: the player's reads after acting are over; from now on only the live stream may
  // tell the player's screen anything.
  await player.waitForTimeout(3_000);
  let reads = 0;
  player.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !path.endsWith('/live')) reads += 1;
  });
  await revoke(dm);
  await expect(accessState(player, ru.signedOut)).toContainText(
    'Чтобы вернуться за стол, откройте новую ссылку-приглашение.',
    { timeout: 10_000 },
  );
  await expect(mira).toHaveCount(0);
  expect(reads, 'requests the player sent before the signed-out screen').toBe(0);

  // The DM signs out, asked first.
  await dm.getByRole('button', { name: ru.signOut, exact: true }).click();
  const dialog = dm.getByRole('dialog', { name: ru.signOutQuestion });
  await dialog.getByRole('button', { name: ru.signOut, exact: true }).click();
  await expect(accessState(dm, ru.signedOut)).toBeVisible();

  // No policy violation; no token where it does not belong; no credential in any log.
  expect(dmViolations, 'policy violations on the DM pages').toEqual([]);
  expect(playerViolations, 'policy violations on the player pages').toEqual([]);
  const tokens = [tokenOf(dmLink), tokenOf(playerLink)];
  dmRequests.expectTokensOnlyInRedeems(tokens);
  playerRequests.expectTokensOnlyInRedeems(tokens);
  expect(
    holdsAny(await deploymentLogs(), [...tokens, ...sessions]),
    'a link token or session cookie in the logs of the proxy or the server',
  ).toBe(false);
  await dmContext.close();
  await playerContext.close();
});

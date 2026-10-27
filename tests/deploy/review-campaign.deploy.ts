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

test('the review campaign in Russian browsers, through Caddy', async ({ browser }) => {
  const step = test.step.bind(test);
  const dmLink = await step('the operator issues the DM link in the server container', () =>
    operatorDmLink(),
  );
  const dmContext = await browser.newContext({ locale: 'ru-RU' });
  const dmRequests = captureRequests(dmContext);
  const dmViolations = await instrument(dmContext);
  const dm = await dmContext.newPage();
  await step('the DM takes the seat on the join page («Занять место»)', async () => {
    const pagePolicy = await openLink(dm, dmLink);
    // The page's policy lets the client show pictures from object URLs.
    expect(pagePolicy).toContain("img-src 'self' blob: data:");
    await expect(accessState(dm, ru.invited)).toContainText(
      'Пока вы не займёте место, приглашение не используется.',
    );
    await takeSeat(dm, ru);
    await expect(dockButton(dm, ru.players)).toBeVisible();
    expect(dm.url() === START, 'the DM page keeps the start page as its address').toBe(true);
  });

  const sheet = dm.locator('#sheet-players');
  const seat = sheet
    .getByRole('region', { name: ru.members })
    .getByRole('listitem')
    .filter({ hasText: ELOWEN });
  const playerLink = await step(
    'the DM invites a player for Elowen in the Players sheet',
    async () => {
      await openSheet(dm, ru.players);
      // The listing has been read once the players at the table show. A run that stopped
      // half-way may have left a player in Elowen's seat: the DM frees it first.
      await expect(sheet.getByRole('region', { name: ru.members })).toBeVisible();
      if ((await seat.count()) > 0) await revoke(dm);
      await sheet.getByLabel(ru.character, { exact: true }).selectOption({ label: ELOWEN });
      await sheet.getByRole('button', { name: ru.create, exact: true }).click();
      const field = sheet.getByLabel(ru.link, { exact: true });
      await expect(field).toBeVisible();
      const link = await field.inputValue();
      expect(isInvitationLink(link), 'the link is <PUBLIC_ORIGIN>/join#<token>').toBe(true);
      await expect(sheet).toContainText('Показывается один раз.');
      return link;
    },
  );

  const playerContext = await browser.newContext({ locale: 'ru-RU' });
  const playerRequests = captureRequests(playerContext);
  const playerViolations = await instrument(playerContext);
  const player = await playerContext.newPage();
  const pictures = watchPictures(player);
  const sessions = await step('the player takes the seat in another browser', async () => {
    await openLink(player, playerLink);
    await takeSeat(player, ru);
    await expect(
      player.getByRole('heading', { level: 1, name: 'Пропавший караван' }),
    ).toBeVisible();
    expect(player.url() === START, 'the player page keeps the start page as its address').toBe(
      true,
    );
    const both = [await sessionOf(dmContext), await sessionOf(playerContext)];
    expect(
      both.every((session) => session.length === 43),
      'two session cookies',
    ).toBe(true);
    return both;
  });

  // A rerun on the same deployment finds Elowen where the last journey left her (the HTTP
  // journeys end at the caravan site): she walks back to the market square first.
  const scene = sceneRegion(player, 'Сцена');
  const place = scene.locator('.cartouche h2');
  await expect(place).toHaveText(/\S/);
  const start = (await place.textContent()) ?? '';
  if (start !== SQUARE) {
    await step(`Elowen is at «${start}»: she walks back to the market square`, async () => {
      const explore = player.getByRole('button', { name: `Взглянуть: ${SQUARE}`, exact: true });
      if (!(await explore.first().isVisible())) await openSheet(player, 'Места');
      await explore.first().click();
      const details = player.getByRole('complementary', { name: 'Подробности', exact: true });
      await acted(player, () =>
        details.getByRole('button', { name: `Войти: ${SQUARE}`, exact: true }).click(),
      );
    });
  }

  const mira = player.getByRole('button', { name: 'Мира Вейл', exact: true });
  const shown = await step(
    'the market square: its curated picture, the figures standing in it',
    async () => {
      await chooseLocation(player, 'market-square', { sheet: 'Места', label: 'Место' });
      await expect(place).toHaveText(SQUARE);
      const backdrop = await shownPicture(player.locator('.stage-backdrop .backdrop-art'));
      expect(curatedHashes('market-square', 'image')).toContain(backdrop);
      expect(await shownPicture(mira.locator('.miniature-art'))).toBe(
        curatedHash('mira-vale--figure.webp'),
      );
      // Everyone standing in the scene is a curated figure (Mira, and Elowen herself), and every
      // picture came as authorized content through the proxy.
      const standing = await scene.locator('.miniature-art').all();
      expect(standing.length).toBeGreaterThanOrEqual(2);
      for (const figure of standing) {
        const hash = await shownPicture(figure);
        expect(curatedHashes(null, 'figure')).toContain(hash);
        expectServedAsContent(await pictures.get(hash));
      }
      expectServedAsContent(await pictures.get(backdrop));
      await expect(player.getByText('Изображения пока нет', { exact: true })).toHaveCount(0);
      return { figures: standing.length, fetched: pictures.size };
    },
  );
  await step(
    `checked: ${String(shown.figures)} standing figures and the backdrop, of ${String(shown.fetched)} pictures the player's page fetched`,
    () => Promise.resolve(),
  );

  await step('the player acts once: Elowen looks Mira over («Осмотреть»)', async () => {
    await mira.click();
    const details = player.getByRole('complementary', { name: 'Подробности', exact: true });
    await expect(details.getByRole('heading', { name: 'Что вы хотите сделать?' })).toBeVisible();
    await acted(player, () =>
      details.getByRole('button', { name: 'Осмотреть', exact: true }).click(),
    );
  });

  const signedOut = await step(
    'the DM revokes the player: «Вы вышли» through the live stream alone',
    async () => {
      await expect(seat).toContainText('Вход выполнен');
      // Quiet: the player's reads after acting are over; from now on only the live stream may
      // tell the player's screen anything.
      await player.waitForTimeout(3_000);
      let reads = 0;
      player.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/api/') && !path.endsWith('/live')) reads += 1;
      });
      const revoked = Date.now();
      await revoke(dm);
      await expect(accessState(player, ru.signedOut)).toContainText(
        'Чтобы вернуться за стол, откройте новую ссылку-приглашение.',
        { timeout: 10_000 },
      );
      const after = (Date.now() - revoked) / 1000;
      await expect(mira).toHaveCount(0);
      expect(reads, 'requests the player sent before the signed-out screen').toBe(0);
      return after;
    },
  );
  await step(
    `the player's screen said «Вы вышли» ${signedOut.toFixed(2)} s after the DM began the revocation (asked and confirmed), with no request of its own`,
    () => Promise.resolve(),
  );

  await step('the DM signs out, asked first', async () => {
    await dm.getByRole('button', { name: ru.signOut, exact: true }).click();
    const dialog = dm.getByRole('dialog', { name: ru.signOutQuestion });
    await dialog.getByRole('button', { name: ru.signOut, exact: true }).click();
    await expect(accessState(dm, ru.signedOut)).toBeVisible();
  });

  await step('no policy violation, no token out of place, no credential in any log', async () => {
    expect(dmViolations, 'policy violations on the DM pages').toEqual([]);
    expect(playerViolations, 'policy violations on the player pages').toEqual([]);
    const tokens = [tokenOf(dmLink), tokenOf(playerLink)];
    dmRequests.expectTokensOnlyInRedeems(tokens);
    playerRequests.expectTokensOnlyInRedeems(tokens);
    expect(
      holdsAny(await deploymentLogs(), [...tokens, ...sessions]),
      'a link token or session cookie in the logs of the proxy or the server',
    ).toBe(false);
  });
  await dmContext.close();
  await playerContext.close();
});

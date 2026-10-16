import { expect, test } from '@playwright/test';

import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  forgedToken,
  invite,
  joinAsDm,
  joinPath,
} from './support/sign-in.ts';

/**
 * Production sign-in in Russian (docs/adr/0031-play-language.md; docs/adr/0036-production-sign-in.md
 * §7): before a session the browser's language speaks; inside a campaign, the campaign's; and a
 * session that ended keeps the language of its campaign, even in an English browser. Tokens are
 * never printed: no trace or screenshot is kept.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const ru = WORDS.ru;
const ELOWEN = 'Эловен Старвиспер';

test('in Russian, the DM invites, an English browser joins, and is signed out in Russian', async ({
  browser,
}) => {
  const dmContext = await browser.newContext({ locale: 'ru-RU' });
  const dm = await dmContext.newPage();
  await dm.goto('/');
  await expect(accessState(dm, ru.none)).toContainText(
    'Откройте присланную вам ссылку-приглашение',
  );
  await joinAsDm(dm, SIGN_IN_CAMPAIGNS.russian, 0, ru);
  const link = await invite(dm, ELOWEN, ru);
  await expect(dm.locator('#sheet-players')).toContainText('Показывается один раз.');

  // The player's browser speaks English; the campaign it joins speaks Russian.
  const playerContext = await browser.newContext({ locale: 'en-US' });
  const player = await playerContext.newPage();
  await player.goto(link);
  await expect(player.getByRole('button', { name: 'Мира Вейл', exact: true })).toBeVisible();

  const members = dm.locator('#sheet-players').getByRole('region', { name: ru.members });
  const seat = members.getByRole('listitem').filter({ hasText: ELOWEN });
  await expect(seat).toContainText('Вход выполнен');
  await seat.getByRole('button', { name: ru.revoke(ELOWEN) }).click();
  await seat.getByRole('button', { name: ru.revokeYes }).click();
  await expect(dm.locator('#sheet-players')).toContainText(
    `${ELOWEN}: доступ игрока отозван, персонажа можно пригласить снова.`,
  );
  await expect(accessState(player, ru.signedOut)).toContainText(
    'Чтобы вернуться за стол, откройте новую ссылку-приглашение.',
    { timeout: 10_000 },
  );

  // The one failure, in a Russian browser.
  const forged = await browser.newPage({ locale: 'ru-RU' });
  await forged.goto(joinPath(forgedToken()));
  await expect(accessState(forged, ru.failed)).toContainText('Попросите новую.');

  // Signing out, asked in Russian.
  await dm.getByRole('button', { name: ru.signOut, exact: true }).click();
  const dialog = dm.getByRole('dialog', { name: ru.signOutQuestion });
  await expect(dialog).toContainText('понадобится новая ссылка-приглашение');
  await dialog.getByRole('button', { name: ru.signOut, exact: true }).click();
  await expect(accessState(dm, ru.signedOut)).toBeVisible();
  await dmContext.close();
  await playerContext.close();
});

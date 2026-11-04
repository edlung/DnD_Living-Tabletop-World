import { expect, test, type Page } from '@playwright/test';

import { dockButton } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  accessState,
  dmToken,
  joinPath,
  type Words,
} from './support/sign-in.ts';

/**
 * A campaign played on another server since a move (docs/adr/0061-local-mode.md §5, Stage 697a):
 * here it is looked at, not played. Its DM, seated before the move, opens it and reads where it
 * plays and since when; a change is refused with 409 `MOVED`; the account's campaigns say the same;
 * an invitation to it seats nobody here and says where to ask. The browser-test server sends its
 * two campaigns away (`MOVED_AWAY`, English and Russian) once their DM is seated.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const PASSWORD = 'a lantern in the rain';
const LIVE = { timeout: 15_000 };

async function joinWithNewLogin(page: Page, login: string, words: Words = WORDS.en): Promise<void> {
  const invited = accessState(page, words.invited);
  await invited
    .getByLabel(words === WORDS.en ? 'Your name at the table' : 'Ваше имя за столом', {
      exact: true,
    })
    .fill('Ada');
  await invited.getByLabel(words === WORDS.en ? 'Login' : 'Логин', { exact: true }).fill(login);
  await invited
    .getByLabel(words === WORDS.en ? 'Password' : 'Пароль', { exact: true })
    .fill(PASSWORD);
  await invited.getByRole('button', { name: words.takeSeat, exact: true }).click();
}

/** The campaign moves to the laptop: the DM, seated before, opens it again here. */
async function sendAway(page: Page, campaignId: string): Promise<void> {
  const answer = await page.request.post(`/api/testing/campaign-away/${campaignId}`, {
    headers: { Origin: SIGN_IN_ORIGIN },
    data: {},
  });
  expect(answer.ok()).toBe(true);
  await page.reload();
}

const changeTheTable = (page: Page, campaignId: string) =>
  page.evaluate(
    (path) =>
      fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"mode":"online"}',
      }).then(async (response) => [
        response.status,
        ((await response.json()) as { error: { code: string } }).error.code,
      ]),
    `/api/campaigns/${campaignId}/lobby?perspective=DM`,
  );

test('a campaign played elsewhere is looked at here, not played', async ({ page, browser }) => {
  const campaign = SIGN_IN_CAMPAIGNS.moved;
  await page.goto(joinPath(dmToken(campaign)));
  await joinWithNewLogin(page, 'ada-moved');
  await expect(dockButton(page, WORDS.en.players)).toBeVisible(LIVE);
  await sendAway(page, campaign);
  const notice = page.locator('.lobby-banner.is-away');
  await expect(notice).toContainText('This campaign is played on MacBook Pro since', LIVE);
  await expect(notice).toContainText('here you can look, not play.');
  expect(await changeTheTable(page, campaign)).toEqual([409, 'MOVED']);

  await page.getByRole('button', { name: 'My campaigns', exact: true }).click();
  const entry = page.locator('.hub-campaign').filter({ hasText: 'You are the DM' });
  await expect(entry.locator('.hub-campaign-away')).toContainText('Played on MacBook Pro since');

  // An invitation to it, opened in another browser, seats nobody here and says where to ask.
  const invited = await (await browser.newContext()).newPage();
  await invited.goto(joinPath(dmToken(campaign, 1)));
  await joinWithNewLogin(invited, 'bryn-moved');
  await expect(
    invited.getByRole('heading', { name: 'This campaign is played elsewhere now' }),
  ).toBeVisible(LIVE);
  await expect(invited.getByText('Ask your DM where it is played now')).toBeVisible();
  await invited.context().close();
});

test('the same in Russian', async ({ browser }) => {
  const page = await (await browser.newContext({ locale: 'ru-RU' })).newPage();
  const campaign = SIGN_IN_CAMPAIGNS.movedRu;
  await page.goto(joinPath(dmToken(campaign)));
  await joinWithNewLogin(page, 'ada-moved-ru', WORDS.ru);
  await expect(dockButton(page, WORDS.ru.players)).toBeVisible(LIVE);
  await sendAway(page, campaign);
  await expect(page.locator('.lobby-banner.is-away')).toContainText(
    'Эта кампания идёт на MacBook Pro с',
    LIVE,
  );
  expect(await changeTheTable(page, campaign)).toEqual([409, 'MOVED']);

  const invited = await (await browser.newContext({ locale: 'ru-RU' })).newPage();
  await invited.goto(joinPath(dmToken(campaign, 1)));
  await joinWithNewLogin(invited, 'bryn-moved-ru', WORDS.ru);
  await expect(
    invited.getByRole('heading', { name: 'Эта кампания теперь идёт в другом месте' }),
  ).toBeVisible(LIVE);
  await invited.context().close();
});

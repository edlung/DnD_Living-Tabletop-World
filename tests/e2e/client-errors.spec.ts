import { expect, test, type Page, type Request } from '@playwright/test';

import boundary from '../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * Client error reports (docs/adr/0073-table-ideas.md §1, Stage 800): a player's screen breaks
 * while drawing; the player reads a plain screen and loads the game again; the DM, and nobody
 * else, finds a card that says whose screen, which browser, where and what — and the report that
 * went to the server is fixed fields with nothing of the story in it. Chromium on a laptop and
 * WebKit on an iPad, each on a campaign of its own; the table's display is in
 * `client-errors-screens.spec.ts`.
 */
const campaignOf = () =>
  test.info().project.name === 'ipad'
    ? UI_PARTY_CAMPAIGNS.troublesIpad
    : UI_PARTY_CAMPAIGNS.troubles;

const WAIT = { timeout: 15_000 };
const FIELDS = [
  'browser',
  'browserVersion',
  'campaignId',
  'kind',
  'name',
  'page',
  'part',
  'place',
  'shell',
  'system',
];

/** The chat's next read comes back with a message no screen can draw. */
async function breakChat(page: Page): Promise<void> {
  await page.route('**/api/campaigns/*/chat?*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    return route.fulfill({ response, json: { ...body, messages: [{ broken: true }] } });
  });
}

const reportOf = (request: Request) => request.postDataJSON() as Record<string, unknown>;

test('a player’s screen breaks: they load the game again, and the DM alone reads what broke', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await expect(dm.locator('nav.dock')).toBeVisible(WAIT);
  await expect(dm.locator('.trouble-notice')).toHaveCount(0);

  // The player opens Chat; then the chat comes back broken.
  await openSheet(player, 'Chat');
  const sent = player.waitForRequest(
    (request) => request.url().endsWith('/api/client-errors') && request.method() === 'POST',
    WAIT,
  );
  await breakChat(player);
  await openSheet(dm, 'Chat');
  await dm
    .locator('#sheet-chat')
    .getByLabel('Message', { exact: true })
    .fill('Roll for initiative');
  await dm.locator('#sheet-chat').getByRole('button', { name: 'Send', exact: true }).click();

  // A plain screen in place of a blank one, with the one thing that helps.
  await expect(player.getByRole('alert')).toContainText(
    'Something went wrong on this screen. The game itself is safe.',
    WAIT,
  );
  const again = player.getByRole('button', { name: 'Load the game again', exact: true });
  await expect(again).toBeFocused();
  await expect(
    player.getByText('If that does not help, tell your DM.', { exact: true }),
  ).toBeVisible();
  // A note left for the server, so the screen says what it held.
  await expect(player.getByText('Never your name or your words.', { exact: false })).toBeVisible();
  await expectAccessible(player, 'the screen a player reads when the game broke');

  // What went to the server: fixed fields, and nothing of the story or of who sent it.
  const request = await sent;
  const report = reportOf(request);
  expect(Object.keys(report).sort()).toEqual(FIELDS);
  expect(report).toMatchObject({
    kind: 'render',
    page: 'game',
    part: 'chat',
    shell: 'none',
    campaignId: campaign,
  });
  const text = request.postData() ?? '';
  for (const marker of [
    ...Object.values(boundary.forbiddenMarkers).flat(),
    'Roll for initiative',
    'Elowen',
    'elowen',
    TOKENS.player,
    'http',
    'broken',
  ]) {
    expect(text, marker).not.toContain(marker);
  }
  for (const frame of report['place'] as { file: string }[]) {
    expect(frame.file).toMatch(/^[A-Za-z0-9._-]+\.(js|mjs|ts|tsx)$/);
  }

  // The DM's screen says so, among the table's questions; the list is one press away, on the
  // Session sheet.
  const notice = dm.locator('.trouble-notice');
  await expect(notice).toContainText('Something went wrong on a screen at this table.', WAIT);
  await expectAccessible(dm, 'the DM’s screen with the notice of a screen that broke');
  await notice.getByRole('button', { name: 'What broke', exact: true }).click();
  await expect(notice).toHaveCount(0);
  const list = dm.locator('#sheet-session').getByRole('region', { name: 'Screens with an error' });
  await expect(list).toContainText('Loading the page again there usually helps.');
  const entry = list.locator('.trouble-list li');
  await expect(entry).toHaveCount(1);
  await expect(entry.locator('strong')).toHaveText('A player’s screen');
  await expect(entry).toContainText('Where: Chat');
  await expect(entry).toContainText('The screen could not be shown');
  await expect(entry).toContainText('Times: 1');
  // The line for whoever looks after the server is put away until asked for.
  await expect(entry.locator('code')).toBeHidden();
  await entry.getByText('For whoever looks after the server', { exact: true }).click();
  await expect(entry.locator('code')).toContainText(String(report['name']));
  await expectAccessible(dm, 'the Session sheet with the list of what broke');

  // Loading again brings the player back to the door; the game goes on behind it.
  await player.unroute('**/api/campaigns/*/chat?*');
  await again.click();
  await enterWorld(player, TOKENS.player, campaign);
  await expect(player.locator('nav.dock')).toBeVisible(WAIT);
  // A player has no such notice, broken screen or not.
  await expect(player.locator('.trouble-notice')).toHaveCount(0);

  // Looked at, the notice stays away through a reload; the list stays until the DM clears it.
  await dm.reload();
  await enterWorld(dm, TOKENS.dm, campaign);
  await openSheet(dm, 'Session');
  await expect(list.locator('.trouble-list li')).toHaveCount(1, WAIT);
  await expect(dm.locator('.trouble-notice')).toHaveCount(0);
  await list.getByRole('button', { name: 'Clear the list', exact: true }).click();
  const said = dm.locator('#sheet-session').getByText('The list is cleared.', { exact: true });
  await expect(said).toBeVisible(WAIT);
  await expect(said).toBeFocused();
  await expect(list).toHaveCount(0);
});

test('по-русски: экран с ошибкой и карточка мастера', async ({ browser }) => {
  test.skip(test.info().project.name !== 'chromium', 'The words are the same on every engine.');
  test.setTimeout(150_000);
  const campaign = UI_PARTY_CAMPAIGNS.troublesRu;
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await expect(dm.locator('nav.dock')).toBeVisible(WAIT);
  await openSheet(player, 'Чат');
  await breakChat(player);
  await openSheet(dm, 'Чат');
  await dm.locator('#sheet-chat').getByLabel('Сообщение', { exact: true }).fill('Бросайте');
  await dm.locator('#sheet-chat').getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(player.getByRole('alert')).toContainText(
    'На этом экране что-то пошло не так. С самой игрой всё в порядке.',
    WAIT,
  );
  await expect(
    player.getByRole('button', { name: 'Загрузить игру заново', exact: true }),
  ).toBeVisible();
  await expect(
    player.getByText('Если не поможет, скажите мастеру.', { exact: true }),
  ).toBeVisible();
  const notice = dm.locator('.trouble-notice');
  await expect(notice).toContainText('На одном из экранов за столом случилась ошибка.', WAIT);
  // «Не сейчас» убирает строку, список остаётся на листе «Сессия».
  await notice.getByRole('button', { name: 'Не сейчас', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await openSheet(dm, 'Сессия');
  const list = dm.locator('#sheet-session').getByRole('region', { name: 'Экраны с ошибкой' });
  const entry = list.locator('.trouble-list li');
  await expect(entry.locator('strong')).toHaveText('Экран игрока', WAIT);
  await expect(entry).toContainText('Где: Чат');
  await expect(entry).toContainText('Экран не удалось показать');
  await expectAccessible(dm, 'лист «Сессия» со списком ошибок');
});

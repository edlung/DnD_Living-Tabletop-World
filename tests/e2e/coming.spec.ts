import { expect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * "I'll come / I can't" (docs/adr/0073-table-ideas.md §10, Stage 890): under the next game's
 * date a waiting player answers for their own hero with one press; the DM reads who comes on the
 * Session sheet and answers for someone who said it aloud; a changed date asks everyone again.
 * Chromium on a laptop and WebKit on an iPad, each on a campaign of its own.
 */
const campaignOf = () =>
  test.info().project.name === 'ipad' ? UI_PARTY_CAMPAIGNS.comingIpad : UI_PARTY_CAMPAIGNS.coming;
const WAIT = { timeout: 15_000 };
const session = (page: Page) => page.locator('#sheet-session');

/** A day `days` ahead at 18:00, as a date field holds it. */
function evening(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T18:00`;
}

/** The DM ends the session without a chapter: the players' lobby is what this journey reads. */
async function endSession(
  sheet: ReturnType<typeof session>,
  words = {
    end: 'End the session',
    chapter: 'Write a chapter about this session',
    yes: 'Yes, end the session',
    start: 'Start the session',
  },
) {
  await sheet.getByRole('button', { name: words.end, exact: true }).click();
  await sheet.getByRole('checkbox', { name: words.chapter, exact: true }).uncheck();
  await sheet.getByRole('button', { name: words.yes, exact: true }).click();
  await expect(sheet.getByRole('button', { name: words.start, exact: true })).toBeVisible(WAIT);
}

test('a player says “I’ll come”; the DM reads it and answers for another; a new date asks again', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await openSheet(dm, 'Session');
  const sheet = session(dm);
  await endSession(sheet);

  // Without a date nobody is asked anything.
  const tool = sheet.getByRole('region', { name: 'The next game' });
  await expect(tool.getByRole('group', { name: 'Who comes' })).toHaveCount(0);
  await expect(player.locator('.coming--lobby')).toHaveCount(0);

  await tool.getByLabel('Day and time', { exact: true }).fill(evening(6));
  await tool.getByRole('button', { name: 'Set the date', exact: true }).click();
  await expect(player.locator('.next-game--lobby')).toContainText('in 6 days', WAIT);

  // The player is asked under the date, and answers with one press.
  const mine = player.getByRole('region', { name: 'Who comes to the next game' });
  const ask = mine.getByRole('group', { name: 'Will you come?' });
  const yes = ask.getByRole('button', { name: 'I’ll come', exact: true });
  const no = ask.getByRole('button', { name: 'I can’t', exact: true });
  await expect(yes).toHaveAttribute('aria-pressed', 'false');
  await expect(mine).toContainText(/No answer yet: .*Elowen Starwhisper/);
  await expectAccessible(player, 'the question under the next game’s date');
  await yes.click();
  await expect(yes).toHaveAttribute('aria-pressed', 'true', WAIT);
  await expect(mine).toContainText(/Coming: Elowen Starwhisper/);
  for (const button of [yes, no]) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0, 'a button a thumb can press').toBeGreaterThanOrEqual(44);
  }
  await expectAccessible(player, 'the answer given');

  // The DM reads it on the Session sheet, without asking anyone.
  const who = tool.getByRole('group', { name: 'Who comes' });
  const elowen = who.getByRole('listitem').filter({ hasText: 'Elowen Starwhisper' });
  await expect(elowen).toContainText('comes', WAIT);
  await expect(
    elowen.getByRole('button', { name: 'Elowen Starwhisper comes', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  // And answers for someone who said it aloud: the player's screen reads that too.
  const brann = who.getByRole('listitem').filter({ hasText: 'Brann Ironvale' });
  await expect(brann).toContainText('no answer yet');
  await brann.getByRole('button', { name: 'Brann Ironvale can’t come', exact: true }).click();
  await expect(brann).toContainText('can’t come', WAIT);
  await expect(mine).toContainText(/Can’t come: Brann Ironvale/, WAIT);
  await expectAccessible(dm, 'who comes, on the Session sheet');

  // The player changes their mind, and takes the answer back with a second press.
  await no.click();
  await expect(no).toHaveAttribute('aria-pressed', 'true', WAIT);
  await expect(elowen).toContainText('can’t come', WAIT);
  await no.click();
  await expect(no).toHaveAttribute('aria-pressed', 'false', WAIT);
  await expect(elowen).toContainText('no answer yet', WAIT);
  await yes.click();
  await expect(elowen).toContainText('comes', WAIT);

  // A new date asks everyone again.
  await tool.getByLabel('Day and time', { exact: true }).fill(evening(7));
  await tool.getByRole('button', { name: 'Change the date', exact: true }).click();
  await expect(player.locator('.next-game--lobby')).toContainText('in 7 days', WAIT);
  await expect(yes).toHaveAttribute('aria-pressed', 'false', WAIT);
  await expect(mine).not.toContainText('Coming:');
  await expect(elowen).toContainText('no answer yet');
  await expect(brann).toContainText('no answer yet');

  // The date taken away takes the question with it.
  await tool.getByRole('button', { name: 'Remove the date', exact: true }).click();
  await expect(player.locator('.coming--lobby')).toHaveCount(0, WAIT);
  await expect(tool.getByRole('group', { name: 'Who comes' })).toHaveCount(0);
});

test('по-русски: игрок отвечает «Приду», мастер это читает', async ({ browser }) => {
  test.skip(test.info().project.name === 'ipad', 'the Russian words are read once, in Chromium');
  test.setTimeout(150_000);
  const campaign = UI_PARTY_CAMPAIGNS.comingRu;
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await openSheet(dm, 'Сессия');
  const sheet = session(dm);
  await endSession(sheet, {
    end: 'Завершить сессию',
    chapter: 'Написать главу об этой сессии',
    yes: 'Да, завершить сессию',
    start: 'Начать сессию',
  });
  const tool = sheet.getByRole('region', { name: 'Следующая игра' });
  await tool.getByLabel('День и время', { exact: true }).fill(evening(3));
  await tool.getByRole('button', { name: 'Назначить дату', exact: true }).click();
  const mine = player.getByRole('region', { name: 'Кто придёт на следующую игру' });
  const ask = mine.getByRole('group', { name: 'Вы придёте?' });
  await ask.getByRole('button', { name: 'Приду', exact: true }).click();
  await expect(mine).toContainText(/Придут: /, WAIT);
  await expect(ask.getByRole('button', { name: 'Не смогу', exact: true })).toBeVisible();
  await expectAccessible(player, 'вопрос под датой следующей игры');
  const who = tool.getByRole('group', { name: 'Кто придёт' });
  await expect(who.getByRole('listitem').filter({ hasText: 'придёт' }).first()).toBeVisible(WAIT);
  await expect(who).toContainText('пока нет ответа');
  await expectAccessible(dm, 'кто придёт, на листе сессии');
});

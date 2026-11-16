import { randomUUID } from 'node:crypto';

import { expect as baseExpect, test, type Page } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { dmRequest } from './support/authoring.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openSheet } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * Sealed envelopes (docs/adr/0073-table-ideas.md §9, Stage 880): the DM keeps a letter, seals it
 * with words for its outside, and the party sees the envelope in the Journal — never what is
 * inside, on the page or in what the page was sent — until the DM opens it, when it arrives as a
 * handout does. One sealed "for this evening's chapter" opens by itself when the DM ends the
 * session and its chapter is written. Chromium on a laptop and WebKit on an iPad, each on a
 * campaign of its own.
 */
const expect = baseExpect.configure({ timeout: 15_000 });
const campaignOf = () =>
  test.info().project.name === 'ipad'
    ? UI_PARTY_CAMPAIGNS.envelopesIpad
    : UI_PARTY_CAMPAIGNS.envelopes;
const WAIT = { timeout: 20_000 };
/** Names of this run's own: a retry finds the first run's envelopes beside its own. */
const RUN = randomUUID().slice(0, 4);
const LETTER = `A letter from the miller ${RUN}`;
const INSIDE = 'The cart was never robbed.';
const OUTSIDE = `Open after the battle ${RUN}`;
const LATER = `For the end of the evening ${RUN}`;

/** Everything a page is sent, from now on. */
function collectBodies(page: Page): () => Promise<string> {
  const bodies: Promise<string>[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/campaigns/') && !response.url().includes('/live')) {
      bodies.push(response.text().catch(() => ''));
    }
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

async function keepLetter(dm: Page, title: string, text: string) {
  const sheet = dm.locator('#sheet-party');
  const give = sheet.getByRole('region', { name: 'Give a handout' });
  await give.getByLabel('Title', { exact: true }).fill(title);
  await give.getByLabel('Text (optional)', { exact: true }).fill(text);
  await give.getByRole('button', { name: 'Keep for later' }).click();
  await expect(give).toContainText('Kept for later: it waits below.');
  return sheet
    .getByRole('region', { name: 'Kept for later' })
    .getByRole('listitem')
    .filter({ hasText: title });
}

test('the DM seals a letter; the party sees the envelope and reads it when it opens', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  const sent = collectBodies(player);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  await expect(player.getByRole('region', { name: 'Scene', exact: true })).toBeVisible();

  await openSheet(dm, 'Party');
  const sheet = dm.locator('#sheet-party');
  const letter = await keepLetter(dm, LETTER, INSIDE);

  // Sealing asks for the words on the outside.
  await letter.getByRole('button', { name: `Seal in an envelope: ${LETTER}` }).click();
  const form = letter.getByRole('form', { name: `Seal in an envelope: ${LETTER}` });
  await form.getByRole('button', { name: 'Seal it', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('Write what the outside says.');
  const outside = form.getByLabel('What the outside says', { exact: true });
  await expect(outside).toHaveAttribute('aria-invalid', 'true');
  await outside.fill(OUTSIDE);
  await expectAccessible(dm, 'sealing an envelope');
  await form.getByRole('button', { name: 'Seal it', exact: true }).click();
  await expect(letter).toContainText('Sealed: the party sees the envelope, not what is inside.');

  // The DM's list has it, with what is inside and what opens it.
  const envelopes = sheet.getByRole('region', { name: 'Envelopes', exact: true });
  const mine = envelopes.getByRole('listitem').filter({ hasText: OUTSIDE });
  await expect(mine).toContainText(`Inside: ${LETTER}`);
  await expect(mine).toContainText('Opens when you say');
  await expectAccessible(dm, 'the DM’s envelopes');

  // The party sees it from outside, in the Journal: no handout came, and nothing of the inside.
  await expect(player.locator('.asked-check', { hasText: LETTER })).toHaveCount(0);
  await openSheet(player, 'Journal');
  const journal = player.locator('#sheet-journal');
  const sealed = journal.getByRole('region', { name: 'Sealed envelopes', exact: true });
  const theirs = sealed.getByRole('listitem').filter({ hasText: OUTSIDE });
  await expect(theirs).toContainText('Sealed. It opens when the DM says.', WAIT);
  await expect(journal).not.toContainText(LETTER);
  await expectAccessible(player, 'a sealed envelope in the Journal');
  const before = await sent();
  expect(before).toContain(OUTSIDE);
  expect(before).not.toContain(LETTER);
  expect(before).not.toContain(INSIDE);

  // The DM opens it: it leaves the sealed ones and arrives as a handout.
  await mine.getByRole('button', { name: `Open now: ${OUTSIDE}` }).click();
  await expect(mine).toContainText('Opened');
  await expect(mine.getByRole('button', { name: `Open now: ${OUTSIDE}` })).toHaveCount(0);
  await expect(theirs).toHaveCount(0, WAIT);
  const opened = journal.getByRole('article', { name: LETTER });
  await expect(opened).toContainText(INSIDE, WAIT);
  await expect(opened).toContainText('For the party');

  // An opened envelope is deleted from the DM's list; the handout stays with the party.
  await mine.getByRole('button', { name: `Delete the envelope: ${OUTSIDE}` }).click();
  await expect(mine).toHaveCount(0);
  await expect(opened).toBeVisible();
});

test('an envelope sealed for the evening’s chapter opens when the evening is closed', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const campaign = campaignOf();
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  // Something for the evening's chapter to tell: a day passes during the session.
  const day = await dmRequest(dm, campaign, 'post', 'commands', {
    commandId: `${campaign}.next-day-${RUN}`,
    command: { type: 'AdvanceWorldTime', by: 86_400 },
  });
  expect(day.body).toMatchObject({ status: 'accepted' });

  await openSheet(dm, 'Party');
  const title = `What the chapter leaves out ${RUN}`;
  const letter = await keepLetter(dm, title, 'The miller watched you leave.');
  await letter.getByRole('button', { name: `Seal in an envelope: ${title}` }).click();
  const form = letter.getByRole('form', { name: `Seal in an envelope: ${title}` });
  await form.getByLabel('What the outside says', { exact: true }).fill(LATER);
  await form
    .getByLabel('It opens', { exact: true })
    .selectOption({ label: 'By itself, when this evening’s chapter is written' });
  await form.getByRole('button', { name: 'Seal it', exact: true }).click();
  const mine = dm
    .locator('#sheet-party')
    .getByRole('region', { name: 'Envelopes', exact: true })
    .getByRole('listitem')
    .filter({ hasText: LATER });
  await expect(mine).toContainText(
    'Opens when the chapter of “Session 1: Arrival in Ravenford” is written',
  );

  await openSheet(player, 'Journal');
  const journal = player.locator('#sheet-journal');
  const theirs = journal
    .getByRole('region', { name: 'Sealed envelopes', exact: true })
    .getByRole('listitem')
    .filter({ hasText: LATER });
  await expect(theirs).toContainText('Sealed. It opens when the evening’s chapter is written.', WAIT);

  // The DM ends the session with its chapter: the envelope opens by itself.
  await openSheet(dm, 'Session');
  const session = dm.locator('#sheet-session');
  await session.getByRole('button', { name: 'End the session', exact: true }).click();
  await expect(
    session.getByRole('checkbox', { name: 'Write a chapter about this session', exact: true }),
  ).toBeChecked(WAIT);
  await session.getByRole('button', { name: 'Yes, end the session', exact: true }).click();
  await expect(session.locator('.session-ended')).toContainText('The session is over.', WAIT);
  await expect(session.locator('.session-ended')).toContainText(/Chapter written/);

  // Whatever the player's screen shows between evenings, the handout is theirs to read.
  await expect
    .poll(
      async () =>
        (
          await dmRequest(dm, campaign, 'get', 'dm/envelopes')
        ).body,
      WAIT,
    )
    .toMatchObject({
      envelopes: expect.arrayContaining([
        expect.objectContaining({ label: LATER, openedBy: 'chapter' }),
      ]) as unknown,
    });
  await openSheet(dm, 'Party');
  await expect(mine).toContainText('Opened');
  await openSheet(dm, 'Journal');
  await expect(dm.locator('#sheet-journal')).toContainText(title, WAIT);
});

test('по-русски: мастер запечатывает письмо, отряд видит конверт', async ({ browser }) => {
  test.skip(test.info().project.name === 'ipad', 'the Russian words are read once, in Chromium');
  test.setTimeout(120_000);
  const campaign = UI_PARTY_CAMPAIGNS.envelopesRu;
  const dm = await freshPage(browser);
  const player = await freshPage(browser);
  await enterWorld(dm, TOKENS.dm, campaign);
  await enterWorld(player, TOKENS.player, campaign);
  const label = `Открыть после боя ${RUN}`;
  const title = `Письмо мельника ${RUN}`;
  await openSheet(dm, 'Отряд');
  const sheet = dm.locator('#sheet-party');
  const give = sheet.getByRole('region', { name: 'Дать материал' });
  await give.getByLabel('Название', { exact: true }).fill(title);
  await give.getByRole('button', { name: 'Отложить' }).click();
  const letter = sheet
    .getByRole('region', { name: 'Заготовки' })
    .getByRole('listitem')
    .filter({ hasText: title });
  await letter.getByRole('button', { name: `Запечатать в конверт: ${title}` }).click();
  const form = letter.getByRole('form', { name: `Запечатать в конверт: ${title}` });
  await form.getByLabel('Что написано снаружи', { exact: true }).fill(label);
  await expect(form.getByLabel('Когда откроется', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Запечатать', exact: true }).click();
  const mine = sheet
    .getByRole('region', { name: 'Конверты', exact: true })
    .getByRole('listitem')
    .filter({ hasText: label });
  await expect(mine).toContainText(`Внутри: ${title}`);
  await expect(mine).toContainText('Откроется, когда вы скажете');
  await expectAccessible(dm, 'конверты мастера');
  await openSheet(player, 'Журнал');
  const sealed = player
    .locator('#sheet-journal')
    .getByRole('region', { name: 'Запечатанные конверты', exact: true });
  await expect(sealed.getByRole('listitem').filter({ hasText: label })).toContainText(
    'Запечатан. Откроется, когда скажет мастер.',
    WAIT,
  );
  await expectAccessible(player, 'запечатанный конверт в журнале');
});

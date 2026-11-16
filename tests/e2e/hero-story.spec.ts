import { expect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { isLiveStream } from './support/session.ts';
import { closeCharacter, openCharacter, openSheet } from './support/shell.ts';
import {
  SIGN_IN_CAMPAIGNS,
  SIGN_IN_ORIGIN,
  WORDS,
  invite,
  joinAsDm,
  openInvitation,
} from './support/sign-in.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * A hero's backstory and a player's private notes (docs/adr/0073-table-ideas.md §5, Stage 840),
 * on the invitation-mode servers, where a table has two players: a player writes her hero's
 * backstory and a private note on the Story tab of her sheet; the DM reads the backstory — and
 * may write it — and is never sent the note; the other player is sent neither. Chromium on a
 * laptop and WebKit on an iPad, each on a campaign of its own. No trace or screenshot is kept:
 * the pages show links.
 */
test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off' });

const LIVE = { timeout: 20_000 };
const ELOWEN = 'Elowen Starwhisper';
const STORY = 'Elowen left the Silverwood to find her brother.';
const NOTE_TITLE = 'About the miller';
const NOTE = 'I do not trust the miller: he lied about the cart.';

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

test('a backstory is its player’s and the DM’s; a private note is its player’s alone', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ipad = test.info().project.name === 'ipad';
  const campaign = ipad ? SIGN_IN_CAMPAIGNS.storyIpad : SIGN_IN_CAMPAIGNS.story;
  const words = WORDS.en;

  const dm = await freshPage(browser);
  const dmReceived = collectBodies(dm);
  await joinAsDm(dm, campaign);
  const elowen = await freshPage(browser);
  const first = await invite(dm, ELOWEN);
  await openInvitation(elowen, first);
  const brann = await freshPage(browser);
  const brannReceived = collectBodies(brann);
  const players = dm.locator('#sheet-players');
  await players
    .getByLabel(words.character, { exact: true })
    .selectOption({ label: 'Brann Ironvale' });
  await players.getByRole('button', { name: words.create, exact: true }).click();
  const field = players.getByLabel(words.link, { exact: true });
  await expect(field).not.toHaveValue(first, LIVE);
  await openInvitation(brann, await field.inputValue());
  await expect(elowen.locator('nav.dock')).toBeVisible(LIVE);
  await expect(brann.locator('nav.dock')).toBeVisible(LIVE);
  await dm.keyboard.press('Escape');

  // Elowen's player opens the Story tab of her sheet: each part says first who reads it.
  const story = await openCharacter(elowen, 'Story');
  const backstory = story.getByRole('region', { name: 'Backstory' });
  await expect(backstory).toContainText(
    'You and your DM read this. Nobody else at the table does.',
  );
  const notes = story.getByRole('region', { name: 'My notes' });
  await expect(notes).toContainText('Only you read these: not the DM, not the other players.');
  await expectAccessible(elowen, 'the Story tab, empty');

  // She writes where her hero comes from.
  const text = backstory.getByLabel(/^Where does Elowen Starwhisper come from/);
  await text.fill(STORY);
  await backstory.getByRole('button', { name: 'Save the backstory', exact: true }).click();
  await expect(backstory.getByRole('status')).toHaveText('Saved.', LIVE);

  // And a note of her own.
  await notes.getByRole('button', { name: 'Write a note', exact: true }).click();
  const form = notes.getByRole('form', { name: 'A new note' });
  await form.getByLabel('What it is about (optional)', { exact: true }).fill(NOTE_TITLE);
  await form.getByLabel('The note', { exact: true }).fill(NOTE);
  await form.getByRole('button', { name: 'Save the note', exact: true }).click();
  await expect(notes.getByRole('status')).toHaveText('The note is saved.', LIVE);
  await expect(notes.locator('.story-notes li')).toHaveCount(1);
  await expect(notes.locator('.story-notes li')).toContainText(NOTE);
  await expectAccessible(elowen, 'the Story tab with a backstory and a note');

  // Both are kept: a reload brings them back.
  await elowen.reload();
  await expect(elowen.locator('nav.dock')).toBeVisible(LIVE);
  const again = await openCharacter(elowen, 'Story');
  await expect(again.getByLabel(/^Where does Elowen Starwhisper come from/)).toHaveValue(
    STORY,
    LIVE,
  );
  await expect(again.locator('.story-notes li')).toContainText(NOTE_TITLE, LIVE);

  // The DM opens her sheet: the backstory, said to be the two of theirs — and no notes at all.
  await openSheet(dm, 'Party');
  await dm
    .locator('#sheet-party')
    .getByRole('button', { name: `Open the sheet of ${ELOWEN}`, exact: true })
    .click();
  const dmStory = await openCharacter(dm, 'Story');
  const dmBackstory = dmStory.getByRole('region', { name: 'Backstory' });
  await expect(dmBackstory).toContainText(
    'You and this hero’s player read this. Nobody else at the table does.',
  );
  await expect(dmBackstory.getByLabel(/^Where does Elowen Starwhisper come from/)).toHaveValue(
    STORY,
    LIVE,
  );
  await expect(dmStory.getByRole('region', { name: 'My notes' })).toHaveCount(0);
  await expectAccessible(dm, 'the Story tab as the DM reads it');
  // The DM adds a line for the child who told it aloud; the player reads it.
  await dmBackstory
    .getByLabel(/^Where does Elowen Starwhisper come from/)
    .fill(`${STORY} She still carries his knife.`);
  await dmBackstory.getByRole('button', { name: 'Save the backstory', exact: true }).click();
  await expect(dmBackstory.getByRole('status')).toHaveText('Saved.', LIVE);
  await closeCharacter(dm);
  await closeCharacter(elowen);
  const told = await openCharacter(elowen, 'Story');
  await expect(told.getByRole('region', { name: 'Backstory' })).toContainText(
    'The DM wrote this down. You may change it.',
    LIVE,
  );

  // Brann's player has his own tab, empty; nothing of hers is on it.
  const his = await openCharacter(brann, 'Story');
  await expect(his.getByLabel(/^Where does Brann Ironvale come from/)).toHaveValue('', LIVE);
  await expect(his.locator('.story-notes li')).toHaveCount(0);
  await expect(his).not.toContainText('Silverwood');

  // What the others were sent: the DM the backstory and never the note; Brann's player neither.
  const toDm = await dmReceived();
  expect(toDm).toContain('Silverwood');
  expect(toDm, 'the DM was sent a private note').not.toContain('miller');
  const toBrann = await brannReceived();
  expect(toBrann, 'another player was sent a backstory').not.toContain('Silverwood');
  expect(toBrann, 'another player was sent a private note').not.toContain('miller');

  // She deletes her note, for good, after being asked.
  const mine = told.getByRole('region', { name: 'My notes' });
  await mine.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(mine.getByText('Delete this note for good?', { exact: true })).toBeVisible();
  await mine.getByRole('button', { name: 'Yes, delete it', exact: true }).click();
  await expect(mine.getByRole('status')).toHaveText('The note is deleted.', LIVE);
  await expect(mine.locator('.story-notes li')).toHaveCount(0);
});

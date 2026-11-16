import { expect, test } from '@playwright/test';

import { UI_PARTY_CAMPAIGNS } from '../../apps/server/src/testing/ui-party-campaigns.ts';
import { expectAccessible } from './support/axe.ts';
import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The Story tab in Russian (docs/adr/0073-table-ideas.md §5, Stage 840): who reads the backstory,
 * who reads the notes, a note written. The table of two players and the DM is
 * `hero-story.spec.ts`'s.
 */
const WAIT = { timeout: 15_000 };

test('по-русски: предыстория и личные заметки', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await freshPage(browser);
  await enterWorld(page, TOKENS.player, UI_PARTY_CAMPAIGNS.storyRu);
  const story = await openCharacter(page, 'История', 'Персонаж');
  const backstory = story.getByRole('region', { name: 'История героя' });
  await expect(backstory).toContainText('Это читаете вы и мастер, и каждый из вас может изменить текст.', WAIT);
  const notes = story.getByRole('region', { name: 'Мои заметки' });
  await expect(notes).toContainText('Их читаете только вы. Мастер и другие игроки их не видят.');
  await notes.getByRole('button', { name: 'Написать заметку', exact: true }).click();
  const form = notes.getByRole('form', { name: 'Новая заметка' });
  await form.getByLabel('Заметка', { exact: true }).fill('Мельник что-то скрывает.');
  await form.getByRole('button', { name: 'Сохранить заметку', exact: true }).click();
  await expect(notes.getByRole('status')).toHaveText('Заметка сохранена.', WAIT);
  await expect(notes.locator('.story-notes li')).toContainText('Заметка без названия');
  await expectAccessible(page, 'вкладка «История» с заметкой');
});

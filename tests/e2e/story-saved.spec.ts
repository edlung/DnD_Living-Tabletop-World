import { expect, test } from '@playwright/test';

import { closePages, freshPage } from './support/pages.ts';
import { enterWorld, TOKENS } from './support/session.ts';
import { openCharacter } from './support/shell.ts';

// Every page of the journey closes with it (`support/pages.ts` says why).
test.afterEach(closePages);

/**
 * The character dialog asks before it closes on unsaved words (docs/adr/0073-table-ideas.md §5),
 * and never on words already kept: from the moment "Saved." shows, Escape closes it. The Story tab
 * once told the dialog only after the browser had painted, and an Escape in between was asked
 * "Close anyway?" (WebKit, `hero-story.spec.ts`). The moment is caught as the page changes, before
 * anything else may run.
 */
test('the moment “Saved.” shows, the sheet closes without asking', async ({ browser }) => {
  const page = await freshPage(browser);
  await enterWorld(page, TOKENS.player);
  const story = await openCharacter(page, 'Story');
  const backstory = story.getByRole('region', { name: 'Backstory' });
  await backstory
    .getByLabel(/^Where does Elowen Starwhisper come from/)
    .fill(`Elowen keeps a map of the Silverwood (${test.info().project.name}, ${Date.now()}).`);
  // Escape asks the dialog to close (its `cancel`): refused means it would ask instead.
  const closing = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const status = document.querySelector('.hero-dialog .story-status');
        const dialog = document.querySelector('dialog.hero-dialog');
        if (!status || !dialog) {
          resolve('no sheet');
          return;
        }
        const watch = new MutationObserver(() => {
          if (status.textContent === '') return;
          watch.disconnect();
          const cancel = new Event('cancel', { cancelable: true });
          dialog.dispatchEvent(cancel);
          resolve(cancel.defaultPrevented ? 'asked' : 'closes');
        });
        watch.observe(status, { childList: true, subtree: true, characterData: true });
      }),
  );
  await backstory.getByRole('button', { name: 'Save the backstory', exact: true }).click();
  await expect(backstory.getByRole('status')).toHaveText('Saved.');
  expect(await closing).toBe('closes');
});

import { expect, test } from '@playwright/test';

import {
  enterWorld,
  expectPlayerBoundary,
  HIDDEN_CHARACTER,
  holdResponse,
  TOKENS,
} from './support/session.ts';
import { sceneRegion } from './support/shell.ts';

for (const transition of ['delayed', 'failed'] as const) {
  test(`hidden character choices disappear during ${transition} public preview and return only in DM`, async ({
    page,
  }) => {
    await enterWorld(page, TOKENS.dm);
    const choices = page.getByLabel('Perspective', { exact: true });
    const secretOption = choices.locator(`option[value="CHARACTER:${HIDDEN_CHARACTER.entityId}"]`);
    await expect(secretOption).toHaveText(HIDDEN_CHARACTER.name);
    let fail = true;
    const delayed =
      transition === 'delayed'
        ? await holdResponse(
            page,
            (url) =>
              url.pathname.endsWith('/entities') &&
              url.searchParams.get('perspective') === 'PUBLIC',
          )
        : null;
    if (transition === 'failed') {
      await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (
          fail &&
          url.pathname.endsWith('/entities') &&
          url.searchParams.get('perspective') === 'PUBLIC'
        ) {
          await route.abort('failed');
        } else {
          await route.continue();
        }
      });
    }
    await choices.selectOption('PUBLIC');
    if (delayed) {
      await delayed.requested;
      await expect(page.getByRole('status')).toBeVisible();
    } else {
      await expect(page.getByRole('alert')).toBeVisible();
    }
    await expectPlayerBoundary(page);
    await expect(secretOption).toHaveCount(0);
    if (delayed) {
      delayed.release();
      await delayed.completed;
    } else {
      fail = false;
      await page.getByRole('button', { name: 'Refresh world', exact: true }).click();
    }
    // The public view has loaded: its scene is shown.
    await expect(sceneRegion(page)).toBeVisible();
    await expectPlayerBoundary(page);
    expect(await page.content()).not.toContain('elowen-sigil-lore');
    await choices.selectOption('DM');
    await expect(secretOption).toHaveText(HIDDEN_CHARACTER.name);
  });
}

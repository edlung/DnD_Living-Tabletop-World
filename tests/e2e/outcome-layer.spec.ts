import { expect, test } from '@playwright/test';

import dmTools from './fixtures/dm-tool-campaigns.json' with { type: 'json' };
import { enterWorld, TOKENS } from './support/session.ts';
import { expectOnTop, openSheet } from './support/shell.ts';

/**
 * The result of an action shows over every sheet and panel (docs/STAGE_320_DESIGN.md §5.2): a
 * refusal or an interrupted response, and its Retry, are never covered by the tool that caused
 * them — on a desktop over a DM sheet, on a phone over the selection's full-height panel.
 */
test('an interrupted result and its Retry show over the DM sheet that caused them', async ({
  page,
}) => {
  await enterWorld(page, TOKENS.dm, dmTools.outcome);
  await openSheet(page, 'Time and weather');
  await page.getByLabel(/^Weather at /).selectOption('fog');
  // The command is committed, but its response is lost on the way back.
  const commandIds: string[] = [];
  await page.route('**/api/**/commands', async (route) => {
    const body = route.request().postDataJSON() as { commandId: string };
    commandIds.push(body.commandId);
    if (commandIds.length === 1) {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await page.getByRole('button', { name: 'Set weather', exact: true }).click();
  const interrupted = page.getByRole('alert', { name: 'Action result' });
  await expectOnTop(interrupted);
  const retry = interrupted.getByRole('button', { name: 'Retry action', exact: true });
  await expectOnTop(retry);
  await expect(page.locator('#sheet-time')).toBeVisible();
  const retried = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/commands'),
  );
  await retry.click();
  expect(((await (await retried).json()) as { status: string }).status).toBe('duplicate');
  expect(commandIds).toEqual([commandIds[0], commandIds[0]]);
  await expectOnTop(page.getByRole('status', { name: 'Action result' }));
  await expect(page.locator('#sheet-time')).toBeVisible();
});

test('on a phone a result shows over the selection’s full-height panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Read-only: talking with no dialogue provider records nothing.
  await enterWorld(page);
  await page.getByRole('button', { name: 'Mira Vale', exact: true }).click();
  const details = page.getByRole('complementary', { name: 'Entity details' });
  await details.getByRole('button', { name: 'Talk', exact: true }).click();
  await expectOnTop(
    page
      .getByRole('status', { name: 'Action result' })
      .filter({ hasText: 'No spoken reply is available.' }),
  );
  await expect(details).toBeVisible();
});

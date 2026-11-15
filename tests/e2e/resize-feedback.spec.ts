import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/axe.ts';
import { enterWorld, TOKENS } from './support/session.ts';

test('the battlefield and turn tray resize without observer feedback errors', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const resizeErrors: string[] = [];
    Object.defineProperty(window, 'ltwResizeErrors', { value: resizeErrors });
    window.addEventListener('error', (event) => {
      if (event.message.includes('ResizeObserver')) resizeErrors.push(event.message);
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await enterWorld(page, TOKENS.player, 'ui-combat-preview');
  await expect(page.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
  for (const width of [1440, 768, 390, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAccessible(page, `resized battlefield ${width}`);
  }
  // Flush a queued measurement and the following paint before judging observer feedback.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          }),
        ),
      ),
  );
  expect(errors).toEqual([]);
  const resizeErrors = await page.evaluate(
    () => (window as typeof window & { ltwResizeErrors: string[] }).ltwResizeErrors,
  );
  expect(resizeErrors).toEqual([]);
});

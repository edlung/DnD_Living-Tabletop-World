import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, type Page } from '@playwright/test';

/** Optional local visual evidence, taken after a player has redeemed their invitation. */
export async function inspectScreen(page: Page, slug: string, screen: string) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    slug + '/' + screen,
  ).toBeLessThanOrEqual(1);
  const directory = process.env['LTW_PHONE_SHOTS'];
  if (
    !directory ||
    ![
      'ember-crown',
      'rain-bureau',
      'acorn-express',
      'hollowmere',
      'thorn-abbey',
      'root-city',
      'rain-check',
    ].includes(slug)
  )
    return;
  const original = page.viewportSize();
  if (!original) return;
  const widths =
    slug === 'ember-crown' && screen === 'inventory' ? [1440, 768, 390, 320] : [original.width];
  const audit = process.env['LTW_LAYOUT_AUDIT'];
  const engine = page.context().browser()?.browserType().name() ?? 'browser';
  await mkdir(directory, { recursive: true });
  for (const width of widths) {
    if (width !== page.viewportSize()?.width)
      await page.setViewportSize({ width, height: original.height });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const file = join(directory, [engine, slug, screen, width].join('-'));
    await page.screenshot({ path: file + '.png', animations: 'disabled' });
    if (audit && slug === 'ember-crown' && screen === 'inventory') {
      const { auditPage } = (await import(pathToFileURL(audit).href)) as {
        auditPage: (page: Page) => Promise<unknown>;
      };
      await writeFile(file + '.json', JSON.stringify(await auditPage(page), null, 2) + '\n');
    }
  }
  if (widths.length > 1) await page.setViewportSize(original);
}

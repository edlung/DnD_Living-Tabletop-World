import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** The three widths every screen is checked at (docs/STAGE_320_DESIGN.md §6). */
export const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

/**
 * Text over the GPT art sits on glass at least 88 % opaque, or on the Chronicle's parchment
 * (design §7). Axe cannot read a colour through pictures and gradients and leaves such text
 * unchecked, so its contrast rule runs with the art and gradients set aside: every text against
 * its own panel — the book's against the darkest parchment its text can sit on (`--page-floor`:
 * the pages' veil lifts anything darker to it; tests/ui-kit/parchment-contrast.test.ts measures
 * the pictures).
 */
const FLAT =
  '*, *::before, *::after { background-image: none !important; } ' +
  '.stage-backdrop img, .sign-in-art, .book-spread-art { visibility: hidden !important; } ' +
  '.book-spread { background-color: var(--page-floor) !important; }';

const listed = (violations: readonly { id: string; nodes: { target: unknown[] }[] }[]) =>
  violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );

/**
 * Axe on this page in one run inside it. The screens have no frames, so axe's "legacy mode"
 * (`axe.run` in the page, frames of the same origin only) checks exactly what its default
 * frame-by-frame run does — the same rules, nodes and results — without opening a blank page
 * per scan to gather them in, the cost that made the scans outlast a slow runner. A frame would
 * end that equivalence, so one fails the scan.
 */
function axe(page: Page): AxeBuilder {
  expect(page.frames(), 'axe would leave a frame unchecked').toHaveLength(1);
  return new AxeBuilder({ page }).setLegacyMode();
}

/**
 * No serious or critical axe violation, text contrast on its panels, and no sideways scroll.
 * Each state is scanned once by every rule: the contrast rule runs only with the art set aside,
 * where it reaches every text the scan with the art could (a picture or gradient behind a text
 * only ever leaves it unchecked) and the text over the art besides, and any impact fails it.
 */
export async function expectAccessible(page: Page, where: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // A panel still fading in is not yet at its colours: let every finite animation finish.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow, `${where}: the page scrolls sideways`).toBe(false);
  const { violations } = await axe(page).disableRules(['color-contrast']).analyze();
  const blocking = violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(listed(blocking), `${where}: serious or critical axe violations`).toEqual([]);
  const flat = await page.addStyleTag({ content: FLAT });
  const contrast = await axe(page).withRules(['color-contrast']).analyze();
  await flat.evaluate((node) => {
    node.parentNode?.removeChild(node);
  });
  expect(listed(contrast.violations), `${where}: text contrast on its panels`).toEqual([]);
}

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
 * unchecked, so its contrast rule runs a second time with the art and gradients set aside:
 * every text against its own panel — the book's against the pages' measured tone
 * (`--page-ground`, the ground beneath the GPT spread).
 */
const FLAT =
  '*, *::before, *::after { background-image: none !important; } ' +
  '.stage-backdrop img, .sign-in-art, .book-spread-art { visibility: hidden !important; }';

const listed = (violations: readonly { id: string; nodes: { target: unknown[] }[] }[]) =>
  violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );

/** No serious or critical axe violation, text contrast on its panels, and no sideways scroll. */
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
  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(listed(blocking), `${where}: serious or critical axe violations`).toEqual([]);
  const flat = await page.addStyleTag({ content: FLAT });
  const contrast = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  await flat.evaluate((node) => {
    node.parentNode?.removeChild(node);
  });
  expect(listed(contrast.violations), `${where}: text contrast on its panels`).toEqual([]);
}

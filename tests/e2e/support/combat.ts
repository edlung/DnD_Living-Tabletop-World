import { expect, type Locator, type Page, type Response } from '@playwright/test';

import campaigns from '../fixtures/combat-campaigns.json' with { type: 'json' };
import { enterWorld, TOKENS } from './session.ts';

export const COMBAT_CAMPAIGNS = campaigns;
export const ELOWEN = 'elowen-starwhisper';

export async function enterCombat(page: Page, campaign: string, token: string = TOKENS.player) {
  await enterWorld(page, token, campaign);
  await expect(page.getByRole('region', { name: 'Battlefield', exact: true })).toBeVisible();
}

export const battlefield = (page: Page) =>
  page.getByRole('region', { name: 'Battlefield', exact: true });

/** One square of the persistent battlefield, found by its coordinates. */
export const square = (page: Page, x: number, y: number): Locator =>
  battlefield(page).getByRole('button', { name: new RegExp(`^Square ${x}, ${y}(:|$)`) });

/**
 * Points at a square where it shows and clicks it there. A figure is part of its own square
 * (design §5.5), so a name plate or an upright figure in front may cover another square's
 * centre; a player clicks the part of that square still in view, and so does this.
 */
export async function clickSquare(page: Page, x: number, y: number): Promise<void> {
  const target = square(page, x, y);
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const steps = [0.5, 0.35, 0.65, 0.2, 0.8];
    for (const fy of steps) {
      for (const fx of steps) {
        const at = { x: box.left + box.width * fx, y: box.top + box.height * fy };
        const hit = document.elementFromPoint(at.x, at.y);
        if (hit && button.contains(hit)) return at;
      }
    }
    return null;
  });
  if (!point) throw new Error(`Square ${String(x)}, ${String(y)} shows nowhere to point at`);
  await page.mouse.click(point.x, point.y);
}

export const anchor = (page: Page) => page.getByRole('status', { name: 'Encounter anchor' });

/** The turn tray: the viewer's options and End turn, shown only while the viewer may act. */
export const turnTray = (page: Page) =>
  battlefield(page).getByRole('region', { name: 'Turn actions', exact: true });

export interface Submitted {
  readonly response: Response;
  readonly body: { status: string; code?: string; outcome?: { kind: string; countered?: boolean } };
}

/** Click a real control and capture the command round trip it causes. */
export async function submit(page: Page, control: Locator): Promise<Submitted> {
  const completed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/commands') &&
      response.request().method() === 'POST',
  );
  await control.click();
  const response = await completed;
  return { response, body: (await response.json()) as Submitted['body'] };
}

export function expectAccepted(result: Submitted): void {
  expect(result.body, 'the real command must be accepted').toMatchObject({ status: 'accepted' });
}

/** Level-3 slots spent by Elowen, read through the authorized sheet API. */
export async function expendedSlots(page: Page, campaign: string): Promise<readonly number[]> {
  const response = await page.request.get(`/api/campaigns/${campaign}/entities/${ELOWEN}/sheet`, {
    headers: { authorization: `Bearer ${TOKENS.player}` },
    params: { perspective: 'PLAYER' },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    sheet: { spellSlots: { expended: readonly number[] } };
  };
  return body.sheet.spellSlots.expended;
}

/** The player's own numeric HP from the anchor strip. */
export async function playerHp(page: Page): Promise<number> {
  const text = (await anchor(page).textContent()) ?? '';
  const match = /You: (\d+) \/ \d+ HP/.exec(text);
  if (!match?.[1]) throw new Error(`No player HP in anchor: ${text}`);
  return Number(match[1]);
}

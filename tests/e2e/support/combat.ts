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

export const anchor = (page: Page) => page.getByRole('status', { name: 'Encounter anchor' });

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

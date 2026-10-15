import { expect, type Page, type Response } from '@playwright/test';

import { NEVER_FOR_PLAYERS } from '../../../apps/server/src/testing/scenario/secrets.ts';
import campaigns from '../fixtures/investigation-campaigns.json' with { type: 'json' };
import { enterWorld, isLiveStream, TOKENS } from './session.ts';
import { openSheet } from './shell.ts';

export const INVESTIGATION_CAMPAIGNS = campaigns;
export const ELOWEN = 'elowen-starwhisper';

export function entityDetails(page: Page) {
  return page.getByRole('complementary', { name: 'Entity details' });
}

export async function enterInvestigation(page: Page, campaign: string): Promise<void> {
  await enterWorld(page, TOKENS.player, campaign);
  await expect(page.getByRole('button', { name: 'Mira Vale', exact: true })).toBeVisible();
}

export async function commandAction(page: Page, label: string): Promise<void> {
  const completed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/commands') &&
      response.request().method() === 'POST',
  );
  await entityDetails(page).getByRole('button', { name: label, exact: true }).click();
  const response = await completed;
  expect(response.status(), `real action ${label} must be accepted: ${await response.text()}`).toBe(
    200,
  );
  const result = (await response.json()) as { status: string };
  expect(result.status).toBe('accepted');
}

export async function travelTo(page: Page, name: string): Promise<void> {
  const explore = page.getByRole('button', { name: `Explore ${name}`, exact: true }).first();
  // Places not adjacent to the current one are listed under known destinations, in the
  // Places sheet; choosing one there closes the sheet and opens its details.
  if (!(await explore.isVisible())) {
    await openSheet(page, 'Places');
    await expect(page.getByText('Known destinations', { exact: true })).toBeVisible();
  }
  await explore.click();
  await commandAction(page, `Enter ${name}`);
  await expect(
    page
      .getByRole('region', { name: 'Scene', exact: true })
      .getByRole('heading', { name, exact: true }),
  ).toBeVisible();
}

interface KnowledgeRecord {
  readonly knowledgeId: string;
  readonly knowledgeType: string;
  readonly statement: string;
  readonly subjects: readonly { entityId: string }[];
}

export async function playerKnowledge(
  page: Page,
  campaign: string,
): Promise<readonly KnowledgeRecord[]> {
  const response = await page.request.get(
    `/api/campaigns/${campaign}/knowledge?perspective=PLAYER`,
    {
      headers: { authorization: `Bearer ${TOKENS.player}` },
    },
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { knowledge: readonly KnowledgeRecord[] }).knowledge;
}

/** Uses the scenario boundary: clues/accounts legitimately learned may appear. */
export function investigationBoundary(page: Page): { assertClean(): Promise<void> } {
  const pending: Promise<string>[] = [];
  page.on('response', (response: Response) => {
    if (new URL(response.url()).pathname.startsWith('/api/') && !isLiveStream(response)) {
      pending.push(response.text().catch(() => ''));
    }
  });
  return {
    async assertClean() {
      const payloads = [await page.content(), ...(await Promise.all(pending))].join('\n');
      for (const marker of NEVER_FOR_PLAYERS) {
        expect(payloads, `investigation must not expose ${marker}`).not.toContain(marker);
      }
    },
  };
}

import { expect, type Page } from '@playwright/test';

import campaigns from '../fixtures/authoring-campaigns.json' with { type: 'json' };
import { enterWorld, TOKENS } from './session.ts';
import { dockButton, openSheet } from './shell.ts';

export const AUTHORING_CAMPAIGNS = campaigns;
export const TOMAS_REQUEST = 'Add a young guard near North Gate who saw the caravan leave.';

/** The DM's authoring tool: the dock's "Add to the world" opens its sheet. */
export const ADD_TO_THE_WORLD = 'Add to the world';

export async function enterAsDm(page: Page, campaign: string): Promise<void> {
  await enterWorld(page, TOKENS.dm, campaign);
  await expect(dockButton(page, ADD_TO_THE_WORLD)).toBeVisible();
}

export const review = (page: Page) =>
  page.getByRole('region', { name: 'Authoring proposal', exact: true });

/** Words in, a stored proposal and its server preview out. */
export async function propose(
  page: Page,
  text = TOMAS_REQUEST,
): Promise<{ proposalId: string; commands: Record<string, unknown>[] }> {
  await openSheet(page, ADD_TO_THE_WORLD);
  await expect(page.getByText('Add to the world (DM)', { exact: true })).toBeVisible();
  await page.getByLabel('Describe what to add', { exact: true }).fill(text);
  const created = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/authoring/proposals') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Propose', exact: true }).click();
  await expect(review(page)).toBeVisible();
  const body = (await (await created).json()) as {
    proposal: { proposalId: string; commands: Record<string, unknown>[] };
  };
  return body.proposal;
}

/**
 * The ID of the entity a stored proposal creates: the server's, never the one the AI wrote
 * (ADR 0008, Gate 06 remediation).
 */
export function createdEntityId(proposal: { commands: Record<string, unknown>[] }): string {
  const created = proposal.commands.find((command) => command['type'] === 'CreateEntity');
  const entityId = created?.['entityId'];
  if (typeof entityId !== 'string') throw new Error('the proposal creates no entity');
  expect(entityId).not.toMatch(/tomas|reed/);
  return entityId;
}

/** The DM's own bearer requests: the same routes the browser uses. */
export async function dmRequest(
  page: Page,
  campaign: string,
  method: 'get' | 'post',
  path: string,
  data?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await page.request[method](`/api/campaigns/${campaign}/${path}`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
    ...(method === 'get' ? { params: { perspective: 'DM' } } : { data }),
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

export async function playerCommand(
  page: Page,
  campaign: string,
  commandId: string,
  command: unknown,
): Promise<{ status: number; body: { status: string; code?: string } }> {
  const response = await page.request.post(`/api/campaigns/${campaign}/commands`, {
    headers: { authorization: `Bearer ${TOKENS.player}` },
    // Command IDs are unique per actor across campaigns, so each journey namespaces its own.
    data: { commandId: `${campaign}.${commandId}`, command },
  });
  return { status: response.status(), body: (await response.json()) as never };
}

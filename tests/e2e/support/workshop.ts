import { expect, type Page } from '@playwright/test';

import { signInSeed } from '../../../apps/server/src/testing/ui-sign-in-links.ts';
import {
  workshopDraftId,
  workshopInvitationToken,
  workshopOwnerId,
  type WorkshopFixture,
} from '../../../apps/server/src/testing/ui-workshop-links.ts';

export const draftPath = (name: WorkshopFixture) =>
  `/workshop/drafts/${workshopDraftId(signInSeed(), name)}`;
export const draftApi = (name: WorkshopFixture) =>
  `/api/workshop/drafts/${workshopDraftId(signInSeed(), name)}`;
export const workshopOwner = (name: WorkshopFixture) => workshopOwnerId(signInSeed(), name);
export async function openWorkshopDraft(page: Page, name: WorkshopFixture) {
  await page.goto(`/workshop/join#${workshopInvitationToken(signInSeed(), name)}`);
  await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
  await page.goto(draftPath(name));
  await expect(page.getByRole('tab', { name: /^(Scenario|Сценарий)$/ })).toBeVisible();
}
export const scenarioInspector = (page: Page) =>
  page.getByRole('article', { name: /^(Scenario inspector|Подробности объекта сценария)$/ });

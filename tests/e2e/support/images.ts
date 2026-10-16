import { expect, type Locator, type Page } from '@playwright/test';

import type {
  AssetLineageResponse,
  AssetView,
  EntityPresentationResponse,
} from '../../../packages/contracts/src/index.ts';
import campaigns from '../fixtures/image-campaigns.json' with { type: 'json' };
import { TOKENS } from './session.ts';

/** The image journeys' campaigns (`apps/server/src/testing/ui-image-journeys.ts`). */
export const IMAGE_CAMPAIGNS = campaigns;

/**
 * A picture the page shows from the asset API: an object URL of bytes the viewer fetched with
 * its own authorization, decoded. Never a UI-kit file in its place.
 */
export async function expectServedPicture(image: Locator): Promise<void> {
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
}

/** The selection's panel, by its name in the campaign's language. */
export const detailsPanel = (page: Page, name = 'Entity details'): Locator =>
  page.getByRole('complementary', { name, exact: true });

/** The DM's images of the selected entity, in its panel. */
export const imagesRegion = (
  page: Page,
  words: { readonly panel: string; readonly region: string } = {
    panel: 'Entity details',
    region: 'Images (DM)',
  },
): Locator =>
  detailsPanel(page, words.panel).getByRole('region', { name: words.region, exact: true });

/** Words made only of Latin letters on a Russian page: none may show. */
export async function expectNoEnglish(scope: Locator, where: string): Promise<void> {
  const text = await scope.innerText();
  expect(text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? [], `${where}: English words`).toEqual([]);
}

/** The DM's lineage, through the DM-only route. */
export async function lineage(page: Page, campaign: string): Promise<AssetLineageResponse> {
  const response = await page.request.get(`/api/campaigns/${campaign}/assets`, {
    headers: { authorization: `Bearer ${TOKENS.dm}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as AssetLineageResponse;
}

/** The entity's assets of a status, oldest first, as the lineage lists them. */
export async function assetsOf(
  page: Page,
  campaign: string,
  entityId: string,
  status: AssetView['status'],
): Promise<AssetView[]> {
  return (await lineage(page, campaign)).assets.filter(
    (asset) => asset.entityId === entityId && asset.status === status,
  );
}

/** Whether the player may fetch these bytes: 200, or 404 exactly like content that is not there. */
export async function playerFetch(
  page: Page,
  campaign: string,
  contentHash: string,
): Promise<number> {
  const response = await page.request.get(
    `/api/campaigns/${campaign}/assets/content/${encodeURIComponent(contentHash)}`,
    { headers: { authorization: `Bearer ${TOKENS.player}` }, params: { perspective: 'PLAYER' } },
  );
  return response.status();
}

/** The entity as the player sees it now: its approved image, figure, battle map. */
export async function playerPresentation(
  page: Page,
  campaign: string,
  entityId: string,
): Promise<EntityPresentationResponse['presentation']> {
  const response = await page.request.get(
    `/api/campaigns/${campaign}/entities/${entityId}/presentation`,
    { headers: { authorization: `Bearer ${TOKENS.player}` }, params: { perspective: 'PLAYER' } },
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as EntityPresentationResponse).presentation;
}

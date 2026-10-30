import { randomUUID } from 'node:crypto';

import { expect, type Page, type Request, type Response, type Route } from '@playwright/test';
import type {
  CampaignDraftImagesView,
  CampaignPreviewView,
  DraftImageCandidate,
  DraftImageJob,
} from '../../../packages/contracts/src/index.ts';

import { SIGN_IN_ORIGIN } from '../../../apps/server/src/testing/ui-sign-in-links.ts';
import type { WorkshopFixture } from '../../../apps/server/src/testing/ui-workshop-links.ts';
import { draftApi, openWorkshopDraft } from './workshop.ts';

export const BELL_TRUTH =
  'Iva activated the resonator left by her mentor. It is out of tune, and the bell responds to its mechanism.';
export const viewRegion = (page: Page) =>
  page.getByRole('region', { name: /^(World preview|Превью мира)$/, exact: true });
export const picturesRegion = (page: Page) =>
  page.getByRole('region', { name: /^(Draft pictures|Иллюстрации черновика)$/, exact: true });
export async function openWorldPreview(page: Page, name: WorkshopFixture) {
  await openWorkshopDraft(page, name);
  await page.getByRole('tab', { name: /^(World preview|Превью мира)$/, exact: true }).click();
  await expect(
    viewRegion(page).getByText(
      /^(Owner view of the prepared world|Подготовленный мир глазами владельца)$/,
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel(/^(Choose a prepared character|Выберите подготовленного персонажа)$/, {
      exact: true,
    }),
  ).toBeVisible();
}
export async function enterCharacter(page: Page, name = 'Alena') {
  const select = page.getByLabel(
    /^(Choose a prepared character|Выберите подготовленного персонажа)$/,
    { exact: true },
  );
  await select.selectOption({ label: name });
  const characterId = await select.inputValue();
  await page
    .getByRole('button', {
      name: /^(Preview as character|Посмотреть глазами персонажа)$/,
      exact: true,
    })
    .click();
  await expect(
    viewRegion(page).getByRole('button', {
      name: /^(Return to owner preview|Вернуться к превью владельца)$/,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    viewRegion(page).getByText(
      new RegExp(`^(Initial view of ${name}|Начальный вид персонажа ${name})$`),
    ),
  ).toBeVisible();
  return characterId;
}
export async function leaveCharacter(page: Page) {
  await page
    .getByRole('button', {
      name: /^(Return to owner preview|Вернуться к превью владельца)$/,
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel(/^(Choose a prepared character|Выберите подготовленного персонажа)$/, {
      exact: true,
    }),
  ).toBeVisible();
}
export async function imagesView(
  page: Page,
  name: WorkshopFixture,
  entityId?: string,
): Promise<CampaignDraftImagesView> {
  const response = await page.request.get(
    `${draftApi(name)}/images?revision=1${entityId ? `&entityId=${entityId}` : ''}`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as CampaignDraftImagesView;
}
export async function generateImageByApi(page: Page, name: WorkshopFixture, entityId: string) {
  const before = await imagesView(page, name, entityId);
  const response = await page.request.post(`${draftApi(name)}/images/jobs`, {
    headers: { origin: SIGN_IN_ORIGIN },
    data: {
      requestId: randomUUID(),
      revision: 1,
      packageDigest: before.manifest.packageDigest,
      expectedManifestVersion: before.manifest.version,
      entityId,
      purpose: 'image',
      variant: 'reference',
      label: null,
      note: null,
    },
  });
  expect(response.status()).toBe(200);
  const { job } = (await response.json()) as { job: DraftImageJob };
  await expect
    .poll(
      async () => {
        const reply = await page.request.get(`${draftApi(name)}/images/jobs/${job.jobId}`);
        return ((await reply.json()) as { job: DraftImageJob }).job.status;
      },
      { timeout: 20000 },
    )
    .toBe('SUCCEEDED');
  const after = await imagesView(page, name, entityId);
  const candidate = after.candidates.find((entry) => entry.jobId === job.jobId);
  if (!candidate) throw new Error('PICTURE_CANDIDATE_MISSING');
  return candidate;
}
export async function chooseImageByApi(
  page: Page,
  name: WorkshopFixture,
  candidate: DraftImageCandidate,
) {
  const view = await imagesView(page, name, candidate.entityId);
  const response = await page.request.post(`${draftApi(name)}/images/selection`, {
    headers: { origin: SIGN_IN_ORIGIN },
    data: {
      requestId: randomUUID(),
      revision: 1,
      packageDigest: view.manifest.packageDigest,
      expectedManifestVersion: view.manifest.version,
      entityId: candidate.entityId,
      purpose: candidate.purpose,
      variant: candidate.variant,
      label: candidate.label,
      candidateId: candidate.candidateId,
    },
  });
  expect(response.status()).toBe(200);
}
export const previewQuery = (characterId: string) =>
  `revision=1&perspective=CHARACTER&characterId=${characterId}`;
export function restrictedTraffic(page: Page) {
  const requests: Request[] = [];
  const received: Promise<string>[] = [];
  const request = (value: Request) => {
    if (new URL(value.url()).pathname.startsWith('/api/')) requests.push(value);
  };
  const response = (value: Response) => {
    if (requests.includes(value.request()) && value.headers()['content-type']?.includes('json'))
      received.push(value.text().catch(() => ''));
  };
  page.on('request', request);
  page.on('response', response);
  return {
    async assertClean(markers: readonly string[] = []) {
      const urls = requests.map((value) => value.url());
      expect(urls.length).toBeGreaterThan(0);
      expect(
        urls.some((url) =>
          /\/package(?:\?|$)|\/preview\/catalog|\/images(?:[/?]|$)|\/generation(?:[/?]|$)/.test(
            url,
          ),
        ),
      ).toBe(false);
      const bodies = (await Promise.all(received)).join('\n');
      for (const marker of [
        BELL_TRUTH,
        '"ownerDescription"',
        '"sourceSignature"',
        '"candidates"',
        '"jobs"',
        '"prepared"',
        '"encounters"',
        'browser-image-fixture',
        'curated-raster-fixture-1',
        ...markers,
      ])
        expect(bodies).not.toContain(marker);
      return urls;
    },
    stop() {
      page.off('request', request);
      page.off('response', response);
    },
  };
}
/** Real response held after fetch; transport delay is the only simulated behavior. */
export async function holdNextPreview(
  page: Page,
  name: WorkshopFixture,
  mode: 'OWNER' | 'CHARACTER',
) {
  let release: () => void = () => undefined,
    observed: () => void = () => undefined,
    done: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    seen = new Promise<void>((resolve) => {
      observed = resolve;
    }),
    finished = new Promise<void>((resolve) => {
      done = resolve;
    });
  let consumed = false;
  const handler = async (route: Route) => {
    const url = new URL(route.request().url());
    if (consumed || url.searchParams.get('perspective') !== mode) return route.continue();
    consumed = true;
    try {
      const response = await route.fetch();
      observed();
      await held;
      await route.fulfill({ response }).catch(() => undefined);
    } finally {
      done();
    }
  };
  const pattern = `**${draftApi(name)}/preview?**`;
  await page.route(pattern, handler);
  return {
    seen,
    async release() {
      release();
      await finished;
      await page.unroute(pattern, handler);
    },
  };
}
export async function characterView(
  page: Page,
  name: WorkshopFixture,
  characterId: string,
): Promise<CampaignPreviewView> {
  const response = await page.request.get(`${draftApi(name)}/preview?${previewQuery(characterId)}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as CampaignPreviewView;
}

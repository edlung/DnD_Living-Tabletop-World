import { createHash } from 'node:crypto';

import { expect, test } from '@playwright/test';
import type { DraftImageJob } from '../../packages/contracts/src/index.ts';

import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { draftApi } from './support/workshop.ts';
import {
  chooseImageByApi,
  enterCharacter,
  generateImageByApi,
  imagesView,
  leaveCharacter,
  openWorldPreview,
  picturesRegion,
  previewQuery,
  restrictedTraffic,
  viewRegion,
} from './support/workshop-preview.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });

test('a generated candidate stays out of character preview until chosen, then serves the exact reviewed bytes', async ({
  page,
}) => {
  await openWorldPreview(page, 'preview-images');
  const pictures = picturesRegion(page);
  await pictures.getByLabel('Picture object', { exact: true }).selectOption({ label: 'Arden' });
  await pictures.getByLabel('Picture purpose', { exact: true }).selectOption('image');
  await expect(
    pictures.getByRole('group', { name: 'What the image model will read', exact: true }),
  ).toBeVisible();
  const request = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/images/jobs'),
  );
  await pictures.getByRole('button', { name: 'Generate picture', exact: true }).click();
  const job = ((await (await request).json()) as { job: DraftImageJob }).job;
  await expect(pictures.getByRole('button', { name: 'Choose picture', exact: true })).toBeVisible({
    timeout: 20000,
  });
  const inventory = await imagesView(page, 'preview-images', job.entityId);
  const candidate = inventory.candidates.find((entry) => entry.jobId === job.jobId);
  if (!candidate) throw new Error('IMAGE_CANDIDATE_MISSING');
  expect(inventory.manifest.entries).toEqual([]);
  const owner = await page.request.get(
    `${draftApi('preview-images')}/images/content/${encodeURIComponent(candidate.contentHash)}?revision=1`,
  );
  expect(owner.status()).toBe(200);
  const reviewedBytes = await owner.body();
  expect(reviewedBytes.byteLength).toBeGreaterThan(0);
  const characterId = await enterCharacter(page);
  await expect(
    viewRegion(page)
      .getByRole('button', { name: 'Arden', exact: true })
      .locator('img[src^="blob:"]'),
  ).toHaveCount(0);
  const unselected = await page.request.get(
    `${draftApi('preview-images')}/preview/content/${encodeURIComponent(candidate.contentHash)}?${previewQuery(characterId)}`,
  );
  expect(unselected.status()).toBe(404);
  await leaveCharacter(page);
  await pictures.getByLabel('Picture object', { exact: true }).selectOption({ label: 'Arden' });
  await pictures.getByRole('button', { name: 'Choose picture', exact: true }).click();
  await expect(pictures.getByText('Current picture', { exact: true })).toBeVisible();
  const image = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      decodeURIComponent(url.pathname).endsWith(`/preview/content/${candidate.contentHash}`) &&
      url.searchParams.get('perspective') === 'CHARACTER'
    );
  });
  await enterCharacter(page);
  const chosen = await image;
  expect(chosen.status()).toBe(200);
  expect(chosen.headers()['content-type']).toContain(candidate.mediaType);
  const portrait = viewRegion(page)
    .getByRole('button', { name: 'Arden', exact: true })
    .locator('img[src^="blob:"]');
  await expect(portrait).toBeVisible();
  await expect
    .poll(() =>
      portrait.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
    )
    .toBe(true);
  const shownHash = await portrait.evaluate(async (node: HTMLImageElement) => {
    const bytes = await (await fetch(node.src)).arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return `sha256:${[...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  });
  expect(`sha256:${createHash('sha256').update(reviewedBytes).digest('hex')}`).toBe(
    candidate.contentHash,
  );
  expect(shownHash).toBe(candidate.contentHash);
  await leaveCharacter(page);
  await pictures.getByLabel('Picture object', { exact: true }).selectOption({ label: 'Arden' });
  await pictures.getByRole('button', { name: 'Remove chosen picture', exact: true }).click();
  await expect(
    pictures.getByText('No picture is chosen. The preview uses a neutral fallback.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('restricted mode never preloads a hidden chosen place, unused candidates, owner catalog or private narrative', async ({
  page,
}) => {
  await openWorldPreview(page, 'preview-privacy');
  const inventory = await imagesView(page, 'preview-privacy');
  const hidden = inventory.subjects.find((subject) => subject.name === 'The Sunken Tower');
  const visible = inventory.subjects.find((subject) => subject.name === 'Arden');
  if (!hidden || !visible) throw new Error('BOUNDARY_SUBJECT_MISSING');
  const hiddenCandidate = await generateImageByApi(page, 'preview-privacy', hidden.entityId);
  await chooseImageByApi(page, 'preview-privacy', hiddenCandidate);
  const unused = await generateImageByApi(page, 'preview-privacy', visible.entityId);
  await picturesRegion(page).getByRole('button', { name: 'Refresh pictures', exact: true }).click();
  await picturesRegion(page)
    .getByLabel('Picture object', { exact: true })
    .selectOption({ label: 'The Sunken Tower' });
  await expect(
    picturesRegion(page).getByRole('img', { name: 'Chosen picture', exact: true }),
  ).toBeVisible();
  const traffic = restrictedTraffic(page);
  const characterId = await enterCharacter(page);
  const forbidden = [
    'The Sunken Tower',
    hidden.entityId,
    hiddenCandidate.contentHash,
    unused.contentHash,
    'The lighthouse keeper wants to keep the river open and correct her mistake.',
  ];
  for (const marker of forbidden)
    expect(await page.locator('body').textContent()).not.toContain(marker);
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(0);
  await expect(page.getByLabel('Picture object', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Prepared encounter layout', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open in scenario', exact: true })).toHaveCount(0);
  const urls = await traffic.assertClean(forbidden);
  for (const hash of [hiddenCandidate.contentHash, unused.contentHash])
    expect(urls.some((url) => decodeURIComponent(url).includes(hash))).toBe(false);
  traffic.stop();
  for (const hash of [hiddenCandidate.contentHash, unused.contentHash]) {
    const response = await page.request.get(
      `${draftApi('preview-privacy')}/preview/content/${encodeURIComponent(hash)}?${previewQuery(characterId)}`,
    );
    expect(response.status()).toBe(404);
  }
  await leaveCharacter(page);
  const returned = await imagesView(page, 'preview-privacy', hidden.entityId);
  expect(returned.manifest.entries[0]?.contentHash).toBe(hiddenCandidate.contentHash);
});

test('an unavailable image route stays truthful and never creates a picture request', async ({
  page,
}) => {
  await openWorldPreview(page, 'preview-unavailable');
  const pictures = picturesRegion(page);
  await expect(
    pictures.getByText('No image provider is configured for this workshop.', { exact: true }),
  ).toBeVisible();
  await pictures.getByLabel('Picture object', { exact: true }).selectOption({ label: 'Arden' });
  await expect(
    pictures.getByRole('button', { name: 'Generate picture', exact: true }),
  ).toBeDisabled();
  const view = await imagesView(page, 'preview-unavailable');
  expect(view.jobs).toEqual([]);
  expect(view.candidates).toEqual([]);
  expect(view.availability.available).toBe(false);
  await enterCharacter(page);
  await expect(viewRegion(page).getByRole('button', { name: 'Arden', exact: true })).toBeVisible();
  await expect(picturesRegion(page)).toHaveCount(0);
});

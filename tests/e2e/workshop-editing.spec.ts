import { expect, test, type Page } from '@playwright/test';

import type {
  CampaignEditingContext,
  CampaignRevisionView,
} from '../../packages/contracts/src/index.ts';
import { SIGN_IN_ORIGIN } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import type { WorkshopFixture } from '../../apps/server/src/testing/ui-workshop-links.ts';
import { draftApi, openWorkshopDraft, workshopOwner } from './support/workshop.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60_000);

async function editing(page: Page, name: WorkshopFixture): Promise<CampaignEditingContext> {
  const response = await page.request.get(`${draftApi(name)}/editing`);
  expect(response.status()).toBe(200);
  return (await response.json()) as CampaignEditingContext;
}
async function savedAt(page: Page, name: WorkshopFixture, revision: number) {
  const response = await page.request.get(`${draftApi(name)}/revisions/${String(revision)}`);
  expect(response.status()).toBe(200);
  const view = (await response.json()) as CampaignRevisionView;
  if (!view.revision) throw new Error('Saved revision missing');
  return { revision: view.revision };
}
async function currentRevision(page: Page, name: WorkshopFixture, revision: number) {
  await expect
    .poll(async () => {
      const response = await page.request.get(`${draftApi(name)}/revisions`);
      expect(response.status()).toBe(200);
      const history = (await response.json()) as { revisions: { revision: number }[] };
      return history.revisions[0]?.revision;
    })
    .toBe(revision);
}
async function openChanges(page: Page) {
  await expect(
    page.getByRole('region', { name: 'Complete field comparison', exact: true }),
  ).toBeVisible();
  const closed = page.locator('.campaign-change-list > li > details:not([open]) > summary');
  for (let count = 0; count < 25 && (await closed.count()); count++) await closed.first().click();
}
async function startEdit(page: Page, target: string, instruction: string) {
  await page.getByRole('button', { name: 'Targeted AI edit', exact: true }).click();
  await page.getByLabel('Instructions for this edit', { exact: true }).fill(instruction);
  await page.getByLabel('Find an edit target', { exact: true }).fill(target);
  await page.getByRole('checkbox', { name: target, exact: true }).first().check();
  await page.getByRole('button', { name: 'Review edit scope', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Resolved edit scope', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Prepare proposed changes', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Review proposed changes', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Review proposed changes', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review proposed changes', exact: true }),
  ).toBeVisible();
  await openChanges(page);
}

test('structured manual changes, directed AI proposal, full comparison and restore form immutable revisions', async ({
  page,
}) => {
  const name = 'edit-en';
  await openWorkshopDraft(page, name);
  const initial = await savedAt(page, name, 1);
  await page.getByRole('button', { name: 'Structured editing', exact: true }).click();
  await page.getByLabel('Edit section', { exact: true }).selectOption('world');
  const opening =
    'The dock bell rings twice before dawn. The ferryman asks the party to investigate.';
  await page.getByRole('textbox', { name: 'Opening', exact: true }).fill(opening);
  await page.getByRole('button', { name: 'Review manual changes', exact: true }).click();
  await openChanges(page);
  await expect(
    page.getByRole('region', { name: 'After', exact: true }).getByText(opening, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save structural changes', exact: true }).click();
  await currentRevision(page, name, 2);
  expect((await savedAt(page, name, 2)).revision.content.world.opening).toBe(opening);
  await startEdit(
    page,
    'Arden',
    'Give Arden a clearer reason to protect river travelers; keep the prepared setting intact.',
  );
  await currentRevision(page, name, 2);
  await expect(page.getByText(/family once depended on a ferryman/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Apply proposal as a new revision', exact: true }).click();
  await currentRevision(page, name, 3);
  const applied = await savedAt(page, name, 3);
  expect(
    applied.revision.content.entities.find((row) => row.key === 'arden')?.description,
  ).toContain('river travelers');
  expect(applied.revision.content.world.opening).toBe(opening);
  expect(applied.revision.identities).toEqual(initial.revision.identities);
  await page.getByLabel('Compare with revision', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Compare revisions', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Compare saved revisions', exact: true }),
  ).toBeVisible();
  await openChanges(page);
  await expect(page.getByText(opening, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore compared revision as new', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Restore as a new revision', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore as a new revision', exact: true }).click();
  await currentRevision(page, name, 4);
  expect((await savedAt(page, name, 4)).revision.content).toEqual(initial.revision.content);
  const original = await page.request.get(`${draftApi(name)}/revisions/1`);
  expect(((await original.json()) as CampaignRevisionView).revision).toEqual(initial.revision);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Structured editing', exact: true })).toBeVisible();
});

test('protections require explicit unlock and block both manual changes and directly requested AI targets', async ({
  page,
}) => {
  const name = 'edit-locks';
  await openWorkshopDraft(page, name);
  await page.getByRole('button', { name: 'Protections', exact: true }).click();
  await page.getByLabel('Find content or a chosen picture', { exact: true }).fill('World');
  await page.getByRole('checkbox', { name: 'World and opening', exact: true }).check();
  await page.getByRole('button', { name: 'Save protections', exact: true }).click();
  await expect(page.getByText('Protections saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Structured editing', exact: true }).click();
  await page.getByLabel('Edit section', { exact: true }).selectOption('world');
  await expect(page.getByRole('textbox', { name: 'Opening', exact: true })).toBeDisabled();
  const context = await editing(page, name),
    content = structuredClone(context.revision.content);
  content.world.opening = 'A forbidden overwrite';
  const response = await page.request.post(`${draftApi(name)}/revisions`, {
    headers: { origin: SIGN_IN_ORIGIN, 'x-workshop-owner': workshopOwner(name) },
    data: {
      requestId: crypto.randomUUID(),
      basedOnRevision: 1,
      expectedLockVersion: context.locks.version,
      expectedManifestVersion: context.manifest.version,
      expectedManifestDigest: context.manifest.digest,
      content,
    },
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ conflict: { reason: 'LOCKED_CONTENT' } });
  await page.getByRole('button', { name: 'Targeted AI edit', exact: true }).click();
  await page.getByLabel('Instructions for this edit', { exact: true }).fill('Change the opening.');
  await page.getByLabel('Find an edit target', { exact: true }).fill('World');
  await page.getByRole('checkbox', { name: /^World/ }).check();
  await page.getByRole('button', { name: 'Review edit scope', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Resolved edit scope', exact: true }),
  ).toContainText('Unlock this content explicitly or choose another target.');
  await expect(
    page.getByRole('button', { name: 'Prepare proposed changes', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Protections', exact: true }).click();
  await page.getByLabel('Find content or a chosen picture', { exact: true }).fill('World');
  await page.getByRole('checkbox', { name: 'World and opening', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save protections', exact: true }).click();
  await expect(page.getByText('Protections saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Structured editing', exact: true }).click();
  await page.getByLabel('Edit section', { exact: true }).selectOption('world');
  await expect(page.getByRole('textbox', { name: 'Opening', exact: true })).toBeEnabled();
});

test('an old AI proposal remains inspectable after another revision and cannot silently rebase', async ({
  page,
}) => {
  const name = 'edit-candidate';
  await openWorkshopDraft(page, name);
  await startEdit(page, 'World and opening', 'Make the opening urgent.');
  const context = await editing(page, name),
    content = structuredClone(context.revision.content);
  content.world.opening = 'An independently saved opening.';
  expect(
    (
      await page.request.post(`${draftApi(name)}/revisions`, {
        headers: { origin: SIGN_IN_ORIGIN },
        data: {
          requestId: crypto.randomUUID(),
          basedOnRevision: 1,
          expectedLockVersion: context.locks.version,
          expectedManifestVersion: context.manifest.version,
          expectedManifestDigest: context.manifest.digest,
          content,
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Refresh reviewed changes', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Apply proposal as a new revision', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/This result cannot be applied/)).toBeVisible();
  await openChanges(page);
  expect((await editing(page, name)).revision.content.world.opening).toBe(content.world.opening);
  await expect(page.getByText(/Updated at the owner/).first()).toBeVisible();
});

test('a lost manual-save acknowledgement retries the exact request once and keeps the local edit', async ({
  page,
}) => {
  const name = 'edit-late';
  await openWorkshopDraft(page, name);
  await page.getByRole('button', { name: 'Structured editing', exact: true }).click();
  await page.getByLabel('Edit section', { exact: true }).selectOption('world');
  await page
    .getByRole('textbox', { name: 'Opening', exact: true })
    .fill('Saved even when its answer is lost.');
  const requests: string[] = [];
  await page.route(`**${draftApi(name)}/revisions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    requests.push(route.request().postData() ?? '');
    const response = await route.fetch();
    if (requests.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save structural changes', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry original correction', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Opening', exact: true })).toHaveValue(
    'Saved even when its answer is lost.',
  );
  await page.getByRole('button', { name: 'Retry original correction', exact: true }).click();
  await currentRevision(page, name, 2);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
});

test('revocation clears a mounted private comparison before a delayed review can return', async ({
  page,
}) => {
  const name = 'edit-revoked';
  await openWorkshopDraft(page, name);
  await startEdit(page, 'World and opening', 'Make the opening urgent.');
  let release: () => void = () => undefined,
    observed: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    fetched = new Promise<void>((resolve) => {
      observed = resolve;
    });
  await page.route(`**${draftApi(name)}/edits/*/review`, async (route) => {
    const response = await route.fetch();
    observed();
    await held;
    await route.fulfill({ response }).catch(() => undefined);
  });
  await page.getByRole('button', { name: 'Refresh reviewed changes', exact: true }).click();
  await fetched;
  expect(
    (
      await page.request.post('/api/testing/workshop-revoke/edit-revoked', {
        headers: { origin: SIGN_IN_ORIGIN },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await expect(
    page.getByRole('heading', { name: 'Open your workshop with an invitation', exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole('region', { name: 'Review revision changes', exact: true }),
  ).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('Updated at the owner');
});

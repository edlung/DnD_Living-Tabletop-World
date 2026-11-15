import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { SIGN_IN_ORIGIN, signInSeed } from '../../apps/server/src/testing/ui-sign-in-links.ts';
import { workshopInvitationToken, workshopOwnerId } from '../../apps/server/src/testing/ui-workshop-links.ts';
import { acknowledgeActivation, activationConfirm, chooseTextOnly, enterActivatedGame, expectPublished, ownedCampaigns } from './support/workshop-activation.ts';
import { WORDS, invite, openInvitation } from './support/sign-in.ts';
import { dockButton, openSheet } from './support/shell.ts';

test.use({ baseURL: SIGN_IN_ORIGIN, trace: 'off', screenshot: 'off', video: 'off', viewport: { width: 1440, height: 900 } });
test.setTimeout(150_000);

const SHOTS = '/private/tmp/claude-501/-Users-oleksandr--claude-spares-spare-REL6PD/6522dce7-823b-432f-94f0-f0a072502f48/scratchpad/audit/shots';
const TARGETS: [string, string][] = [
  ['package-import', 'lighthouse'],
  ['acorn-import', 'acorn-express'],
  ['pearl-import', 'moon-pearl'],
  ['journey', 'fantasy-2026/storm-kitchen'],
  ['private-a', 'noir-2026/rain-check'],
  ['private-b', 'dark-fantasy-2026/thorn-abbey'],
  ['replace-a', 'mixed-ages-2026/rain-bureau'],
  ['replace-b', 'collection-2026/glass-republic'],
];

for (const [fixture, rel] of TARGETS) {
  test(`table journey: ${rel}`, async ({ page, browser }) => {
    const slug = rel.replace('/', '__');
    const pkg = JSON.parse(readFileSync(`campaigns/${rel}/package.json`, 'utf8'));
    const log: string[] = [];
    const note = (s: string) => { log.push(s); console.log(`[${slug}] ${s}`); };
    page.on('pageerror', (e) => note('PAGEERROR ' + String(e).slice(0, 200)));
    await page.goto(`/workshop/join#${workshopInvitationToken(signInSeed(), fixture as never)}`);
    await page.getByRole('button', { name: 'Enter the workshop', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your drafts', exact: true })).toBeVisible();
    const created = await page.request.post('/api/workshop/drafts', { headers: { 'x-workshop-owner': workshopOwnerId(signInSeed(), fixture as never), origin: SIGN_IN_ORIGIN }, data: { requestId: randomUUID(), title: String(pkg.world.name).slice(0, 80), language: 'ru' } });
    expect(created.status()).toBe(200);
    const draft = (await created.json()) as { draftId: string };
    await page.goto(`/workshop/drafts/${draft.draftId}`);
    await page.getByRole('tab', { name: /^(Scenario|Сценарий)$/ }).click();
    const input = page.getByLabel(/^(Campaign package file|Файл кампании)$/);
    await input.setInputFiles(`campaigns/${rel}/package.json`);
    await page.getByRole('button', { name: /^(Save package to this draft|Сохранить пакет в этот черновик)$/ }).click();
    await expect(input).toHaveCount(0, { timeout: 20000 });
    await page.screenshot({ path: `${SHOTS}/${slug}-1-scenario.png` });
    note('imported');
    await page.getByRole('tab', { name: /^(Activation|Запуск)$/ }).click();
    await expect(activationConfirm(page)).toBeVisible({ timeout: 20000 });
    await chooseTextOnly(page);
    await acknowledgeActivation(page);
    await activationConfirm(page).click();
    await expectPublished(page);
    const owned = await ownedCampaigns(page);
    const campaignId = owned.campaigns[owned.campaigns.length - 1]!.campaignId;
    note('activated ' + campaignId);
    await enterActivatedGame(page, 'en');
    await expect(dockButton(page, 'Игроки')).toBeAttached({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/${slug}-2-dm-start.png` });
    const hero = pkg.entities.find((e: { key: string }) => e.key === pkg.party[0]).name as string;
    const link = await invite(page, hero, WORDS.ru);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const player = await ctx.newPage();
    player.on('pageerror', (e) => note('PLAYER PAGEERROR ' + String(e).slice(0, 200)));
    await openInvitation(player, link, WORDS.en);
    await expect(player.locator('nav.dock')).toBeAttached({ timeout: 20000 });
    await player.waitForTimeout(800);
    await player.screenshot({ path: `${SHOTS}/${slug}-3-player-start.png` });
    note('player joined as ' + hero);
    // The player's own sheet opens and names the hero
    const heroBtn = player.getByRole('button', { name: hero, exact: true }).first();
    if (await heroBtn.isVisible().catch(() => false)) {
      await heroBtn.click();
      const full = player.getByRole('button', { name: 'Полный лист персонажа', exact: true });
      if (await full.isVisible().catch(() => false)) { await full.click(); await player.waitForTimeout(600); await player.screenshot({ path: `${SHOTS}/${slug}-4-player-sheet.png` }); await player.keyboard.press('Escape'); note('sheet opened'); }
    } else note('hero button not visible for player');
    // The DM moves the party to the first prepared encounter's place (a DM command, as in play)
    const enc = pkg.encounters[0];
    const session = (await (await page.request.get(`/api/campaigns/${campaignId}/session`)).json()) as { campaign: { campaignId: string } };
    expect(session.campaign.campaignId).toBe(campaignId);
    const ents = (await (await page.request.get(`/api/campaigns/${campaignId}/entities?perspective=DM`)).json()) as { entities: { entityId: string; name: string; kind: string }[] };
    const byName = (name: string) => ents.entities.find((e) => e.name === name)?.entityId;
    const locName = pkg.entities.find((e: { key: string }) => e.key === enc.location).name as string;
    const locId = byName(locName);
    if (!locId) note('location id not found for ' + locName);
    for (const key of pkg.party as string[]) {
      const name = pkg.entities.find((e: { key: string }) => e.key === key).name as string;
      const id = byName(name);
      const res = await page.request.post(`/api/campaigns/${campaignId}/commands`, { headers: { Origin: SIGN_IN_ORIGIN }, data: { commandId: randomUUID(), command: { type: 'PlaceEntity', entityId: id, locationId: locId } } });
      const body = await res.text();
      if (res.status() !== 200 && !body.includes('NO_EFFECT')) throw new Error(body);
    }
    await openSheet(page, 'Схватка');
    const sheet = page.locator('#sheet-encounter');
    const prepared = sheet.getByRole('region', { name: 'Подготовленные столкновения' });
    await expect(prepared).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: `${SHOTS}/${slug}-5-dm-prepared.png` });
    const start = prepared.getByRole('button', { name: new RegExp(`^(Начать|Start): ${enc.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
    await expect(start).toBeEnabled({ timeout: 20000 });
    await start.click();
    await expect(page.locator('#sheet-encounter').getByRole('heading', { name: /Управление схваткой|Encounter controls/ })).toBeVisible({ timeout: 20000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/${slug}-6-dm-board.png` });
    await player.waitForTimeout(2000);
    await player.screenshot({ path: `${SHOTS}/${slug}-7-player-board.png` });
    note('encounter started: ' + enc.title);
    // The quest log the party sees
    const quests = (await (await player.request.get(`/api/campaigns/${campaignId}/quests?perspective=PLAYER`)).json()) as { quests: unknown[] };
    note('journal quests at start: ' + quests.quests.length);
    await ctx.close();
  });
}

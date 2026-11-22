import { randomUUID } from 'node:crypto';

import type { PreparedEncounterListResponse } from '../../packages/contracts/src/index.ts';
import { expect, type Page } from '@playwright/test';

import { chooseLocation } from '../e2e/support/shell.ts';
import { SIGN_IN_ORIGIN } from '../e2e/support/sign-in.ts';
import { inspectScreen } from './visual.ts';

/** Play one of the prepared encounters on a disposable table. The test DM places the invited
 * character at the site and tells that character where they are. All subsequent reads use the
 * player's session, including the battlefield and figurine bytes. */
export async function checkBattle(
  dm: Page,
  player: Page,
  base: string,
  hero: string,
  slug: string,
) {
  const read = await dm.request.get(base + '/encounters/prepared');
  expect(read.ok()).toBe(true);
  const book = (await read.json()) as PreparedEncounterListResponse;
  const battle =
    book.encounters.find((e) => e.blocked === null && e.party.some((p) => p.entityId === hero)) ??
    book.encounters[0];
  if (!battle) throw Error('No prepared encounter in ' + slug);
  const headers = { origin: SIGN_IN_ORIGIN };
  const command = async (body: object) => {
    const r = await dm.request.post(base + '/commands', {
      headers,
      data: { commandId: randomUUID(), command: body },
    });
    expect((await r.json()) as object).toMatchObject({ status: 'accepted' });
  };
  if (!battle.party.some((p) => p.entityId === hero)) {
    await command({ type: 'PlaceEntity', entityId: hero, locationId: battle.location.entityId });
  }
  await command({
    type: 'AddKnowledge',
    knowledgeId: 'arrival-' + randomUUID(),
    scope: { kind: 'CHARACTER', characterId: hero },
    knowledgeType: 'FACT',
    statement: 'Вы прибыли на место встречи.',
    subjects: [battle.location.entityId],
    knownSince: null,
  });
  const start = await dm.request.post(
    base + '/encounters/prepared/' + battle.encounterId + '/start',
    { headers, data: { requestId: randomUUID() } },
  );
  expect(start.status()).toBe(200);
  await player.reload();
  await chooseLocation(player, battle.location.entityId, { sheet: 'Места', label: 'Место' });
  await expect(player.locator('img.board-map[src^="blob:"]')).toBeVisible({ timeout: 35_000 });
  const figures = player.locator(
    '.token img.medallion-figure[src^="blob:"], .token img.miniature-art[src^="blob:"]',
  );
  await expect(figures.first()).toBeVisible({ timeout: 35_000 });
  await inspectScreen(player, slug, 'battle');
}

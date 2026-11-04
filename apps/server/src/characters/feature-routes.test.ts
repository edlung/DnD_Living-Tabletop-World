import type { CharacterFeaturesResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { get, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../world-engine/ravenford-seed.ts';

/**
 * A character's class features in words (docs/adr/0056-characters-from-the-srd.md §4): the DM and
 * the character's player read them, in the campaign's language; another player does not.
 */
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';

describe('the features route', () => {
  it('gives every feature of the character’s class levels, to its player and the DM', async () => {
    const app = await ravenfordApp();
    const own = await get(
      app,
      `${BASE}/characters/${ELOWEN}/features?perspective=CHARACTER:${ELOWEN}`,
      TOKENS.player,
    );
    expect(own.statusCode).toBe(200);
    const body = own.json<CharacterFeaturesResponse>();
    const names = body.features.map((one) => `${one.classId}:${one.name}`);
    // Ranger 7 and Wizard 8: each class's features up to its level, none past it.
    expect(names).toContain('ranger:Favored Enemy');
    expect(names).toContain('wizard:Arcane Recovery');
    expect(names).not.toContain('wizard:Spell Mastery');
    expect(body.features.every((one) => one.blocks.length > 0 || one.name.length > 0)).toBe(true);
    const dm = await get(app, `${BASE}/characters/${ELOWEN}/features?perspective=DM`, TOKENS.dm);
    expect(dm.statusCode).toBe(200);
  });

  it('refuses another’s character, and speaks Russian in a Russian campaign', async () => {
    const app = await ravenfordApp(
      await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR),
    );
    const brann = await get(
      app,
      `${BASE}/characters/brann-ironvale/features?perspective=CHARACTER:${ELOWEN}`,
      TOKENS.player,
    );
    expect([403, 404]).toContain(brann.statusCode);
    const ru = (
      await get(app, `${BASE}/characters/${ELOWEN}/features?perspective=DM`, TOKENS.dm)
    ).json<CharacterFeaturesResponse>();
    expect(ru.features.find((one) => one.classId === 'wizard' && one.level === 1)).toMatchObject({
      language: 'ru',
    });
    expect(ru.features.map((one) => one.name)).toContain('Магическое восстановление');
  });
});

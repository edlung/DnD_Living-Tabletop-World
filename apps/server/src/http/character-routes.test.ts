import type { CharacterSheetResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ASHEN_CIRCLE_ID,
  ALL_SECRET_MARKERS,
  TOKENS,
  get,
  ravenfordApp,
  seededEngine,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

let app: FastifyInstance;
const BASE = '/campaigns/ravenford/entities';
const OWN = 'elowen-starwhisper';
const url = (id = OWN, perspective = 'PLAYER') => `${BASE}/${id}/sheet?perspective=${perspective}`;

beforeAll(async () => {
  const engine = await seededEngine();
  const sheet = (await engine.load('ravenford'))?.state.characterSheets.get(OWN);
  if (!sheet) throw new Error('Fixture is missing the sheet');
  for (const entityId of [OWN, 'mira-vale']) {
    const result = await engine.execute({
      campaignId: 'ravenford',
      commandId: `sheet-fixture-${entityId}`,
      actor: { kind: 'user', actorId: 'dm-ravenford' },
      command: {
        type: 'SetCharacterSheet',
        entityId,
        sheet: { ...sheet, concentration: { spellId: 'hunters-mark', targetId: ASHEN_CIRCLE_ID } },
      },
    });
    expect(result.status).toBe('accepted');
  }
  app = await ravenfordApp(engine);
});
afterAll(async () => {
  await app.close();
});

describe('authorized full character sheet', () => {
  it('returns own complete statistics and safe references; DM preview is identical', async () => {
    const response = await get(app, url(), TOKENS.player);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['vary']).toBe('Authorization');
    const body = response.json<CharacterSheetResponse>();
    expect(body).toMatchObject({
      perspective: `CHARACTER:${OWN}`,
      entity: { entityId: OWN, kind: 'character', name: 'Elowen Starwhisper' },
      sheet: {
        armorClass: 17,
        hitPoints: { max: 78, current: 78 },
        concentration: { spellId: 'hunters-mark' },
      },
    });
    expect(body.sheet.concentration).not.toHaveProperty('targetId');
    expect(Object.keys(body.sheet).sort()).toEqual(
      [
        'classes',
        'abilities',
        'hitPoints',
        'armorClass',
        'speedFt',
        'savingThrows',
        'skills',
        'fightingStyle',
        'attacksPerAction',
        'weapons',
        'spellSlots',
        'spellcasting',
        'conditions',
        'concentration',
      ].sort(),
    );
    expect(response.body).not.toContain(ASHEN_CIRCLE_ID);
    expect(ALL_SECRET_MARKERS.filter((marker) => response.body.includes(marker))).toEqual([]);
    const preview = await get(app, url(OWN, `CHARACTER:${OWN}`), TOKENS.dm);
    expect(preview.json()).toEqual(body);
  });

  it('makes sheets of known, hidden, and nonexistent other entities indistinguishable', async () => {
    const errors = [];
    for (const id of ['mira-vale', ASHEN_CIRCLE_ID, 'missing-entity']) {
      const response = await get(app, url(id), TOKENS.player);
      expect(response.statusCode).toBe(404);
      errors.push(JSON.stringify(withoutRequestId(response)));
    }
    expect(new Set(errors).size).toBe(1);
  });

  it('grants full canonical sheet data only under DM perspective', async () => {
    const response = await get(app, url('mira-vale', 'DM'), TOKENS.dm);
    expect(response.statusCode).toBe(200);
    expect(response.json<CharacterSheetResponse>().sheet.concentration?.targetId).toBe(
      ASHEN_CIRCLE_ID,
    );
    for (const perspective of ['PARTY', 'PUBLIC', 'NPC:mira-vale', `CHARACTER:${OWN}`]) {
      expect((await get(app, url('mira-vale', perspective), TOKENS.dm)).statusCode).toBe(404);
    }
    for (const perspective of ['PARTY', 'PUBLIC']) {
      expect((await get(app, url(OWN, perspective), TOKENS.player)).statusCode).toBe(404);
    }
  });

  it('rejects missing, duplicated, malformed, and extra perspective/query inputs', async () => {
    for (const query of [
      '',
      '?perspective=',
      '?perspective=bad',
      '?perspective=PLAYER&perspective=DM',
      '?perspective=PLAYER&actorId=dm-ravenford',
    ]) {
      expect((await get(app, `${BASE}/${OWN}/sheet${query}`, TOKENS.player)).statusCode).toBe(400);
    }
    expect((await get(app, url('Bad%20Id'), TOKENS.player)).statusCode).toBe(400);
  });

  it('preserves check order and refuses scope forgery before looking for a sheet', async () => {
    expect((await get(app, url(OWN, 'DM'))).statusCode).toBe(401);
    for (const id of ['mira-vale', 'missing-entity']) {
      for (const perspective of [
        'DM',
        'CHARACTER:mira-vale',
        'CHARACTER:missing-entity',
        'NPC:mira-vale',
      ]) {
        expect((await get(app, url(id, perspective), TOKENS.player)).statusCode).toBe(403);
      }
    }
    const outsider = await get(app, url(), TOKENS.outsider);
    const missing = await get(app, url().replace('ravenford', 'missing-campaign'), TOKENS.outsider);
    expect(outsider.statusCode).toBe(404);
    expect(withoutRequestId(outsider)).toEqual(withoutRequestId(missing));
  });
});

import type { RulesEntryResponse, RulesIndexResponse, RulesSectionResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOKENS, get, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * The rules reference at the table (docs/adr/0055-rules-reference-and-toolbox.md §2): the
 * glossary for the DM and the players, the toolbox for the DM alone, nothing for a stranger.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford/rules';

beforeAll(async () => {
  app = await ravenfordApp();
});
afterAll(async () => {
  await app.close();
});

describe('the rules reference', () => {
  it('gives a player the glossary and its entries, never the toolbox', async () => {
    const index = await get(app, BASE, TOKENS.player);
    expect(index.statusCode).toBe(200);
    const body = index.json<RulesIndexResponse>();
    expect(body.entries).toContainEqual({ entryId: 'prone', name: 'Prone', tag: 'Condition' });
    expect(body.abbreviations).toContainEqual({ abbreviation: 'DC', meaning: 'Difficulty Class' });
    expect(body.sections).toBeNull();
    const prone = await get(app, `${BASE}/glossary/prone`, TOKENS.player);
    expect(prone.json<RulesEntryResponse>()).toMatchObject({
      entry: { entryId: 'prone', tag: 'Condition' },
      language: 'en',
    });
    expect((await get(app, `${BASE}/sections/collapsing-roof`, TOKENS.player)).statusCode).toBe(
      403,
    );
  });

  it('gives the DM the toolbox: a trap with its trigger and tiers', async () => {
    const index = (await get(app, BASE, TOKENS.dm)).json<RulesIndexResponse>();
    expect(index.sections?.find((one) => one.sectionId === 'collapsing-roof')).toEqual({
      sectionId: 'collapsing-roof',
      part: 'toolbox',
      title: 'Collapsing Roof',
      level: 4,
      subtitle: 'Deadly Trap (Levels 1–4)',
    });
    const trap = (
      await get(app, `${BASE}/sections/collapsing-roof`, TOKENS.dm)
    ).json<RulesSectionResponse>();
    expect(trap.sections).toHaveLength(1);
    expect(trap.sections[0]?.blocks[0]).toEqual({
      kind: 'paragraph',
      head: 'Trigger:',
      text: 'A creature crosses a trip wire',
    });
    expect(trap.sections[0]?.blocks.some((block) => block.kind === 'table')).toBe(true);
    // A section comes with the sections under it: Traps, its parts, then every example trap.
    const traps = (
      await get(app, `${BASE}/sections/traps`, TOKENS.dm)
    ).json<RulesSectionResponse>();
    expect(traps.sections.map((one) => one.sectionId)).toEqual([
      'traps',
      'parts-of-a-trap',
      'example-traps',
      'collapsing-roof',
      'falling-net',
      'fire-casting-statue',
      'hidden-pit',
      'poisoned-darts',
      'poisoned-needle',
      'rolling-stone',
      'spiked-pit',
    ]);
  });

  it('finds nothing for a stranger or an entry that is not there', async () => {
    expect((await get(app, BASE)).statusCode).toBe(401);
    expect((await get(app, BASE, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, `${BASE}/glossary/no-such-rule`, TOKENS.dm)).statusCode).toBe(404);
    expect((await get(app, `${BASE}/glossary/Not%20An%20Id`, TOKENS.dm)).statusCode).toBe(400);
  });
});

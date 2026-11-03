import { beforeEach, describe, expect, it } from 'vitest';

import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import type { CharacterBuilderPort } from '../character/create.ts';
import {
  PLAYER,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { craftingView } from './crafting-view.ts';
import { purseCp } from './purse.ts';
import { carriedBy, possessionOf } from './records.ts';

/**
 * Crafting (docs/adr/0057-encounters-maps-loot.md §9; SRD 5.2.1): the hero, proficient with the
 * Herbalism Kit and carrying one, brews a Potion of Healing — 25 GP of materials, one day — and,
 * with the friend helping, makes six torches in half the time; a wizard's prepared Fire Bolt is
 * scribed on a scroll. No tool, no proficiency, a busy helper, too many helpers, too few coins or a
 * spell not prepared are refused; the DM's downtime does the work and the pack gets the thing.
 */
const sheet = rulesSeed.commands[0]?.sheet;
let harness: Harness;

const spells: CharacterBuilderPort = {
  build: () => ({ ok: false, problems: [] }),
  spell: (spellId) => (spellId === 'fire-bolt' ? { level: 0, name: 'Fire Bolt' } : null),
  // The rules' words for an entry: here a potion's, as a Russian table reads it.
  itemWords: (catalogId) =>
    catalogId === 'srd-potion-of-healing'
      ? { name: 'Зелье лечения', description: 'Вы восстанавливаете хиты.' }
      : null,
};
const create = (entityId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  type: 'CreateEntity',
  entityId,
  kind,
  name: entityId,
  existsSince: null,
  ...extra,
});
const at = (locationId: string) => ({ placement: { locationId, since: null } });
const grant = (itemId: string, catalogId: string, quantity = 1, holderId = 'hero') => [
  create(itemId, 'item'),
  { type: 'GrantItem', itemId, holderId, catalogId, quantity },
];
const tools = (entityId: string, list: string[], extra: Record<string, unknown> = {}) => ({
  type: 'SetCharacterSheet',
  entityId,
  sheet: { ...sheet, tools: list, ...extra },
});
const start = (command: Record<string, unknown>) =>
  harness.submit({ type: 'StartCrafting', characterId: 'hero', ...command }, { actor: PLAYER });
const reason = async (command: Record<string, unknown>) => {
  const result = await start(command);
  return result.status === 'rejected' ? result.message : result.status;
};

beforeEach(async () => {
  harness = createHarness({ characters: spells });
  await seedBasicWorld(harness);
  for (const command of [
    create('hero', 'character', at('square')),
    create('friend', 'character', at('square')),
    create('third', 'character', at('square')),
    { type: 'AssignCharacter', characterId: 'hero', playerActorId: PLAYER.actorId },
    tools('hero', ['srd-herbalism-kit', 'srd-carpenters-tools']),
    tools('friend', ['srd-carpenters-tools']),
    tools('third', ['srd-carpenters-tools']),
    ...grant('kit', 'srd-herbalism-kit'),
    ...grant('saw', 'srd-carpenters-tools'),
    ...grant('purse', 'gold-crown', 40),
  ])
    expectAccepted(await harness.submit(command));
});

describe('crafting', () => {
  it('brews a Potion of Healing in a day from 25 GP of materials', async () => {
    const before = purseCp(await harness.state(), 'hero');
    expectAccepted(await start({ catalogId: 'srd-potion-of-healing' }));
    let state = await harness.state();
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(purseCp(state, 'hero')).toBe(before - 2_500);
    const [project] = state.crafting.values();
    expect(project).toMatchObject({
      name: 'Зелье лечения',
      hoursNeeded: 8,
      hoursDone: 0,
      toolId: 'srd-herbalism-kit',
    });
    // A second project waits until this one is done.
    expect(await reason({ catalogId: 'srd-torch' })).toBe('BUSY');
    expectAccepted(await harness.submit({ type: 'WorkDowntime', days: 1 }));
    state = await harness.state();
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(state.crafting.size).toBe(0);
    const potion = carriedBy(state, 'hero').find(
      (itemId) => possessionOf(state, itemId)?.catalogId === 'srd-potion-of-healing',
    );
    expect(state.entities.get(potion ?? '')?.name).toBe('Зелье лечения');
  });

  it('shares the days among helpers, as many as the campaign allows', async () => {
    expect(await reason({ catalogId: 'srd-torch', helperIds: ['friend', 'third'] })).toBe(
      'TOO_MANY_HELPERS',
    );
    // A ladder, a mark's worth: a day's work for one; with the friend, done in one day of two.
    expectAccepted(await start({ catalogId: 'srd-ladder', helperIds: ['friend'] }));
    let state = await harness.state();
    const [projectId, project] = [...state.crafting][0] ?? [];
    expect(project?.helperIds).toEqual(['friend']);
    expect(project?.hoursNeeded).toBe(8);
    expectAccepted(
      await harness.submit({ type: 'WorkDowntime', days: 1, projectId: projectId ?? '' }),
    );
    state = await harness.state();
    expect(state.crafting.size).toBe(0);
    // The helper is free again; the campaign may allow two.
    expectAccepted(
      await harness.submit({
        type: 'SetCampaignOptions',
        options: {
          hitPointsAtLevel: 'choice',
          levelsBy: 'experience',
          carrying: 'shown',
          startingLevel: 1,
          craftingHelpers: 2,
        },
      }),
    );
    expectAccepted(
      await start({ catalogId: 'srd-torch', quantity: 6, helperIds: ['friend', 'third'] }),
    );
    expect([...(await harness.state()).crafting.values()][0]?.quantity).toBe(6);
  });

  it('refuses without the tool, its proficiency, a free helper, or the coins', async () => {
    expect(await reason({ catalogId: 'srd-longsword' })).toBe('NOT_PROFICIENT');
    expectAccepted(await harness.submit(tools('hero', ['srd-herbalism-kit', 'srd-smiths-tools'])));
    expect(await reason({ catalogId: 'srd-longsword' })).toBe('NO_TOOL');
    expect(await reason({ catalogId: 'srd-potion-of-healing', helperIds: ['friend'] })).toBe(
      'NOT_PROFICIENT',
    );
    expectRejected(await start({ catalogId: 'gold-crown' }), 'INVALID_ITEM');
    // Forty crowns do not buy a dozen potions' materials (300 GP).
    expect(await reason({ catalogId: 'srd-potion-of-healing', quantity: 12 })).toBe(
      'NOT_ENOUGH_COINS',
    );
  });

  it('scribes a prepared spell on a scroll, by Arcana', async () => {
    expect(await reason({ spellId: 'fire-bolt' })).toBe('NOT_PREPARED');
    expectAccepted(
      await harness.submit(
        tools('hero', ['srd-herbalism-kit'], {
          spellcasting: [{ source: 'wizard', ability: 'int', spells: ['fire-bolt'] }],
          skills: { proficient: ['arcana'], expertise: [] },
        }),
      ),
    );
    expectAccepted(await start({ spellId: 'fire-bolt' }));
    const state = await harness.state();
    const [project] = state.crafting.values();
    expect(project).toMatchObject({
      catalogId: 'srd-spell-scroll-cantrip',
      name: 'Spell Scroll (Cantrip): Fire Bolt',
      toolId: null,
      materialsCp: 1_500,
      hoursNeeded: 8,
    });
    // The DM sees every project; the hero its own.
    const access = resolvePerspective(state, PLAYER, { kind: 'PLAYER' });
    if (!access.ok) throw new Error(access.reason);
    expect(craftingView(state, access.perspective)?.projects).toHaveLength(1);
    expect(craftingView(state, access.perspective)?.busy).toBe(true);
  });

  it('is undone by the DM, coins and all, or given up', async () => {
    const before = await harness.state();
    const started = expectAccepted(await start({ catalogId: 'srd-potion-of-healing' }));
    const worked = expectAccepted(await harness.submit({ type: 'WorkDowntime', days: 1 }));
    // The finished potion first, then the start: the purse as it was.
    expectAccepted(
      await harness.submit({ type: 'UndoCommand', targetCommandId: worked.commandId }),
    );
    expectAccepted(
      await harness.submit({ type: 'UndoCommand', targetCommandId: started.commandId }),
    );
    let state = await harness.state();
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(state.crafting.size).toBe(0);
    expect(purseCp(state, 'hero')).toBe(purseCp(before, 'hero'));
    expectAccepted(await start({ catalogId: 'srd-potion-of-healing' }));
    const [projectId] = [...(await harness.state()).crafting.keys()];
    expectAccepted(
      await harness.submit(
        { type: 'AbandonCrafting', characterId: 'hero', projectId: projectId ?? '' },
        { actor: PLAYER },
      ),
    );
    state = await harness.state();
    expect(state.crafting.size).toBe(0);
    expectRejected(await harness.submit({ type: 'WorkDowntime', days: 1 }), 'NOT_PRESENT');
  });
});

import { describe, expect, it } from 'vitest';

import { proposableCommandSchema } from '../authoring/commands.ts';
import { kernelCommandSchema } from '../kernel/commands.ts';
import { campaignGenerationOutputSchemas } from './generation.ts';
import { campaignEntitySchema, toNpcManner } from './package.ts';

/**
 * An NPC's public manner of speech (docs/adr/0020-npc-intelligence.md, amendment 2026-11-14): one
 * line of plain text of at most 200 characters, on a package NPC and in the World Engine's
 * profile commands. The kind is checked by the plan and the World Engine (`MANNER_KIND`,
 * `INVALID_ENTITY_DEFINITION`); generation and AI authoring proposals carry none.
 */
const ORDERS = 'Speaks briefly, as if reading out an order.';
const PLAIN = {
  key: 'clerk',
  kind: 'npc',
  name: 'Clerk',
  description: 'A clerk.',
  status: 'active',
  existsSince: null,
};
const npc = (manner: unknown) => ({ ...PLAIN, manner });

describe('a package NPC manner of speech', () => {
  it('is one trimmed line of plain text, at most 200 characters', () => {
    expect(campaignEntitySchema.parse(npc(`  ${ORDERS} `)).manner).toBe(ORDERS);
    expect(campaignEntitySchema.parse(npc('x'.repeat(200))).manner).toHaveLength(200);
    for (const bad of ['x'.repeat(201), '', '   ', 'One line.\nTwo lines.', 'Tab\there', 'a b'])
      expect(campaignEntitySchema.safeParse(npc(bad)).success, JSON.stringify(bad)).toBe(false);
    expect(campaignEntitySchema.parse(PLAIN)).not.toHaveProperty('manner');
  });

  it('rides CreateEntity and UpdateEntityProfile, where an empty one clears it', () => {
    const create = {
      type: 'CreateEntity',
      kind: 'npc',
      name: 'Clerk',
      manner: ORDERS,
      existsSince: null,
    };
    expect(kernelCommandSchema.parse(create)).toMatchObject({ manner: ORDERS });
    expect(kernelCommandSchema.safeParse({ ...create, manner: '' }).success).toBe(false);
    expect(kernelCommandSchema.safeParse({ ...create, manner: 'x'.repeat(201) }).success).toBe(
      false,
    );
    for (const manner of [ORDERS, ''])
      expect(
        kernelCommandSchema.parse({ type: 'UpdateEntityProfile', entityId: 'clerk', manner }),
      ).toMatchObject({ manner });
    expect(
      kernelCommandSchema.safeParse({
        type: 'UpdateEntityProfile',
        entityId: 'clerk',
        manner: 'a\nb',
      }).success,
    ).toBe(false);
  });

  it('is never generated or proposed by a model', () => {
    expect(
      proposableCommandSchema.safeParse({
        type: 'CreateEntity',
        kind: 'npc',
        name: 'Clerk',
        manner: ORDERS,
        existsSince: null,
      }).success,
    ).toBe(false);
    expect(
      proposableCommandSchema.safeParse({
        type: 'UpdateEntityProfile',
        entityId: 'clerk',
        manner: ORDERS,
      }).success,
    ).toBe(false);
    const cast = campaignGenerationOutputSchemas.cast;
    const generated = (entity: object) => ({
      entities: [entity],
      party: ['clerk'],
      relationships: [],
      possessions: [],
      visuals: [],
    });
    expect(cast.safeParse(generated(PLAIN)).success).toBe(true);
    expect(cast.safeParse(generated(npc(ORDERS))).success).toBe(false);
  });
});

describe('toNpcManner, for campaign tools', () => {
  it('folds authored text to one line and keeps short text whole', () => {
    expect(toNpcManner('  Quietly,\n  evenly.  ')).toBe('Quietly, evenly.');
    expect(toNpcManner(undefined)).toBeUndefined();
    expect(toNpcManner(' \n ')).toBeUndefined();
  });

  it('cuts long text at the last sentence end that fits, else at a word', () => {
    const first = `${'a'.repeat(120)}.`;
    const long = `${first} ${'b'.repeat(150)}.`;
    expect(toNpcManner(long)).toBe(first);
    const words = Array.from({ length: 60 }, () => 'word').join(' ');
    const cut = toNpcManner(words) ?? '';
    expect(cut.length).toBeLessThanOrEqual(200);
    expect(cut.endsWith('word…')).toBe(true);
    for (const text of [long, words])
      expect(campaignEntitySchema.safeParse(npc(toNpcManner(text))).success).toBe(true);
  });
});

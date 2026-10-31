import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';
import { LanguageProvider } from '@ltw/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { FieldControl, type FieldControlProps } from './field-controls.tsx';
import {
  changeAt,
  initialValue,
  matchingBranch,
  packageFormSchema,
  referenceOptions,
  schemaBranches,
  valueAt,
  variantValue,
  type FormSchema,
} from './model.ts';

function property(schema: FormSchema, key: string): FormSchema {
  const field = schema.properties?.[key];
  if (!field) throw new Error(`SCHEMA_FIELD_MISSING:${key}`);
  return field;
}
function items(schema: FormSchema): FormSchema {
  if (!schema.items) throw new Error('SCHEMA_ITEMS_MISSING');
  return schema.items;
}
const empty = () => campaignPackageSchema.parse(initialValue(packageFormSchema, 'New preparation'));
function references(): CampaignPackage {
  const content = empty();
  content.entities = [
    {
      key: 'dock',
      kind: 'location',
      name: 'The Dock',
      description: 'Timber landing.',
      status: 'active',
      existsSince: null,
    },
    {
      key: 'hero',
      kind: 'character',
      name: 'Traveler',
      description: 'A ranger.',
      status: 'active',
      existsSince: null,
    },
    {
      key: 'keeper',
      kind: 'npc',
      name: 'Traveler',
      description: 'A keeper.',
      status: 'active',
      existsSince: null,
    },
    {
      key: 'guild',
      kind: 'faction',
      name: 'The Guild',
      description: 'Boat builders.',
      status: 'active',
      existsSince: null,
    },
  ];
  content.knowledge = [
    {
      key: 'river-fact',
      scope: { kind: 'PUBLIC' },
      knowledgeType: 'FACT',
      statement: 'The river is frozen.',
      subjects: ['dock'],
      knownSince: null,
      relations: [],
    },
  ];
  content.clues = [
    {
      key: 'copper-dust',
      entity: 'dock',
      method: 'inspect',
      statement: 'Copper dust marks the boards.',
      subjects: ['dock'],
    },
  ];
  content.quests = [
    {
      questId: 'main',
      title: 'Find the journal',
      activation: { subject: 'keeper', summary: 'The keeper asks for help.' },
      milestones: [
        { kind: 'reached', stage: 'arrive', locationId: 'dock', summary: 'Reach the landing.' },
        {
          kind: 'returned-to',
          stage: 'report',
          locationId: 'dock',
          after: 'arrive',
          summary: 'Return with the journal.',
        },
      ],
    },
    {
      questId: 'other',
      title: 'A separate request',
      activation: { subject: 'hero', summary: 'Another request.' },
      milestones: [
        {
          kind: 'reached',
          stage: 'unrelated',
          locationId: 'dock',
          summary: 'A different quest stage.',
        },
      ],
    },
  ];
  return campaignPackageSchema.parse(content);
}
function render(
  props: Pick<FieldControlProps, 'schema' | 'value' | 'field' | 'path'> &
    Partial<FieldControlProps>,
): string {
  return renderToStaticMarkup(
    createElement(LanguageProvider, {
      language: 'en',
      children: createElement(FieldControl, {
        content: references(),
        onChange: () => undefined,
        ...props,
      }),
    }),
  );
}
const schemaOf = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input' }) as FormSchema;

describe('public structured campaign form model', () => {
  it('starts with strict content shape without inventing prepared entities, identities or played progress', () => {
    const content = empty();
    expect(content.schemaVersion).toBe(1);
    expect(content.entities).toEqual([]);
    expect(content.party).toEqual([]);
    expect(content.quests).toEqual([]);
    expect(content.world.startLocation).toBeNull();
    expect(content.brief.partySize).toBeGreaterThanOrEqual(1);
    expect(content).not.toHaveProperty('identities');
    expect(content).not.toHaveProperty('events');
  });
  it('allocates fresh valid local keys for new rows and retains existing keys when editable content changes', () => {
    const entitySchema = items(property(packageFormSchema, 'entities'));
    const first = initialValue(entitySchema, 'First person'),
      second = initialValue(entitySchema, 'Second person');
    const content = campaignPackageSchema.parse({ ...empty(), entities: [first, second] });
    const a = content.entities[0],
      b = content.entities[1];
    if (!a || !b) throw new Error('ROWS_MISSING');
    expect(a.key).toMatch(/^[a-z][a-z0-9-]{0,47}$/);
    expect(b.key).not.toBe(a.key);
    const changed = changeAt(
      content,
      ['entities', 0, 'name'],
      'Owner chosen name',
    ) as CampaignPackage;
    expect(changed.entities[0]?.key).toBe(a.key);
    expect(changed.entities[1]).toBe(b);
    expect(content.entities[0]?.name).toBe('First person');
    expect(changed.world).toBe(content.world);
    const questSchema = items(property(packageFormSchema, 'quests'));
    const q1 = initialValue(questSchema, 'Quest'),
      q2 = initialValue(questSchema, 'Quest');
    expect(valueAt(q1, ['questId'])).toMatch(/^[a-z][a-z0-9-]{0,47}$/);
    expect(valueAt(q1, ['questId'])).not.toBe(valueAt(q2, ['questId']));
    const milestone = items(property(questSchema, 'milestones'));
    const firstStage = valueAt(initialValue(milestone, 'Stage'), ['stage']);
    expect(firstStage).toMatch(/^[a-z][a-z0-9-]{0,47}$/);
    expect(firstStage).not.toBe(valueAt(initialValue(milestone, 'Stage'), ['stage']));
  });
  it('builds every required spell-slot counter independently and chooses null for optional recorded state', () => {
    const sheet = property(items(property(packageFormSchema, 'entities')), 'sheet');
    const slots = initialValue(property(sheet, 'spellSlots'), 'Slots');
    expect(valueAt(slots, ['max'])).toEqual(Array(9).fill(0));
    expect(valueAt(slots, ['expended'])).toEqual(Array(9).fill(0));
    expect(valueAt(slots, ['max'])).not.toBe(valueAt(slots, ['expended']));
    expect(initialValue(property(sheet, 'concentration'), 'Concentration')).toBeNull();
    expect(initialValue(schemaOf(z.boolean()), 'Toggle')).toBe(false);
    const entitySchema = items(property(packageFormSchema, 'entities'));
    const generated = initialValue(entitySchema, 'New character');
    const content = campaignPackageSchema.parse({
      ...empty(),
      entities: [
        {
          ...(typeof generated === 'object' && generated !== null ? generated : {}),
          kind: 'character',
          sheet: initialValue(sheet, 'Character sheet'),
        },
      ],
    });
    expect(content.entities[0]?.sheet?.spellSlots.max).toEqual(Array(9).fill(0));
  });
  it('changes only the requested ancestors and removes an optional field without mutating or erasing sibling data', () => {
    const original = {
      world: { name: 'World' },
      entities: [
        {
          key: 'one',
          sheet: { hitPoints: { current: 4, max: 9 } },
          placement: { location: 'dock', since: null },
        },
        { key: 'two', description: 'Keep me' },
      ],
    };
    const edited = changeAt(
      original,
      ['entities', 0, 'sheet', 'hitPoints', 'current'],
      0,
    ) as typeof original;
    expect(edited).not.toBe(original);
    expect(edited.entities).not.toBe(original.entities);
    expect(edited.world).toBe(original.world);
    expect(edited.entities[1]).toBe(original.entities[1]);
    expect(valueAt(original, ['entities', 0, 'sheet', 'hitPoints', 'current'])).toBe(4);
    expect(valueAt(edited, ['entities', 0, 'sheet', 'hitPoints', 'current'])).toBe(0);
    const removed = changeAt(edited, ['entities', 0, 'placement'], undefined);
    expect(valueAt(removed, ['entities', 0, 'placement'])).toBeUndefined();
    expect(valueAt(removed, ['entities', 0, 'key'])).toBe('one');
    expect(valueAt(original, ['entities', 0, 'placement'])).toEqual({
      location: 'dock',
      since: null,
    });
    expect(valueAt(removed, ['entities', 99, 'name'])).toBeUndefined();
    expect(changeAt(original, [], 'Replacement')).toBe('Replacement');
  });
  it('selects tagged and nullable branches from data instead of assuming the first visible variant', () => {
    const union = schemaOf(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('WORLD_TRUTH') }),
        z.object({ kind: z.literal('NPC'), holder: z.string() }),
      ]),
    );
    expect(initialValue(union, 'Knowledge scope')).toEqual({ kind: 'WORLD_TRUTH' });
    expect(matchingBranch(union, { kind: 'NPC', holder: 'keeper' })).toBe(1);
    const nullable = schemaOf(z.string().nullable());
    const nullBranch = matchingBranch(nullable, null),
      valueBranch = matchingBranch(nullable, 'keeper');
    expect(nullBranch).not.toBe(valueBranch);
    expect(initialValue(nullable, 'Value')).toBeNull();
  });
  it('switches an existing milestone variant without replacing its hidden stage identity or mutating the old row', () => {
    const milestones = items(property(items(property(packageFormSchema, 'quests')), 'milestones'));
    const branch = schemaBranches(milestones).find(
      (entry) => entry.properties?.['kind']?.const === 'returned-to',
    );
    if (!branch) throw new Error('RETURN_VARIANT_MISSING');
    const previous = Object.freeze({
      kind: 'reached',
      stage: 'arrival-at-dock',
      locationId: 'dock',
      summary: 'The original arrival.',
    });
    const next = variantValue(branch, 'Return with evidence', 'milestones', previous);
    expect(next).toMatchObject({
      kind: 'returned-to',
      stage: 'arrival-at-dock',
      summary: 'Return with evidence',
      after: '',
    });
    expect(next).not.toBe(previous);
    expect(previous).toEqual({
      kind: 'reached',
      stage: 'arrival-at-dock',
      locationId: 'dock',
      summary: 'The original arrival.',
    });
    expect(valueAt(next, ['locationId'])).toBe('');
  });
  it('assigns independent fresh stage keys when a milestone variant starts a new row', () => {
    const milestones = items(property(items(property(packageFormSchema, 'quests')), 'milestones'));
    const branch = schemaBranches(milestones).find(
      (entry) => entry.properties?.['kind']?.const === 'hypothesized',
    );
    if (!branch) throw new Error('HYPOTHESIS_VARIANT_MISSING');
    const first = variantValue(branch, 'New possibility', 'milestones', null),
      second = variantValue(branch, 'New possibility', 'milestones', null);
    expect(valueAt(first, ['kind'])).toBe('hypothesized');
    expect(valueAt(first, ['stage'])).toMatch(/^[a-z][a-z0-9-]{0,47}$/);
    expect(valueAt(first, ['stage'])).not.toBe(valueAt(second, ['stage']));
    expect(valueAt(first, ['subject'])).toBe('');
    expect(first).not.toHaveProperty('locationId');
  });
  it('offers local references from the right collection and quest, preserving identity despite duplicate display names', () => {
    const content = references();
    for (const field of ['startLocation', 'parent', 'location', 'locationId'])
      expect(referenceOptions(content, field, ['world', field])).toEqual([
        { value: 'dock', label: 'The Dock' },
      ]);
    expect(referenceOptions(content, 'party', ['party'])).toEqual([
      { value: 'hero', label: 'Traveler' },
    ]);
    expect(
      referenceOptions(content, 'subjects', ['knowledge', 0, 'subjects'])
        ?.filter((entry) => entry.label === 'Traveler')
        .map((entry) => entry.value),
    ).toEqual(['hero', 'keeper']);
    expect(
      referenceOptions(content, 'knowledge', ['knowledge', 0, 'relations', 0, 'knowledge']),
    ).toEqual([{ value: 'river-fact', label: 'The river is frozen.' }]);
    expect(referenceOptions(content, 'clueKeys', ['situations', 0, 'clueKeys'])).toEqual([
      { value: 'copper-dust', label: 'Copper dust marks the boards.' },
    ]);
    expect(
      referenceOptions(content, 'after', ['quests', 0, 'milestones', 1, 'after'])?.map(
        (entry) => entry.value,
      ),
    ).toEqual(['arrive', 'report']);
    expect(referenceOptions(content, 'after', ['quests', 99, 'milestones', 0, 'after'])).toEqual(
      [],
    );
    expect(referenceOptions(content, 'name', ['entities', 0, 'name'])).toBeNull();
  });
});

describe('structured field rendering from public JSON Schema', () => {
  it('keeps identity fields hidden and draft language readable without a language mutation control', () => {
    for (const field of ['key', 'questId', 'stage', 'schemaVersion'])
      expect(
        render({
          schema: { type: 'string' },
          value: 'private-draft-identity',
          field,
          path: [field],
        }),
      ).toBe('');
    const html = render({
      schema: { type: 'string', enum: ['en', 'ru'] },
      value: 'en',
      field: 'language',
      path: ['world', 'language'],
    });
    expect(html).toContain('Draft language is fixed');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('<input');
  });
  it('renders bounded numeric controls without losing zero, optional absence or null', () => {
    const html = render({
      schema: schemaOf(z.number().int().min(0).max(20)),
      value: 0,
      field: 'current',
      path: ['entities', 0, 'sheet', 'hitPoints', 'current'],
    });
    expect(html).toContain('type="number"');
    expect(html).toContain('step="1"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="20"');
    expect(html).toContain('value="0"');
    const fraction = render({
      schema: schemaOf(z.number().min(-1).max(1)),
      value: 0.5,
      field: 'bonus',
      path: ['bonus'],
    });
    expect(fraction).toContain('step="any"');
    expect(fraction).toContain('value="0.5"');
    const absent = render({
      schema: schemaOf(z.string()),
      value: undefined,
      field: 'description',
      path: ['description'],
      optional: true,
    });
    expect(absent).toContain('Add Description');
    expect(absent).not.toContain('<textarea');
    expect(absent).not.toContain('<input');
    const nullable = render({
      schema: schemaOf(z.string().nullable()),
      value: null,
      field: 'parent',
      path: ['parent'],
    });
    expect(nullable).toContain('None recorded');
    expect(nullable).toContain('Value presence');
    expect(nullable).not.toContain('Unresolved reference');
  });
  it('preserves a dangling reference visibly and escapes owner text instead of silently choosing another object', () => {
    const content = references();
    const location = content.entities[0];
    if (!location) throw new Error('LOCATION_MISSING');
    location.name = '<img src=x onerror=alert(1)>';
    const html = render({
      content,
      schema: { type: 'string' },
      value: 'removed-location',
      field: 'startLocation',
      path: ['world', 'startLocation'],
    });
    expect(html).toContain('value="removed-location" selected=""');
    expect(html).toContain('Unresolved reference');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('value="hero"');
    expect(html).not.toContain('value="keeper"');
  });
  it('renders the chosen union fields and keeps a protected value disabled', () => {
    const scope = schemaOf(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('WORLD_TRUTH') }),
        z.object({ kind: z.literal('NPC'), holder: z.string() }),
      ]),
    );
    const html = render({
      schema: scope,
      value: { kind: 'NPC', holder: 'keeper' },
      field: 'scope',
      path: ['knowledge', 0, 'scope'],
    });
    expect(html).toContain('Variant');
    expect(html).toContain('value="keeper" selected=""');
    const protectedField = render({
      schema: schemaOf(z.string().max(4000)),
      value: 'Protected narrative',
      field: 'description',
      path: ['entities', 0, 'description'],
      isLocked: () => true,
    });
    expect(protectedField).toContain('disabled=""');
    expect(protectedField).toContain('Protected narrative');
  });
});

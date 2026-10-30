import { campaignPackageSchema, type CampaignPackage } from '@ltw/contracts';
import { LanguageProvider, translate } from '@ltw/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import '../../i18n/ru-workshop-scenario.ts';
import '../../i18n/ru-access.ts';
import { ScenarioBrowser } from './browser.tsx';
import { editableValues, patchScenarioFields } from './edit-fields.tsx';
import { FIELD_LABELS } from './fields.ts';
import { buildScenarioIndex, nearestScenarioPath } from './graph.ts';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('MISSING_TEST_OBJECT');
  return value;
}

/** Local test specimen: no domain/runtime seed enters the browser bundle. */
function specimen(): CampaignPackage {
  return campaignPackageSchema.parse({
    schemaVersion: 1,
    brief: {
      intent: 'find the missing bell',
      setting: 'coastal village',
      tone: 'mystery',
      duration: 'one evening',
      partySize: 1,
      partyLevel: 1,
      include: ['choices'],
      exclude: ['railroading'],
    },
    world: {
      name: 'Bell mystery',
      worldName: 'Grey coast',
      language: 'en',
      startsAt: 0,
      startLocation: 'pier',
      weather: 'fog',
      opening: 'A bell rings beneath the water.',
    },
    entities: [
      {
        key: 'pier',
        name: 'Old pier',
        kind: 'location',
        description: 'weathered timber',
        status: 'active',
        existsSince: null,
        location: { type: 'site', parent: null },
      },
      {
        key: 'keeper',
        name: 'Bell keeper',
        kind: 'npc',
        description: 'hides the tide chart',
        status: 'active',
        existsSince: null,
        placement: { location: 'pier', since: null },
        statBlock: {
          armorClass: 12,
          hitPoints: { max: 9, current: 8 },
          speedFt: 30,
          abilities: { str: 10, dex: 12, con: 10, int: 14, wis: 13, cha: 12 },
          savingThrows: { str: 0, dex: 1, con: 0, int: 2, wis: 1, cha: 1 },
          initiativeBonus: 1,
          attacksPerAction: 1,
          attacks: [
            {
              attackId: 'staff',
              name: 'Oak staff',
              kind: 'melee',
              bonus: 2,
              reachFt: 5,
              damage: { count: 1, sides: 6, bonus: 0, type: 'bludgeoning' },
            },
          ],
          spells: [
            {
              spellId: 'frost-note',
              name: 'Frost note',
              level: 1,
              castingTime: 'action',
              rangeFt: 30,
              components: ['V'],
              effect: {
                kind: 'save',
                ability: 'wis',
                dc: 12,
                damage: { count: 1, sides: 4, bonus: 0, type: 'cold' },
                halfOnSuccess: true,
              },
            },
          ],
          conditions: [],
        },
      },
      {
        key: 'bell',
        name: 'Sunken bell',
        kind: 'item',
        description: 'a cracked bronze bell',
        status: 'active',
        existsSince: null,
        placement: { location: 'pier', since: null },
      },
      {
        key: 'scout',
        name: 'Tide scout',
        kind: 'character',
        description: 'prepared character',
        status: 'active',
        existsSince: null,
        placement: { location: 'pier', since: null },
        sheet: {
          classes: [{ classId: 'ranger', level: 1, subclass: 'tide walker' }],
          abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 14, cha: 10 },
          hitPoints: { max: 11, current: 11 },
          armorClass: 14,
          speedFt: 30,
          savingThrows: ['str', 'dex'],
          skills: { proficient: ['perception', 'survival'], expertise: [] },
          fightingStyle: 'archery',
          attacksPerAction: 1,
          weapons: ['longbow'],
          spellSlots: { max: [2, 0, 0, 0, 0, 0, 0, 0, 0], expended: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
          spellcasting: [
            {
              source: 'ranger',
              ability: 'wis',
              spells: ['hunters-mark'],
              freeCasts: { spellId: 'hunters-mark', perLongRest: 2, used: 1 },
            },
          ],
          conditions: [],
          concentration: { spellId: 'hunters-mark', targetId: 'keeper' },
          deathSaves: { successes: 1, failures: 0 },
        },
      },
    ],
    party: ['scout'],
    relationships: [{ npc: 'keeper', attitude: 'WARY' }],
    knowledge: [
      {
        key: 'truth',
        scope: { kind: 'WORLD_TRUTH' },
        knowledgeType: 'SECRET',
        statement: 'The keeper hid the bell.',
        subjects: ['bell', 'keeper'],
        knownSince: null,
        relations: [],
      },
      {
        key: 'witness',
        scope: { kind: 'NPC', holder: 'keeper' },
        knowledgeType: 'TESTIMONY',
        statement: 'I heard it at dawn.',
        subjects: ['bell'],
        attributedTo: 'keeper',
        knownSince: null,
        relations: [{ type: 'CONTRADICTS', knowledge: 'truth' }],
        disclosure: 'GUARDED',
      },
      {
        key: 'rumor',
        scope: { kind: 'PUBLIC' },
        knowledgeType: 'RUMOR',
        statement: 'A sea spirit took it.',
        subjects: ['bell'],
        knownSince: null,
        relations: [],
      },
    ],
    clues: [
      {
        key: 'rope',
        entity: 'pier',
        method: 'investigation',
        dc: 12,
        statement: 'Bronze dust marks the rope.',
        subjects: ['bell'],
      },
    ],
    conflicts: [
      {
        key: 'silence',
        title: 'Keep the secret',
        description: 'keeper fears the council',
        actors: ['keeper'],
        stakes: 'trust of the village',
      },
    ],
    situations: [
      {
        key: 'arrival',
        title: 'At low tide',
        location: 'pier',
        description: 'the ropes are exposed',
        participants: ['keeper'],
        clueKeys: ['rope'],
        hooks: ['a sound below'],
        approaches: ['ask', 'dive'],
        developments: [
          { if: 'the keeper is reassured', then: 'the keeper may reveal the hiding place' },
        ],
      },
    ],
    encounters: [
      {
        key: 'defense',
        title: 'Defend the pier',
        location: 'pier',
        trigger: 'the rope is cut',
        battlefield: {
          width: 5,
          height: 4,
          difficult: [{ x: 1, y: 1 }],
          cover: [{ x: 2, y: 2, level: 'half' }],
        },
        combatants: [
          { entity: 'scout', side: 'party', position: { x: 0, y: 0 } },
          { entity: 'keeper', side: 'hostile', position: { x: 3, y: 3 } },
        ],
      },
    ],
    quests: [
      {
        questId: 'recover',
        title: 'Recover the bell',
        activation: { subject: 'bell', summary: 'learn of the loss' },
        milestones: [
          { kind: 'reached', stage: 'arrive', locationId: 'pier', summary: 'reach the pier' },
          {
            kind: 'told-by',
            stage: 'question',
            informant: 'keeper',
            subject: 'bell',
            summary: 'hear the keeper',
          },
          {
            kind: 'returned-to',
            stage: 'return',
            locationId: 'pier',
            after: 'arrive',
            summary: 'return with the bell',
          },
        ],
      },
    ],
    visuals: [
      {
        entity: 'pier',
        purpose: 'battle-map',
        description: 'timber over a grey sea',
        style: 'muted watercolor',
      },
    ],
    firstSession: ['begin at the pier'],
    laterOutline: ['the council may react'],
  });
}

describe('scenario navigation', () => {
  it('connects opening, situations, clues, objects, holder knowledge and truth bidirectionally', () => {
    const index = buildScenarioIndex(specimen());
    const targets = (path: string) => index.links.get(path)?.map((link) => link.target);
    expect(targets('world')).toContain('situations.arrival');
    expect(targets('situations.arrival')).toContain('clues.rope');
    expect(targets('clues.rope')).toContain('entities.bell');
    expect(targets('entities.bell')).toContain('knowledge.witness');
    expect(targets('knowledge.witness')).toEqual(
      expect.arrayContaining(['entities.keeper', 'knowledge.truth']),
    );
    expect(targets('knowledge.truth')).toContain('knowledge.witness');
    expect(index.links.get('clues.rope')).toContainEqual({
      target: 'knowledge.rumor',
      label: 'Knowledge on the same subject',
    });
    expect(index.links.get('clues.rope')?.some((link) => link.label === 'SUPPORTS')).toBe(false);
  });

  it('links placement, concentration, attitudes, quest branches, combat and visual briefs', () => {
    const index = buildScenarioIndex(specimen());
    expect(index.links.get('entities.keeper')?.map((link) => link.target)).toEqual(
      expect.arrayContaining([
        'entities.pier',
        'entities.scout',
        'relationships',
        'encounters.defense',
        'quests.recover',
      ]),
    );
    expect(index.links.get('entities.pier')?.map((link) => link.target)).toContain(
      'visuals.pier.battle-map',
    );
    expect(index.byPath.get('entities.pier')?.title).toBe('Old pier');
    expect(index.byPath.get('visuals.pier.battle-map')?.title).toBe('Old pier');
  });

  it('resolves field, array, identity and party findings to the nearest existing object', () => {
    const index = buildScenarioIndex(specimen());
    for (const path of [
      'knowledge.witness.scope.holder',
      'knowledge[1].scope.holder',
      'content.knowledge.1.statement',
      'identities.knowledge.witness',
    ])
      expect(nearestScenarioPath(index, path)).toBe('knowledge.witness');
    expect(nearestScenarioPath(index, 'party.scout.sheet')).toBe('entities.scout');
    expect(nearestScenarioPath(index, 'visuals.pier.battle-map.entity')).toBe(
      'visuals.pier.battle-map',
    );
    expect(nearestScenarioPath(index, 'unknown.deep.field')).toBe('world');
  });

  it('keeps every duplicate-key row and duplicate visual/quest reachable with distinct human names', () => {
    const content = specimen();
    content.entities.push({ ...must(content.entities[1]), description: 'second keeper' });
    content.knowledge.push({ ...must(content.knowledge[1]), statement: 'second statement' });
    content.quests.push({ ...must(content.quests[0]) });
    content.visuals.push({ ...must(content.visuals[0]), description: 'second visual' });
    const index = buildScenarioIndex(content);
    expect(index.byPath.size).toBe(index.nodes.length);
    expect(nearestScenarioPath(index, 'entities.4.description')).toBe('entities.keeper~2');
    expect(nearestScenarioPath(index, 'knowledge.3.statement')).toBe('knowledge.witness~2');
    expect(nearestScenarioPath(index, 'quests.1.milestones')).toBe('quests.recover~2');
    expect(nearestScenarioPath(index, 'visuals.1.style')).toBe('visuals.pier.battle-map~2');
    expect(index.byPath.get('entities.keeper')?.title).not.toBe(
      index.byPath.get('entities.keeper~2')?.title,
    );
    const node = must(index.byPath.get('entities.keeper~2'));
    const updated = patchScenarioFields(content, node, { description: 'corrected second keeper' });
    expect(updated?.entities[1]?.description).toBe('hides the tide chart');
    expect(updated?.entities[4]?.description).toBe('corrected second keeper');
    expect(index.links.get(node.path)?.map((link) => link.target)).toContain('entities.pier');
  });

  it('never creates a fake node for a missing reference', () => {
    const content = specimen();
    must(content.situations[0]).clueKeys.push('missing-clue');
    const index = buildScenarioIndex(content);
    expect(index.byPath.has('clues.missing-clue')).toBe(false);
    expect(
      index.links.get('situations.arrival')?.some((link) => link.target === 'clues.missing-clue'),
    ).toBe(false);
  });
});

describe('scenario corrections', () => {
  it('changes only allowed fields while preserving keys, references and the original package', () => {
    const content = specimen();
    const node = must(buildScenarioIndex(content).byPath.get('knowledge.witness'));
    expect(editableValues(node)).toEqual({
      statement: 'I heard it at dawn.',
      disclosure: 'GUARDED',
    });
    const next = patchScenarioFields(content, node, {
      statement: 'I heard it at dusk.',
      disclosure: 'WILLING',
    });
    expect(next?.knowledge[1]).toMatchObject({
      key: 'witness',
      statement: 'I heard it at dusk.',
      disclosure: 'WILLING',
      scope: { kind: 'NPC', holder: 'keeper' },
    });
    expect(content.knowledge[1]?.statement).toBe('I heard it at dawn.');
    expect(patchScenarioFields(content, node, { key: 'replacement' })).toBeNull();
    expect(patchScenarioFields(content, node, { statement: '' })).toBeNull();
  });

  it('offers willingness only for NPC-held knowledge and validates names', () => {
    const content = specimen();
    const index = buildScenarioIndex(content);
    expect(editableValues(must(index.byPath.get('knowledge.truth')))).not.toHaveProperty(
      'disclosure',
    );
    expect(
      patchScenarioFields(content, must(index.byPath.get('entities.keeper')), {
        name: 'x'.repeat(121),
      }),
    ).toBeNull();
  });
});

describe('structured scenario reading', () => {
  const html = (content: CampaignPackage, path: string, save = false) =>
    renderToStaticMarkup(
      createElement(ScenarioBrowser, {
        content,
        assessment: null,
        selectedPath: path,
        onSelect: () => undefined,
        ...(save ? { onSave: () => Promise.resolve('saved' as const) } : {}),
      }),
    );

  it('exposes complete mechanics, knowledge, battlefield, quest and outline fields without raw JSON', () => {
    const content = specimen();
    const sheet = html(content, 'entities.scout');
    for (const label of [
      'Character sheet',
      'Classes',
      'Abilities',
      'Spell slots',
      'Free casts',
      'Death saves',
      'Concentration',
    ])
      expect(sheet).toContain(label);
    expect(sheet).toContain('tide walker');
    expect(html(content, 'world')).toContain('Day 1 · 00:00');
    const stats = html(content, 'entities.keeper');
    for (const label of [
      'Oak staff',
      'Frost note',
      'Casting time',
      'Half damage on success',
      'Initiative bonus',
      'Damage',
    ])
      expect(stats).toContain(label);
    const knowledge = html(content, 'knowledge.witness');
    for (const label of ['Testimony', 'NPC knowledge', 'Guarded', 'Contradicts', 'Known since'])
      expect(knowledge).toContain(label);
    const encounter = html(content, 'encounters.defense');
    for (const label of [
      'Battlefield',
      'Width in squares',
      'Difficult ground',
      'Cover',
      'Combatants',
      'Position',
    ])
      expect(encounter).toContain(label);
    const quest = html(content, 'quests.recover');
    for (const label of [
      'Activation',
      'Milestones',
      'Informant',
      'After milestone',
      'reach the pier',
    ])
      expect(quest).toContain(label);
    expect(html(content, 'situations.arrival')).toContain('Then it may happen');
    expect(html(content, 'firstSession')).toContain('begin at the pier');
    expect(html(content, 'laterOutline')).toContain('the council may react');
    expect(html(content, 'visuals.pier.battle-map')).toContain('muted watercolor');
    expect(sheet).not.toContain('entities.scout');
    expect(quest).not.toContain('quests.recover');
    expect(sheet).not.toContain('<pre');
  });

  it('renders proposals read-only and offers corrections only when the caller supplies saving', () => {
    const content = specimen();
    expect(html(content, 'entities.keeper')).not.toContain('Edit fields');
    expect(html(content, 'entities.keeper', true)).toContain('Edit fields');
  });

  it('localizes all declared field labels and shows Russian types and possibilities', () => {
    expect(Object.values(FIELD_LABELS).filter((label) => translate('ru', label) === label)).toEqual(
      [],
    );
    const content = specimen();
    const rendered = renderToStaticMarkup(
      createElement(LanguageProvider, {
        language: 'ru',
        children: createElement(ScenarioBrowser, {
          content,
          assessment: null,
          selectedPath: 'knowledge.witness',
          onSelect: () => undefined,
        }),
      }),
    );
    expect(rendered).toContain('Свидетельство');
    expect(rendered).toContain('Скрывает');
    expect(rendered).toContain('Носитель знания');
  });
});

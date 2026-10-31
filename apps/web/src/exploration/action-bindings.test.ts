import { CONTEXT_ACTION_IDS, kernelCommandSchema, type ContextAction } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { commandFor } from './action-bindings.ts';

const actor = 'elowen-starwhisper';
const target = 'selected-object';
const action = (id: ContextAction['id'], extra: Partial<ContextAction> = {}): ContextAction => ({
  id,
  legal: true,
  relevance: 'low',
  ...extra,
});

describe('exploration option bindings', () => {
  it.each([
    ['inspect', 'inspect'],
    ['investigation_check', 'investigation'],
    ['perception_check', 'perception'],
  ] as const)('binds %s to the selected object and correct rules-resolved method', (id, method) => {
    const command = commandFor(action(id), actor, target);
    expect(command).toEqual({
      type: 'ExamineEntity',
      characterId: actor,
      entityId: target,
      method,
    });
    expect(kernelCommandSchema.safeParse(command).success).toBe(true);
  });

  it('keeps the conversation target distinct from a server-provided topic or evidence ID', () => {
    expect(
      commandFor(
        action('ask_about', {
          topic: { entityId: 'known-subject', kind: 'item', name: 'Known subject' },
        }),
        actor,
        'mira-vale',
      ),
    ).toEqual({
      type: 'AskAbout',
      characterId: actor,
      npcId: 'mira-vale',
      topicId: 'known-subject',
    });
    expect(
      commandFor(
        action('show_evidence', { evidence: { knowledgeId: 'held-evidence' } }),
        actor,
        'orin-stonebeard',
      ),
    ).toEqual({
      type: 'ShowEvidence',
      characterId: actor,
      npcId: 'orin-stonebeard',
      knowledgeId: 'held-evidence',
    });
    expect(commandFor(action('enter_location'), actor, 'old-trade-road')).toEqual({
      type: 'EnterLocation',
      characterId: actor,
      locationId: 'old-trade-road',
    });
  });

  it.each([
    [{ kind: 'free' }, 'free'],
    [{ kind: 'slot', slotLevel: 3 }, { slotLevel: 3 }],
  ] as const)(
    'uses the exact advertised Detect Magic cost, without targeting the selected object',
    (cost, using) => {
      const command = commandFor(action('detect_magic', { cost }), actor, target);
      expect(command).toEqual({
        type: 'CastSpell',
        combatantId: actor,
        spellId: 'detect-magic',
        using,
      });
      expect(command).not.toHaveProperty('targetId');
      expect(command).not.toHaveProperty('point');
      expect(kernelCommandSchema.safeParse(command).success).toBe(true);
    },
  );

  it('binds picking an item up to its own character and the selected item', () => {
    const command = commandFor(action('take_item'), actor, target);
    expect(command).toEqual({ type: 'TakeItem', characterId: actor, itemId: target });
    expect(kernelCommandSchema.safeParse(command).success).toBe(true);
  });

  it('does not invent a topic, record, payment, actor, or target when one is missing', () => {
    for (const option of [
      action('ask_about'),
      action('show_evidence'),
      action('detect_magic'),
      action('ask_about', { topic: { entityId: '', kind: 'item', name: null } }),
      action('show_evidence', { evidence: { knowledgeId: '' } }),
    ]) {
      expect(commandFor(option, actor, target)).toBeNull();
    }
    expect(commandFor(action('inspect'), '', target)).toBeNull();
    expect(commandFor(action('inspect'), actor, '')).toBeNull();
  });

  it('never binds unavailable options, combat actions, or interactions needing another flow', () => {
    const bound = new Set<ContextAction['id']>([
      'inspect',
      'investigation_check',
      'perception_check',
      'ask_about',
      'show_evidence',
      'enter_location',
      'detect_magic',
      'take_item',
    ]);
    for (const id of CONTEXT_ACTION_IDS) {
      const complete = action(id, {
        topic: { entityId: 'known-subject', kind: 'item', name: 'Known' },
        evidence: { knowledgeId: 'held-evidence' },
        cost: { kind: 'free' },
      });
      expect(
        commandFor({ ...complete, legal: false, reason: 'NOT_PRESENT' }, actor, target),
      ).toBeNull();
      if (!bound.has(id)) expect(commandFor(complete, actor, target), id).toBeNull();
    }
  });

  it('does not promote relevance to authority or mix response annotations into a command', () => {
    const low = action('inspect', {
      relevance: 'low',
      hints: ['RANGE_NOT_TRACKED'],
      resolution: { moveRequiredFt: 10 },
      area: { affected: [] },
    });
    expect(commandFor(low, actor, target)).toEqual({
      type: 'ExamineEntity',
      characterId: actor,
      entityId: target,
      method: 'inspect',
    });
    expect(commandFor({ ...low, legal: false, relevance: 'high' }, actor, target)).toBeNull();
  });
});

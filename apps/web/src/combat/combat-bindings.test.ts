import { kernelCommandSchema, type ContextAction, type EncounterView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { combatCommandFor, ignoreReaction } from './combat-bindings.ts';

const actor = 'elowen-starwhisper';
const target = { entityId: 'creature-10fb59d4', position: { x: 8, y: 4 } };
const action = (id: ContextAction['id'], extra: Partial<ContextAction> = {}): ContextAction => ({
  id,
  legal: true,
  relevance: 'low',
  ...extra,
});
const encounter = (window: boolean): EncounterView => ({
  encounterId: 'e1',
  round: 1,
  currentCombatantId: actor,
  order: [actor],
  battlefield: { width: 16, height: 12, difficult: [], cover: [] },
  combatants: [],
  reactionWindow: window
    ? {
        windowId: 'w1',
        trigger: {
          kind: 'spell',
          caster: { entityId: 'creature-10fb59d4', kind: 'creature', name: null },
          components: ['V', 'S'],
        },
        candidates: [{ entityId: actor, response: 'pending' }],
        choices: ['counterspell', 'ignore'],
      }
    : null,
});

describe('combat option bindings', () => {
  it('binds the longbow attack to the selected combatant', () => {
    const command = combatCommandFor(action('longbow_attack'), actor, target, encounter(false));
    expect(command).toEqual({
      type: 'Attack',
      combatantId: actor,
      attackId: 'longbow',
      targetId: 'creature-10fb59d4',
    });
    expect(kernelCommandSchema.safeParse(command).success).toBe(true);
  });

  it('centres Fireball on the selected square and keeps the server-priced cost', () => {
    const command = combatCommandFor(
      action('fireball', { cost: { kind: 'slot', slotLevel: 3 }, hints: ['ALLY_IN_AREA'] }),
      actor,
      target,
      encounter(false),
    );
    expect(command).toEqual({
      type: 'CastSpell',
      combatantId: actor,
      spellId: 'fireball',
      using: { slotLevel: 3 },
      point: { x: 8, y: 4 },
    });
    expect(kernelCommandSchema.safeParse(command).success).toBe(true);
  });

  it('counters only the caster of the open window, using the window ID', () => {
    const counter = action('counterspell', { cost: { kind: 'slot', slotLevel: 3 } });
    const command = combatCommandFor(counter, actor, target, encounter(true));
    expect(command).toEqual({
      type: 'UseReaction',
      combatantId: actor,
      windowId: 'w1',
      reaction: 'counterspell',
      using: { slotLevel: 3 },
    });
    expect(kernelCommandSchema.safeParse(command).success).toBe(true);
    expect(combatCommandFor(counter, actor, target, encounter(false))).toBeNull();
    expect(
      combatCommandFor(counter, actor, { ...target, entityId: 'someone-else' }, encounter(true)),
    ).toBeNull();
  });

  it('never binds an illegal option or an unknown one', () => {
    expect(
      combatCommandFor(
        action('longbow_attack', { legal: false, reason: 'OUT_OF_RANGE' }),
        actor,
        target,
        encounter(false),
      ),
    ).toBeNull();
    expect(combatCommandFor(action('talk'), actor, target, encounter(false))).toBeNull();
  });

  it('declines a window with the ignore command', () => {
    const command = ignoreReaction(actor, 'w1');
    expect(command).toEqual({ type: 'DeclineReaction', combatantId: actor, windowId: 'w1' });
    expect(kernelCommandSchema.safeParse(command).success).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import type { KernelEvent } from '../kernel/events.ts';
import { facts, footprintOf } from '../kernel/facts.ts';
import { namedEntityIds } from './named-entities.ts';

/**
 * A narrative combat record's fold requires every creature it names to exist,
 * so its footprint reads each of them (G03-H05): undo can never remove a
 * creature a standing record names, whatever premises that record's command
 * recorded. Checked for every narrative type, with the IDs its payload holds.
 */
const RECORDS: [KernelEvent['type'], Record<string, unknown>][] = [
  ['AttackPerformed', { attackerId: 'elowen', targetId: 'raider', attackId: 'longbow' }],
  ['SpellCast', { casterId: 'elowen', spellId: 'hunters-mark', targetId: 'raider' }],
  ['DamageApplied', { targetId: 'raider', sourceId: 'elowen' }],
  ['HealingApplied', { targetId: 'seren', sourceId: 'elowen' }],
  ['SavingThrowRolled', { creatureId: 'shaman' }],
  ['ConditionApplied', { targetId: 'seren' }],
  ['DeathSaveRolled', { characterId: 'seren' }],
];

describe('narrative combat records read every creature they name', () => {
  it.each(RECORDS)('%s', (type, payload) => {
    const named = namedEntityIds(payload);
    expect(named.length).toBeGreaterThan(0);
    expect(named).not.toContain('longbow');
    expect(named).not.toContain('hunters-mark');
    const { reads } = footprintOf({ type, payload } as KernelEvent);
    for (const entityId of named) expect(reads).toContain(facts.entity(entityId));
  });
});

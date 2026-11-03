import type { HitPoints, SpellEffect } from '@ltw/contracts';
import type { DraftEvent } from '@ltw/domain';

import {
  conditionsOf,
  hitPoints,
  vitalsEvent,
  withAllHitPoints,
  withConditions,
  withSheet,
  type Vitals,
} from './vitals.ts';

type Revive = Extract<SpellEffect, { kind: 'revive' }>;

/** −4 to D20 Tests for one back from the dead, 1 less at each Long Rest (SRD 5.2.1). */
const ORDEAL = 4;

/**
 * The dead returned to life (docs/adr/0056-characters-from-the-srd.md §5): alive again with
 * 1 Hit Point, or all of them with what lowered its maximum mended; its death saves and
 * Unconscious gone; poisons neutralized, and magical contagions cured, where the spell says;
 * coming back an ordeal for some.
 */
export function revivedVitals(v: Vitals, effect: Revive): Vitals {
  const hp = hitPoints(v);
  const all = effect.hitPoints === 'all';
  const kept = hp.reducedBy !== undefined && !all && hp.max - hp.reducedBy >= 1;
  const next: HitPoints = {
    max: hp.max,
    current: all ? hp.max : 1,
    ...(kept ? { reducedBy: hp.reducedBy } : {}),
  };
  const cures = effect.cures === 'none' ? [] : (['poisoned'] as const);
  const awake = withConditions(withAllHitPoints(v, next), [], ['unconscious', ...cures]);
  return withSheet(awake, (sheet) => {
    const back = { ...sheet };
    delete back.deathSaves;
    if (effect.cures === 'poison-contagion') delete back.contagions;
    if (effect.ordeal) back.ordeal = ORDEAL;
    return back;
  });
}

/**
 * What the World Engine records: alive again, its vitals, and Unconscious gone. One with no sheet
 * or stat block (a story's NPC) only lives again: its numbers are the DM's.
 */
export function revivalEvents(
  entityId: string,
  before: Vitals | null,
  after: Vitals | null,
): DraftEvent[] {
  return [
    { type: 'EntityStatusChanged', payload: { entityId, from: 'dead', to: 'active' } },
    ...(!before || !after ? [] : changedVitals(before, after)),
  ];
}

function changedVitals(before: Vitals, after: Vitals): DraftEvent[] {
  return [
    ...(conditionsOf(before).includes('unconscious')
      ? [
          {
            type: 'ConditionApplied' as const,
            payload: {
              targetId: after.entityId,
              condition: 'unconscious' as const,
              applied: false,
              cause: 'revived',
            },
          },
        ]
      : []),
    vitalsEvent(after),
  ];
}

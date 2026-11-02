import type { KernelEvent } from '../kernel/events.ts';
import { entityChecked, facts } from '../kernel/fact-keys.ts';
import type { Footprint } from '../kernel/facts.ts';
import { namedEntityIds } from './named-entities.ts';

type CombatEvent = Extract<
  KernelEvent,
  {
    type:
      | 'CombatStarted'
      | 'TurnStarted'
      | 'CombatantUpdated'
      | 'CombatEnded'
      | 'CombatOrderChanged'
      | 'StatBlockSet'
      | 'ActionTaken'
      | 'AttackPerformed'
      | 'WeaponMasteryApplied'
      | 'SpellCast'
      | 'DamageApplied'
      | 'HealingApplied'
      | 'HitPointsAdjusted'
      | 'SavingThrowRolled'
      | 'ConditionApplied'
      | 'DeathSaveRolled';
  }
>;

/**
 * Combat footprints (docs/adr/0015-combat-engine.md, ADR 0043 §2): a fight's start and the DM's
 * change of its order read every combatant they hold; turns and updates read and write the
 * encounter (undo unwinds a fight in reverse); narrative records read every creature they name.
 */
export function combatFootprint(event: CombatEvent): Footprint {
  const clock = facts.clock();
  switch (event.type) {
    case 'CombatStarted':
      // Every combatant: its existence, status, placement, and its sheet or stat block.
      return {
        reads: [
          clock,
          facts.encounter(),
          ...event.payload.combatants.flatMap((c) => [
            ...entityChecked(c.entityId),
            facts.entityPlacement(c.entityId),
            facts.sheet(c.entityId),
            facts.statBlock(c.entityId),
          ]),
        ],
        writes: [facts.encounter()],
      };
    case 'TurnStarted':
    case 'CombatantUpdated':
    case 'CombatEnded':
      // Combat is strictly sequential: undo unwinds it in reverse order (ADR 0015).
      return { reads: [clock, facts.encounter()], writes: [facts.encounter()] };
    case 'CombatOrderChanged':
      // The DM's change of a running fight (ADR 0043 §2): every combatant of the new order, as
      // a fight's start reads them (a joining creature's place, sheet or stat block included).
      return {
        reads: [
          clock,
          facts.encounter(),
          ...event.payload.combatants.flatMap((c) => [
            ...entityChecked(c.entityId),
            facts.entityPlacement(c.entityId),
            facts.sheet(c.entityId),
            facts.statBlock(c.entityId),
          ]),
        ],
        writes: [facts.encounter()],
      };
    case 'StatBlockSet':
      // Authoring is refused for a combatant, so it relied on the encounter as it was (Gate 03).
      return {
        reads: [clock, facts.encounter(), facts.entity(event.payload.entityId)],
        writes: [facts.statBlock(event.payload.entityId)],
      };
    case 'ActionTaken':
    case 'AttackPerformed':
    case 'WeaponMasteryApplied':
    case 'SpellCast':
    case 'DamageApplied':
    case 'HealingApplied':
    case 'HitPointsAdjusted':
    case 'SavingThrowRolled':
    case 'ConditionApplied':
    case 'DeathSaveRolled':
      // Narrative records: their fold needs every creature they name (G03-H05).
      return {
        reads: [clock, facts.encounter(), ...namedEntityIds(event.payload).map(facts.entity)],
        writes: [],
      };
  }
}

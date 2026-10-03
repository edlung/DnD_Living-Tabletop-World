import type { KernelCommandType, PlayerOutcome } from '@ltw/contracts';

import type { KernelEvent } from '../kernel/events.ts';

/**
 * The player-visible outcome of an accepted player command
 * (docs/adr/0013-investigation.md §6), derived from its events. Never
 * carries clue IDs, DCs, claims, the NPC records a testimony came from, or
 * records the engine created in other scopes (ADR 0014 §4).
 */
export function playerOutcome(
  commandType: KernelCommandType,
  events: readonly KernelEvent[],
): PlayerOutcome | undefined {
  switch (commandType) {
    case 'EnterLocation': {
      const placed = events.find((event) => event.type === 'EntityPlaced');
      return placed ? { kind: 'EnterLocation', locationId: placed.payload.locationId } : undefined;
    }
    case 'AskAbout':
      return {
        kind: 'AskAbout',
        shared: events.flatMap((event) =>
          event.type === 'InformationShared' ? [event.payload.knowledgeId] : [],
        ),
      };
    case 'ExamineEntity': {
      const examined = events.find((event) => event.type === 'EvidenceExamined');
      if (!examined) return undefined;
      const roll = examined.payload.roll;
      return {
        kind: 'ExamineEntity',
        roll: roll ? { d20: roll.d20, modifier: roll.modifier, total: roll.total } : null,
        discovered: examined.payload.revealed.map(({ knowledgeId }) => knowledgeId),
      };
    }
    case 'FormHypothesis': {
      const formed = events.find(
        (event) =>
          event.type === 'KnowledgeAssigned' && event.payload.knowledgeType === 'HYPOTHESIS',
      );
      return formed?.type === 'KnowledgeAssigned'
        ? { kind: 'FormHypothesis', knowledgeId: formed.payload.knowledgeId }
        : undefined;
    }
    default:
      return combatOutcome(commandType, events);
  }
}

/** Combat outcomes (ADR 0015): the acting player's own rolls and their results, never the target's vitals. */
function combatOutcome(
  commandType: KernelCommandType,
  events: readonly KernelEvent[],
): PlayerOutcome | undefined {
  switch (commandType) {
    case 'MoveCombatant': {
      const moved = events.findLast((event) => event.type === 'CombatantUpdated');
      return moved?.type === 'CombatantUpdated'
        ? { kind: 'MoveCombatant', position: { ...moved.payload.combatant.position } }
        : undefined;
    }
    case 'Attack': {
      const attack = events.find((event) => event.type === 'AttackPerformed');
      if (attack?.type !== 'AttackPerformed') return undefined;
      const damage = events.find(
        (event) =>
          event.type === 'DamageApplied' && event.payload.targetId === attack.payload.targetId,
      );
      return {
        kind: 'Attack',
        d20: [...attack.payload.rolls],
        attackTotal: attack.payload.total,
        hit: attack.payload.hit,
        critical: attack.payload.critical,
        damage: damage?.type === 'DamageApplied' ? damage.payload.amount : null,
      };
    }
    case 'CastSpell': {
      const cast = events.find((event) => event.type === 'SpellCast');
      if (cast?.type !== 'SpellCast') return undefined;
      const targets = new Set<string>();
      for (const event of events) {
        if (event.type === 'DamageApplied' || event.type === 'HealingApplied')
          targets.add(event.payload.targetId);
        if (event.type === 'SavingThrowRolled' && event.payload.purpose === 'spell')
          targets.add(event.payload.creatureId);
        if (event.type === 'AttackPerformed') targets.add(event.payload.targetId);
      }
      const find = <T extends KernelEvent['type']>(type: T, id: string, key: string) =>
        events.find(
          (event) => event.type === type && (event.payload as Record<string, unknown>)[key] === id,
        ) as Extract<KernelEvent, { type: T }> | undefined;
      return {
        kind: 'CastSpell',
        spellId: cast.payload.spellId,
        results: [...targets].map((targetId) => {
          const save = events.find(
            (e) =>
              e.type === 'SavingThrowRolled' &&
              e.payload.purpose === 'spell' &&
              e.payload.creatureId === targetId,
          );
          const attack = find('AttackPerformed', targetId, 'targetId');
          const damage = find('DamageApplied', targetId, 'targetId');
          const healing = find('HealingApplied', targetId, 'targetId');
          return {
            targetId,
            saved: save?.type === 'SavingThrowRolled' ? save.payload.success : null,
            hit: attack ? attack.payload.hit : null,
            damage: damage ? damage.payload.amount : null,
            healed: healing ? healing.payload.amount : null,
          };
        }),
        discovered: events.flatMap((event) =>
          event.type === 'EvidenceExamined' ? event.payload.revealed.map((r) => r.knowledgeId) : [],
        ),
      };
    }
    case 'EndTurn': {
      const started = events.find((event) => event.type === 'TurnStarted');
      return started?.type === 'TurnStarted'
        ? {
            kind: 'EndTurn',
            nextCombatantId: started.payload.combatantId,
            round: started.payload.round,
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

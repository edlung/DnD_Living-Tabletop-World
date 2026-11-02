import type { KernelCommandType, PlayerOutcome } from '@ltw/contracts';

import type { KernelEvent } from '../kernel/events.ts';

const ITEM_ACTIONS = {
  EquipItem: 'equip',
  UnequipItem: 'unequip',
  UseItem: 'use',
  GiveItem: 'give',
  DropItem: 'drop',
  TakeItem: 'take',
} as const;

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
    case 'ShowEvidence': {
      const shown = events.find((event) => event.type === 'EvidenceShown');
      return shown?.type === 'EvidenceShown'
        ? { kind: 'ShowEvidence', shown: shown.payload.knowledgeId }
        : undefined;
    }
    case 'InsightCheck': {
      const checked = events.find((event) => event.type === 'InsightChecked');
      if (checked?.type !== 'InsightChecked') return undefined;
      const { roll, inferenceId } = checked.payload;
      return {
        kind: 'InsightCheck',
        roll: { d20: roll.d20, modifier: roll.modifier, total: roll.total },
        inferred: inferenceId === null ? [] : [inferenceId],
      };
    }
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
    case 'EquipItem':
    case 'UnequipItem':
    case 'UseItem':
    case 'GiveItem':
    case 'DropItem':
    case 'TakeItem': {
      const moved = events.find((event) => 'itemId' in event.payload);
      return moved && 'itemId' in moved.payload
        ? { kind: 'Item', action: ITEM_ACTIONS[commandType], itemId: moved.payload.itemId }
        : undefined;
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
    // The readied attack is an attack, made with the Reaction (ADR 0046 §5).
    case 'Attack':
    case 'MakeReadiedAttack': {
      const attack = attackOf(events);
      if (!attack) return undefined;
      // Its window opened: what comes of the roll waits for the answer (ADR 0046 §3).
      const waiting = events.some((event) => event.type === 'ReactionWindowOpened');
      return { kind: 'Attack', ...attack, ...(waiting ? { awaitingReaction: true as const } : {}) };
    }
    case 'CastSpell': {
      const opened = events.find((event) => event.type === 'ReactionWindowOpened');
      const trigger =
        opened?.type === 'ReactionWindowOpened' ? opened.payload.window.trigger : null;
      if (trigger?.kind === 'spell') {
        // Suspended in a reaction window (ADR 0016): nothing happened yet.
        const { spellId } = trigger;
        return { kind: 'CastSpell', spellId, results: [], discovered: [], awaitingReaction: true };
      }
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
    case 'UseReaction': {
      const used = events.find((event) => event.type === 'ReactionUsed');
      if (used?.type !== 'ReactionUsed') return undefined;
      const { windowId, reaction } = used.payload;
      const countered = events.some(
        (event) => event.type === 'ReactionWindowResolved' && event.payload.outcome === 'countered',
      );
      // An opportunity attack or a reroll says how it went, as an attack does (ADR 0046 §2–3);
      // Uncanny Dodge the damage still taken, Hellish Rebuke the damage it dealt.
      const attack =
        reaction === 'opportunity-attack' || reaction === 'inspiration-reroll'
          ? attackOf(events)
          : null;
      const reactorId = used.payload.reactorId;
      const dealt = events.find(
        (event) =>
          event.type === 'DamageApplied' &&
          (reaction === 'uncanny-dodge'
            ? event.payload.targetId === reactorId
            : reaction === 'hellish-rebuke' && event.payload.sourceId === reactorId),
      );
      return {
        kind: 'UseReaction',
        windowId,
        reaction,
        countered,
        ...(attack
          ? {
              attack: {
                attackTotal: attack.attackTotal,
                hit: attack.hit,
                critical: attack.critical,
                damage: attack.damage,
              },
            }
          : {}),
        ...(dealt?.type === 'DamageApplied' ? { damage: dealt.payload.amount } : {}),
      };
    }
    case 'DeclineReaction': {
      const declined = events.find((event) => event.type === 'ReactionDeclined');
      return declined?.type === 'ReactionDeclined'
        ? {
            kind: 'DeclineReaction',
            windowId: declined.payload.windowId,
            trigger: declined.payload.trigger ?? 'spell',
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

/** The first attack among a command's events: its roll and the damage it did to its target. */
function attackOf(events: readonly KernelEvent[]) {
  const attack = events.find((event) => event.type === 'AttackPerformed');
  if (attack?.type !== 'AttackPerformed') return null;
  const { targetId } = attack.payload;
  const damage = events.find(
    (event) => event.type === 'DamageApplied' && event.payload.targetId === targetId,
  );
  // What the weapon's mastery did to the target (docs/adr/0047-weapons.md §2).
  const used = events.find(
    (event) => event.type === 'WeaponMasteryApplied' && event.payload.targetId === targetId,
  );
  const mastery =
    used?.type === 'WeaponMasteryApplied'
      ? {
          kind: used.payload.mastery,
          ...(used.payload.from && used.payload.to
            ? {
                pushedFt:
                  5 *
                  Math.max(
                    Math.abs(used.payload.to.x - used.payload.from.x),
                    Math.abs(used.payload.to.y - used.payload.from.y),
                  ),
              }
            : {}),
          ...(used.payload.mastery === 'topple'
            ? {
                toppled: events.some(
                  (event) =>
                    event.type === 'ConditionApplied' &&
                    event.payload.targetId === targetId &&
                    event.payload.cause === 'topple-mastery',
                ),
              }
            : {}),
        }
      : null;
  return {
    d20: [...attack.payload.rolls],
    attackTotal: attack.payload.total,
    hit: attack.payload.hit,
    critical: attack.payload.critical,
    damage: damage?.type === 'DamageApplied' ? damage.payload.amount : null,
    ...(mastery ? { mastery } : {}),
  };
}

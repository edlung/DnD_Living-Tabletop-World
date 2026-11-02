import {
  DM_HAND_COMMAND_TYPES,
  FIGHT_CHANGE_COMMAND_TYPES,
  type DmHandEntry,
  type EntityRef,
} from '@ltw/contracts';
import type { CampaignSnapshot, StoredCommand } from '@ltw/domain';

/**
 * The DM's changes by hand in the DM's history (docs/adr/0043-dm-screen.md §1): damage or healing
 * as the World Engine recorded it (the amounts after the rules), a condition, Heroic Inspiration,
 * or a ruling — a party memory the DM recorded with a reason. The reason is the stored command's.
 */
const HAND_TYPES: ReadonlySet<string> = new Set(
  // A creature handed to a player (ADR 0044 §7) is listed as any other command of the DM's.
  [...DM_HAND_COMMAND_TYPES, ...FIGHT_CHANGE_COMMAND_TYPES].filter(
    (type) => type !== 'CommandCreature',
  ),
);

/** Whether a stored command of the DM's is a change by hand. */
export function isHandCommand(stored: StoredCommand): boolean {
  const { command } = stored;
  if (HAND_TYPES.has(stored.commandType)) return true;
  return command.type === 'RecordMemory' && command.reason !== undefined;
}

/** The entry's change and reason; null when what was recorded is not the change (never, accepted). */
export function handChange(
  snapshot: CampaignSnapshot,
  stored: StoredCommand,
): Pick<DmHandEntry, 'change' | 'reason'> | null {
  const { command } = stored;
  const ref = (entityId: string): EntityRef => {
    const entity = snapshot.state.entities.get(entityId);
    return entity
      ? { entityId: entity.entityId, kind: entity.kind, name: entity.name }
      : { entityId, kind: 'character', name: entityId };
  };
  const events = snapshot.history.slice(stored.firstSequence - 1, stored.lastSequence);
  switch (command.type) {
    case 'AdjustHitPoints': {
      const recorded = events.find((event) => event.type === 'HitPointsAdjusted');
      if (recorded?.type !== 'HitPointsAdjusted') return null;
      const { change, amount, damageType, hpBefore, hpAfter } = recorded.payload;
      return {
        change: {
          kind: 'hit-points',
          target: ref(command.targetId),
          change,
          amount,
          damageType: damageType ?? null,
          hpBefore,
          hpAfter,
        },
        reason: command.reason,
      };
    }
    case 'SetCondition':
      return {
        change: {
          kind: 'condition',
          target: ref(command.targetId),
          condition: command.condition,
          applied: command.applied,
        },
        reason: command.reason,
      };
    case 'SetInspiration':
      return {
        change: {
          kind: 'inspiration',
          target: ref(command.characterId),
          inspired: command.inspired,
        },
        reason: command.reason,
      };
    case 'SetExhaustion':
      return {
        change: { kind: 'exhaustion', target: ref(command.targetId), level: command.level },
        reason: command.reason,
      };
    case 'SetLight':
      return { change: { kind: 'light', ambient: command.ambient }, reason: null };
    case 'AddCombatant':
    case 'AddObject':
    case 'RemoveCombatant':
    case 'DelayTurn':
    case 'SetInitiative': {
      const recorded = events.find((event) => event.type === 'CombatOrderChanged');
      if (recorded?.type !== 'CombatOrderChanged') return null;
      const { change, entityId, combatants } = recorded.payload;
      // A mount taking its rider's place is the rider's move, not the DM's hand (ADR 0049 §10).
      if (change === 'mounted') return null;
      const total =
        change === 'initiative'
          ? (combatants.find((c) => c.entityId === entityId)?.initiative.total ?? null)
          : null;
      return {
        change: { kind: 'fight', change, combatant: ref(entityId), total },
        reason: command.type === 'RemoveCombatant' ? command.reason : null,
      };
    }
    case 'RecordMemory':
      return command.reason === undefined
        ? null
        : {
            change: {
              kind: 'ruling',
              summary: command.summary,
              characters: (command.participants ?? []).map(ref),
            },
            reason: command.reason,
          };
    default:
      return null;
  }
}

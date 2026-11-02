import type {
  DieSides,
  RollEntry,
  RollGroup,
  RolledDie,
  RollSubject,
  StatBlock,
  WeaponId,
} from '@ltw/contracts';
import type { RecordedEvent, WorldState } from '@ltw/domain';
import { WEAPONS } from '@ltw/rules';

/**
 * The dice the World Engine rolled, read back from the campaign's events (Stage 510): attacks and
 * their damage, spells' damage and healing, checks, saving throws, death saves and initiative.
 * Each entry names its roller; `rollFeed` decides who may see it. No entry carries a target, a DC,
 * a clue or anything the outcome of the action did not already tell its roller.
 */
export interface WorldRoll extends RollEntry {
  /** The creature whose roll this is (a character or a monster); null for none. */
  readonly rollerId: string | null;
  /** A roll only the DM may see: a monster's, a non-party creature's save, initiative. */
  readonly dmOnly: boolean;
}

/** How far back the feed looks: the latest events only (a session's worth and more). */
export const WORLD_ROLL_SCAN = 800;

/** Dice of the slice's spells (packages/rules/src/effects.ts): Fireball d6, Healing Word d4. */
const SPELL_DICE: Readonly<
  Record<string, { readonly damage?: DieSides; readonly healing?: DieSides }>
> = {
  fireball: { damage: 6 },
  'healing-word': { healing: 4 },
};

const asSides = (value: number): DieSides | null =>
  ([4, 6, 8, 10, 12, 20, 100] as const).find((sides) => sides === value) ?? null;

/** The d20s of a test: with Advantage the lower is dropped, with Disadvantage the higher. */
function d20s(rolls: readonly number[], advantage: boolean, disadvantage: boolean): RolledDie[] {
  const [first, second] = rolls;
  if (
    rolls.length !== 2 ||
    first === undefined ||
    second === undefined ||
    advantage === disadvantage
  ) {
    return rolls.map((value) => ({ sides: 20, value }));
  }
  const keepFirst = advantage ? first >= second : first <= second;
  return [
    keepFirst ? { sides: 20, value: first } : { sides: 20, value: first, dropped: true },
    keepFirst ? { sides: 20, value: second, dropped: true } : { sides: 20, value: second },
  ];
}

/** The sides of each damage die of an attack, in the order the engine rolled them. */
function attackDamageSides(
  state: WorldState,
  attackerId: string,
  attackId: string,
  count: number,
  critical: boolean,
): (DieSides | null)[] {
  const block: StatBlock | undefined = state.statBlocks.get(attackerId);
  const monster = block?.attacks.find((attack) => attack.attackId === attackId);
  if (monster) {
    const base = monster.damage.count * (critical ? 2 : 1);
    const extra = monster.advantageDamage;
    return Array.from({ length: count }, (_, index) =>
      index < base ? monster.damage.sides : (extra?.sides ?? null),
    );
  }
  const weapon = (WEAPONS as Readonly<Record<string, (typeof WEAPONS)[WeaponId] | undefined>>)[
    attackId
  ];
  if (!weapon) return Array.from({ length: count }, () => null);
  // The weapon's dice, then Hunter's Mark's d6 (doubled alike on a critical hit).
  const base = weapon.damageDice.count * (critical ? 2 : 1);
  return Array.from({ length: count }, (_, index) =>
    index < base ? asSides(weapon.damageDice.sides) : 6,
  );
}

/** Dice with their sides, or none when any side is unknown (the total still shows). */
function diceOf(rolls: readonly number[], sides: readonly (DieSides | null)[]): RolledDie[] {
  if (sides.some((side) => side === null) || sides.length !== rolls.length) return [];
  return rolls.map((value, index) => ({ sides: sides[index] as DieSides, value }));
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** Events of one command, in order. */
function byCommand(events: readonly RecordedEvent[]): RecordedEvent[][] {
  const groups: RecordedEvent[][] = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (last?.[0]?.causation.commandId === event.causation.commandId) last.push(event);
    else groups.push([event]);
  }
  return groups;
}

const entry = (
  event: RecordedEvent,
  rollerId: string | null,
  subject: RollSubject,
  groups: RollGroup[],
  dmOnly: boolean,
): WorldRoll => ({
  rollId: `world:${String(event.sequence)}`,
  roller: null,
  rollerId,
  subject,
  groups,
  hidden: dmOnly,
  dmOnly,
  at: event.recordedAt,
});

/** The rolls of one command's events. */
function rollsOf(events: readonly RecordedEvent[], state: WorldState): WorldRoll[] {
  const rolls: WorldRoll[] = [];
  // A party member's roll is the player's; anyone else's (monsters, NPCs) is the DM's.
  const party = (id: string) => state.entities.get(id)?.kind === 'character';
  for (const [index, event] of events.entries()) {
    switch (event.type) {
      case 'AttackPerformed': {
        const { attackerId, targetId, attackId, rolls: d20, modifier, total } = event.payload;
        const groups: RollGroup[] = [
          {
            purpose: 'attack',
            dice: d20s(d20, event.payload.advantage, event.payload.disadvantage),
            modifier,
            total,
            ...(event.payload.critical ? { critical: true as const } : {}),
            result: event.payload.hit ? 'hit' : 'miss',
          },
        ];
        const damage = events
          .slice(index + 1)
          .find(
            (later) =>
              later.type === 'DamageApplied' &&
              later.payload.sourceId === attackerId &&
              later.payload.targetId === targetId,
          );
        if (damage?.type === 'DamageApplied' && event.payload.hit) {
          const sides = attackDamageSides(
            state,
            attackerId,
            attackId,
            damage.payload.rolls.length,
            event.payload.critical,
          );
          groups.push({
            purpose: 'damage',
            dice: diceOf(damage.payload.rolls, sides),
            modifier: damage.payload.amount - sum(damage.payload.rolls),
            total: damage.payload.amount,
          });
        }
        rolls.push(
          entry(
            event,
            attackerId,
            { kind: 'attack', attack: attackId },
            groups,
            !party(attackerId),
          ),
        );
        break;
      }
      case 'SpellCast': {
        const { casterId, spellId } = event.payload;
        const later = events.slice(index + 1);
        const damage = later.find(
          (other) => other.type === 'DamageApplied' && other.payload.sourceId === casterId,
        );
        const healing = later.find(
          (other) => other.type === 'HealingApplied' && other.payload.sourceId === casterId,
        );
        const monsterSpell = state.statBlocks
          .get(casterId)
          ?.spells.find((spell) => spell.spellId === spellId);
        const damageSides =
          SPELL_DICE[spellId]?.damage ??
          (monsterSpell ? asSides(monsterSpell.effect.damage.sides) : null);
        const groups: RollGroup[] = [];
        if (damage?.type === 'DamageApplied') {
          groups.push({
            purpose: 'damage',
            dice: diceOf(
              damage.payload.rolls,
              damage.payload.rolls.map(() => damageSides),
            ),
            modifier: 0,
            total: sum(damage.payload.rolls),
          });
        }
        if (healing?.type === 'HealingApplied') {
          const sides = SPELL_DICE[spellId]?.healing ?? null;
          groups.push({
            purpose: 'healing',
            dice: diceOf(
              healing.payload.rolls,
              healing.payload.rolls.map(() => sides),
            ),
            modifier: healing.payload.amount - sum(healing.payload.rolls),
            total: healing.payload.amount,
          });
        }
        if (groups.length > 0) {
          rolls.push(entry(event, casterId, { kind: 'spell', spellId }, groups, !party(casterId)));
        }
        break;
      }
      case 'SavingThrowRolled': {
        const { creatureId, ability, rolls: d20, modifier, total, success } = event.payload;
        rolls.push(
          entry(
            event,
            creatureId,
            { kind: 'save', ability },
            [
              {
                purpose: 'save',
                dice: d20.map((value) => ({ sides: 20, value })),
                modifier,
                total,
                result: success ? 'success' : 'failure',
                // A condition failed it outright: no die was rolled (ADR 0045 §1).
                ...(d20.length === 0 ? { autoFail: true as const } : {}),
              },
            ],
            !party(creatureId),
          ),
        );
        break;
      }
      case 'DeathSaveRolled': {
        const { characterId, roll, outcome } = event.payload;
        rolls.push(
          entry(
            event,
            characterId,
            { kind: 'death-save' },
            [
              {
                purpose: 'death-save',
                dice: [{ sides: 20, value: roll }],
                modifier: 0,
                total: roll,
                result: outcome === 'failure' || outcome === 'dead' ? 'failure' : 'success',
              },
            ],
            false,
          ),
        );
        break;
      }
      case 'ActionTaken': {
        // An action's check (docs/adr/0045-conditions-and-actions.md §5): Search, Study, Hide…
        const { combatantId, check } = event.payload;
        if (!check) break;
        rolls.push(
          entry(
            event,
            combatantId,
            { kind: 'skill', skill: check.skill },
            [
              {
                purpose: 'check',
                dice: check.rolls.map((value) => ({ sides: 20, value })),
                modifier: check.modifier,
                total: check.total,
                ...(check.success === undefined
                  ? {}
                  : { result: check.success ? ('success' as const) : ('failure' as const) }),
              },
            ],
            !party(combatantId),
          ),
        );
        break;
      }
      case 'InsightChecked':
      case 'EvidenceExamined': {
        const roll = event.payload.roll;
        if (roll === null) break;
        const skill = event.type === 'InsightChecked' ? 'insight' : event.payload.method;
        if (skill !== 'insight' && skill !== 'investigation' && skill !== 'perception') break;
        rolls.push(
          entry(
            event,
            event.payload.characterId,
            { kind: 'skill', skill },
            [
              {
                purpose: 'check',
                dice: [{ sides: 20, value: roll.d20 }],
                modifier: roll.modifier,
                total: roll.total,
              },
            ],
            false,
          ),
        );
        break;
      }
      case 'CombatStarted': {
        // Initiative rolls are DM data (docs/adr/0015-combat-engine.md §6).
        const groups: RollGroup[] = event.payload.combatants.map((combatant) => ({
          purpose: 'initiative',
          dice: [{ sides: 20, value: combatant.initiative.roll }],
          modifier: combatant.initiative.modifier,
          total: combatant.initiative.total,
        }));
        rolls.push(entry(event, null, { kind: 'initiative' }, groups, true));
        break;
      }
      default:
        break;
    }
  }
  return rolls;
}

/** Every roll in the latest events, oldest first. */
export function worldRolls(history: readonly RecordedEvent[], state: WorldState): WorldRoll[] {
  return byCommand(history.slice(-WORLD_ROLL_SCAN)).flatMap((events) => rollsOf(events, state));
}

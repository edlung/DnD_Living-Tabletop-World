import type { KernelCommandType } from '@ltw/contracts';
import {
  foldDrafts,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type DraftEvent,
  type WorldState,
} from '@ltw/domain';
import { druidLevel, formOf, incapacitatedBy, squaresOf, takesForm } from '@ltw/rules';

import { fitsOnField, occupant } from './battlefield.ts';
import type { FeatureEffect, FeatureUse } from './feature-effects.ts';
import type { CombatReason } from './legality.ts';

/**
 * Wild Shape in play (docs/adr/0056-characters-from-the-srd.md §5): the Druid takes a Beast form
 * its level allows — in a fight only where the form's size fits — with Temporary Hit Points equal
 * to its Druid level, or leaves it with a Bonus Action. The form's numbers are the vitals' while
 * it is worn (`vitals.ts`); it ends when the Druid is Incapacitated or dies, takes another form, or
 * finishes a Long Rest.
 */
const effect = (sheet: FeatureEffect['sheet']): FeatureEffect => ({ sheet, events: [], rolls: [] });

/** Whether a creature of `size` fits where the record stands, clear of others. */
function fitsWhereItStands(
  state: WorldState,
  record: CombatantRecord,
  size: Parameters<typeof squaresOf>[0]['size'],
): boolean {
  const encounter = state.encounter;
  if (!encounter) return true;
  const space = { position: record.position, size, squeezed: false };
  return (
    fitsOnField(encounter, space) &&
    !squaresOf(space).some((square) => occupant(state, encounter, square, record.entityId))
  );
}

export function takeShape(use: FeatureUse): FeatureEffect | CombatReason {
  const sheet = use.vitals.sheet;
  const formId = use.command.option;
  if (formId === undefined || !takesForm(sheet, formId)) return 'NOT_A_FORM';
  const form = formOf({ ...sheet, shape: { formId } });
  if (!form) return 'NOT_A_FORM';
  if (use.record && !fitsWhereItStands(use.state, use.record, form.size ?? 'medium'))
    return 'NO_ROOM';
  const hp = sheet.hitPoints;
  const temporary = Math.max(hp.temporary ?? 0, druidLevel(sheet));
  return effect({ ...sheet, shape: { formId }, hitPoints: { ...hp, temporary } });
}

export function leaveShape(use: FeatureUse): FeatureEffect | CombatReason {
  const sheet = use.vitals.sheet;
  if (!sheet.shape) return 'NOT_SHAPED';
  const left = { ...sheet };
  delete left.shape;
  return effect(left);
}

/**
 * After every fight command, the forms that end (§5): a Druid Incapacitated or dead leaves its
 * form. Nothing ends while a reaction window waits: its close comes back here.
 */
export function shapesAfter(
  context: DecisionContext,
  commandType: KernelCommandType,
  decision: Decision,
): Decision {
  if (!decision.ok) return decision;
  if (decision.events.some((event) => event.type === 'ReactionWindowOpened')) return decision;
  const touched = decision.events.some(
    (event) =>
      event.type === 'CharacterSheetSet' &&
      event.payload.sheet.shape !== undefined &&
      incapacitatedBy(event.payload.sheet.conditions),
  );
  const dying = decision.events.some((event) => event.type === 'EntityStatusChanged');
  if (!touched && !dying) return decision;
  const state = foldDrafts(context, commandType, decision.events);
  const events: DraftEvent[] = [];
  for (const [characterId, sheet] of state.characterSheets) {
    if (!sheet.shape) continue;
    const down =
      state.entities.get(characterId)?.status !== 'active' || incapacitatedBy(sheet.conditions);
    if (!down) continue;
    const left = { ...sheet };
    delete left.shape;
    events.push({ type: 'CharacterSheetSet', payload: { entityId: characterId, sheet: left } });
  }
  return events.length === 0 ? decision : { ...decision, events: [...decision.events, ...events] };
}

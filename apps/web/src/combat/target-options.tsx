import type {
  ContextAction,
  EncounterCombatantView,
  EntityContextResponse,
  PlayerAssetView,
} from '@ltw/contracts';
import { readableLabel, StatusPanel, useT, type Translate } from '@ltw/ui';
import { useCallback, type Ref } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource, type Resource } from '../api/resource.ts';
import { actionGlyph } from '../visual/glyph-map.ts';
import { Glyph } from '../visual/glyph.tsx';
import { IconButton } from '../visual/icon-button.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { HpBar } from './board/token.tsx';
import {
  COMBAT_ACTIONS,
  TURN_ACTIONS,
  actionEffect,
  conditionGlyph,
  optionArtUrl,
  optionLabelFor,
} from './combat-art.ts';
import type { LabelOf } from './labels.ts';
import { masteryEffect } from './weapon-words.ts';

const words = (t: Translate, text: string) => t(text.replaceAll('_', ' ').toLowerCase());

/**
 * The Context Engine's answer for one chosen combatant (ADR 0028 §2): read once per choice,
 * shared by its details here and its buttons in the turn tray. Null while nothing is chosen.
 */
export function useTargetContext(api: WorldApi, targetId: string | null) {
  const load = useCallback(
    (signal: AbortSignal) =>
      targetId === null
        ? Promise.resolve(null)
        : api.get<EntityContextResponse>(
            `entities/${encodeURIComponent(targetId)}/context`,
            signal,
          ),
    [api, targetId],
  );
  return useResource(`target:${targetId ?? ''}`, load);
}

/**
 * What the rules say of an option in short, as the server listed it: why it is unavailable,
 * what it costs, how far to move first, long range. The side panel shows each beside the
 * option; the turn tray shows them under its button where the panel is out of view.
 */
export function optionNotes(t: Translate, action: ContextAction): readonly string[] {
  return [
    ...(action.legal ? [] : [words(t, action.reason ?? 'unavailable')]),
    ...(action.cost
      ? [
          action.cost.kind === 'free'
            ? t('Free cast')
            : t('Level {level} slot', { level: action.cost.slotLevel }),
        ]
      : []),
    ...(action.resolution?.moveRequiredFt !== undefined
      ? [t('Move {feet} ft closer first', { feet: action.resolution.moveRequiredFt })]
      : []),
    ...(action.hints?.includes('LONG_RANGE') ? [t('long range: disadvantage')] : []),
    ...(action.hints?.includes('DISADVANTAGE') ? [t('with disadvantage')] : []),
    ...(action.hints?.includes('ADVANTAGE') ? [t('with advantage')] : []),
  ];
}

/** The server's hint that a previewed area includes a party member: a warning, not a block. */
export const warnsOfAlly = (action: ContextAction): boolean =>
  action.hints?.includes('ALLY_IN_AREA') ?? false;

/** The server-listed combat options for the chosen combatant, once they are known. */
export function combatOptions(
  resource: Resource<EntityContextResponse | null>,
): readonly ContextAction[] | null {
  return resource.status === 'ready' && resource.value
    ? resource.value.context.actions.filter(
        (action) => COMBAT_ACTIONS.includes(action.id) || TURN_ACTIONS.includes(action.id),
      )
    : null;
}

/**
 * The chosen combatant in the side panel (docs/STAGE_320_DESIGN.md §5.5): its portrait, side,
 * state, conditions and hit points as the projection carries them, the distance the Context
 * Engine reports, and each option it lists with its catalog picture, legality, cost and area —
 * the server's answer, never recomputed. The options are carried out from the turn tray, which
 * each entry here describes.
 */
export function TargetDetails({
  target,
  labelOf,
  image,
  resource,
  retry,
  mayAct,
  detailId,
  panel,
  onClose,
}: {
  readonly target: EncounterCombatantView;
  /** Every combatant's label: its name, or "Unidentified creature N". */
  readonly labelOf: LabelOf;
  readonly image: PlayerAssetView | null;
  readonly resource: Resource<EntityContextResponse | null>;
  readonly retry: () => void;
  /** The turn tray offers these options now. */
  readonly mayAct: boolean;
  readonly detailId: (index: number) => string;
  readonly panel: Ref<HTMLElement>;
  readonly onClose: () => void;
}) {
  const t = useT();
  const name = labelOf(target.entity.entityId);
  const actions = combatOptions(resource);
  const visible = resource.status === 'ready' ? resource.value?.context.visibleState : undefined;
  return (
    <section
      ref={panel}
      className="combat-side-card target-card"
      aria-label={t('Options for {name}', { name })}
      tabIndex={-1}
    >
      <header className="side-header">
        <Medallion image={image} kind={target.entity.kind} size="lg" tone={target.side} />
        <div className="side-title">
          <p className="eyebrow">{t(readableLabel(target.side))}</p>
          <h3>{name}</h3>
          {target.state !== 'up' && <p className="side-state">{t(readableLabel(target.state))}</p>}
        </div>
        <IconButton glyph="close" label={t('Close options')} onClick={onClose} />
      </header>
      {target.hitPoints && (
        <p className="side-hp">
          <Glyph name="hit-points" />
          {t('Hit points: {current} / {max}', { ...target.hitPoints })}
          <HpBar hitPoints={target.hitPoints} />
        </p>
      )}
      {target.conditions.length > 0 && (
        <ul className="side-conditions" aria-label={t('Conditions')}>
          {target.conditions.map((condition) => (
            <li key={condition}>
              <Glyph name={conditionGlyph(condition)} />
              {t(readableLabel(condition))}
            </li>
          ))}
        </ul>
      )}
      {resource.status !== 'ready' ? (
        <StatusPanel
          state={resource.status}
          label={resource.status === 'error' ? resource.message : t('Checking what you can do…')}
          onRetry={retry}
        />
      ) : (
        <>
          {visible?.distanceFt !== undefined && (
            <p className="side-distance">
              <Glyph name="move" />
              {t('Distance: {feet} ft', { feet: visible.distanceFt })}
            </p>
          )}
          {actions?.length === 0 && (
            <p className="muted">{t('Nothing to do with this combatant.')}</p>
          )}
          {actions !== null && actions.length > 0 && (
            <p className="side-hint muted">
              {mayAct
                ? t('Act with the buttons of your turn below.')
                : t('You can act on your own turn.')}
            </p>
          )}
          <ul className="option-list">
            {actions?.map((action, index) => (
              <OptionEntry
                key={`${action.id}:${action.weapon ?? ''}:${String(index)}`}
                id={detailId(index)}
                action={action}
                label={optionLabelFor(t, action, name)}
                labelOf={labelOf}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function OptionEntry({
  id,
  action,
  label,
  labelOf,
}: {
  readonly id: string;
  readonly action: ContextAction;
  readonly label: string;
  readonly labelOf: LabelOf;
}) {
  const t = useT();
  const url = optionArtUrl(action);
  // A weapon attack tells what its mastery will do (docs/adr/0047-weapons.md §2).
  const effect =
    action.mastery === undefined ? actionEffect(t, action.id) : masteryEffect(t, action.mastery);
  return (
    <li className={`option-entry${action.legal ? '' : ' is-unavailable'}`}>
      {url ? (
        <img className="option-art" src={url} alt="" draggable={false} />
      ) : (
        <Glyph name={actionGlyph(action.id)} className="option-glyph" />
      )}
      <div className="option-text" id={id}>
        <strong>{label}</strong>
        {effect && <small className="option-effect">{effect}</small>}
        {optionNotes(t, action).map((note) => (
          <small key={note}>{note}</small>
        ))}
        {action.area && (
          <small>
            {t('Would affect: {names}', {
              names:
                action.area.affected.map((ref) => ref.name ?? labelOf(ref.entityId)).join(', ') ||
                t('no one'),
            })}
          </small>
        )}
        {warnsOfAlly(action) && (
          <strong className="ally-warning" role="alert">
            <Glyph name="warning" />
            {t('Warning: this area includes a party member. You may still cast it.')}
          </strong>
        )}
      </div>
    </li>
  );
}

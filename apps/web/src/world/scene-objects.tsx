import type { EntityKind, EntityPresentation, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { Medallion, type MedallionCondition } from '../visual/medallion.tsx';

function condition(entity: EntityPresentation): MedallionCondition | null {
  if (entity.status === 'dead' || entity.status === 'destroyed') return 'dead';
  if (entity.vitals?.unconscious) return 'unconscious';
  if (entity.vitals?.wounded) return 'wounded';
  return null;
}

function SceneObject({
  entity,
  name,
  selected,
  anchor,
  onSelect,
}: {
  readonly entity: EntityPresentation;
  readonly name: string;
  readonly selected: boolean;
  /** The result of an action concerns this one: the stage shows it above (CSS anchor). */
  readonly anchor: boolean;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  // A generated ID: entity IDs never enter the page's markup.
  const stateId = useId();
  return (
    <button
      type="button"
      className="object-button"
      aria-label={name}
      aria-describedby={stateId}
      aria-pressed={selected}
      data-anchor={anchor ? '' : undefined}
      onClick={() => {
        onSelect(entity.entityId, entity.kind);
      }}
    >
      <Medallion
        image={entity.image}
        kind={entity.kind}
        size="lg"
        tone={entity.kind === 'character' ? 'party' : 'gold'}
        selected={selected}
        condition={condition(entity)}
      />
      <span className="name-plate">
        <strong>{name}</strong>
        <span className="name-plate-kind">{t(entity.kind)}</span>
      </span>
      <span className="object-state" id={stateId}>
        {entity.status ? t(entity.status) : t('Not observed')}
        {entity.vitals?.wounded ? t(' · wounded') : ''}
        {entity.vitals?.unconscious ? t(' · unconscious') : ''}
      </span>
    </button>
  );
}

/**
 * Who and what is present (docs/STAGE_320_DESIGN.md §5.2): medallions with name plates along
 * the stage's lower third. The arrangement is symbolic — the source order conveys no position —
 * and a name appears only when this perspective knows it.
 */
export function SceneObjects({
  present,
  directory,
  selectedId,
  anchorId,
  onSelect,
}: {
  readonly present: readonly EntityPresentation[];
  readonly directory: readonly EntityRef[];
  readonly selectedId: string | null;
  readonly anchorId: string | null;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  return (
    <ul className="world-objects" aria-label={t('Visible world objects')}>
      {present.map((entity) => (
        <li key={entity.entityId}>
          <SceneObject
            entity={entity}
            name={
              directory.find((item) => item.entityId === entity.entityId)?.name ??
              t('Unidentified {kind}', { kind: t(entity.kind) })
            }
            selected={selectedId === entity.entityId}
            anchor={anchorId === entity.entityId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

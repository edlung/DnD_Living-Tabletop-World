import type { EntityKind, EntityPresentation, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { useHeldImage } from '../visual/approved-images.ts';
import { Medallion, type MedallionCondition } from '../visual/medallion.tsx';
import { Miniature } from '../visual/miniature.tsx';

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
  onSelect,
}: {
  readonly entity: EntityPresentation;
  readonly name: string;
  readonly selected: boolean;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  // A generated ID: entity IDs never enter the page's markup.
  const stateId = useId();
  // Who has an approved figure stands in the scene as it (ADR 0035 §4); anyone else, or a
  // figure that cannot be read, keeps the medallion.
  const standing = useHeldImage(entity.figure);
  return (
    <button
      type="button"
      className={`object-button${standing.held ? ' object-button--figure' : ''}`}
      aria-label={name}
      aria-describedby={stateId}
      aria-pressed={selected}
      onClick={() => {
        onSelect(entity.entityId, entity.kind);
      }}
    >
      {standing.held ? (
        <Miniature url={standing.url} condition={condition(entity)} />
      ) : (
        <Medallion
          image={entity.image}
          kind={entity.kind}
          size="lg"
          tone={entity.kind === 'character' ? 'party' : 'gold'}
          selected={selected}
          condition={condition(entity)}
        />
      )}
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
 * the stage's lower third — a person or creature with an approved figure stands there as its
 * figure (docs/STAGE_330_DESIGN.md "Purposes"). The arrangement is symbolic — the source order
 * conveys no position — and a name appears only when this perspective knows it.
 */
export function SceneObjects({
  present,
  directory,
  selectedId,
  onSelect,
}: {
  readonly present: readonly EntityPresentation[];
  readonly directory: readonly EntityRef[];
  readonly selectedId: string | null;
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
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

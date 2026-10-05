import type { EntityKind, EntityPresentation, EntityRef } from '@ltw/contracts';

/** Category symbols describe supplied entity kinds, never an invented appearance. */
function ObjectSymbol({ kind }: { readonly kind: EntityKind }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      {kind === 'character' || kind === 'npc' ? (
        <>
          <circle cx="24" cy="16" r="6" />
          <path d="M12 37c0-9 5-13 12-13s12 4 12 13M18 37h12" />
        </>
      ) : kind === 'location' ? (
        <>
          <path d="M12 38V19a12 12 0 0 1 24 0v19M18 38V21a6 6 0 0 1 12 0v17M8 38h32" />
        </>
      ) : kind === 'item' ? (
        <>
          <path d="m24 9 13 9v16L24 41l-13-7V18l13-9Zm-13 9 13 8 13-8M24 26v15" />
        </>
      ) : (
        <>
          <path d="m24 7 17 17-17 17L7 24 17-17Z" />
          <circle cx="24" cy="24" r="6" />
        </>
      )}
    </svg>
  );
}

/** A symbolic tabletop arrangement; source ordering conveys no canonical position. */
export function SceneObjects({
  present,
  directory,
  selectedId,
  onSelect,
}: {
  readonly present: readonly EntityPresentation[];
  readonly directory: readonly EntityRef[];
  readonly selectedId: string | null;
  readonly onSelect: (entityId: string, kind: string) => void;
}) {
  return (
    <ul className="world-objects" aria-label="Visible world objects">
      {present.map((entity) => {
        const known = directory.find((item) => item.entityId === entity.entityId);
        const name = known?.name ?? `Unidentified ${entity.kind}`;
        const selected = selectedId === entity.entityId;
        return (
          <li key={entity.entityId}>
            <button
              type="button"
              className="world-object"
              aria-label={name}
              aria-pressed={selected}
              onClick={() => {
                onSelect(entity.entityId, entity.kind);
              }}
            >
              <span className="world-object-marker" aria-hidden="true">
                <ObjectSymbol kind={entity.kind} />
                {selected ? <span className="world-object-selected">✓</span> : null}
              </span>
              <span className="world-object-kind">{entity.kind}</span>
              <strong>{name}</strong>
              <span className="world-object-state">
                {entity.status ?? 'Not observed'}
                {entity.vitals?.wounded ? ' · wounded' : ''}
                {entity.vitals?.unconscious ? ' · unconscious' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

import type { EntityKind, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState } from 'react';

import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { kindGlyph } from '../visual/glyph-map.ts';
import { distinctNames } from './entity-words.ts';

/**
 * Who and what this perspective knows (docs/STAGE_320_DESIGN.md §5.4), in the Journal's own pane:
 * a name to find and a kind to keep, so a DM's long list is one press away from the row wanted.
 * The list is the directory as the server gave it; finding only hides rows, here in the browser.
 */
export function JournalKnown({
  directory,
  selectedId,
  onSelect,
}: {
  readonly directory: readonly EntityRef[];
  readonly selectedId: string | null;
  readonly onSelect: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  const [words, setWords] = useState('');
  const [kind, setKind] = useState<EntityKind | null>(null);
  const names = distinctNames(t, directory, { kindShown: true });
  // The kinds this perspective knows, in the order the directory first names them.
  const kinds = [...new Set(directory.map((entity) => entity.kind))];
  const query = words.trim().toLowerCase();
  const shown = directory.filter(
    (entity) =>
      (kind === null || entity.kind === kind) &&
      (query === '' || (names.get(entity.entityId) ?? entity.name).toLowerCase().includes(query)),
  );
  return (
    <section className="sheet-section journal-known" aria-labelledby="journal-known">
      <h3 id="journal-known">{t('Known people & places')}</h3>
      <p className="muted">
        {t('What this perspective knows. Presence is shown separately in the scene.')}
      </p>
      {directory.length > 8 && (
        <div className="journal-find">
          <Field label={t('Find among the known')}>
            {(control) => (
              <input
                {...control}
                type="search"
                value={words}
                onChange={(event) => {
                  setWords(event.target.value);
                }}
              />
            )}
          </Field>
          <div className="rules-tags" role="group" aria-label={t('Show')}>
            <button
              type="button"
              aria-pressed={kind === null}
              onClick={() => {
                setKind(null);
              }}
            >
              {t('All')} <span className="journal-count">{directory.length}</span>
            </button>
            {kinds.map((one) => (
              <button
                key={one}
                type="button"
                aria-pressed={kind === one}
                onClick={() => {
                  setKind(one);
                }}
              >
                {t(one)}{' '}
                <span className="journal-count">
                  {directory.filter((entity) => entity.kind === one).length}
                </span>
              </button>
            ))}
          </div>
          <p className="visually-hidden" role="status">
            {t('Shown: {count}', { count: shown.length })}
          </p>
        </div>
      )}
      <ul className="directory-list">
        {shown.map((entity) => (
          <li key={entity.entityId}>
            <button
              type="button"
              className="list-button"
              aria-pressed={selectedId === entity.entityId}
              onClick={() => {
                onSelect(entity.entityId, entity.kind);
              }}
            >
              <Glyph name={kindGlyph(entity.kind)} />
              <span className="directory-name">{names.get(entity.entityId) ?? entity.name}</span>
              <span className="directory-kind">{t(entity.kind)}</span>
            </button>
          </li>
        ))}
      </ul>
      {directory.length === 0 && <p>{t('No entities are known yet.')}</p>}
      {directory.length > 0 && shown.length === 0 && (
        <p className="muted">{t('Nothing known matches.')}</p>
      )}
    </section>
  );
}

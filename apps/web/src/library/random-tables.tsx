import type { RandomTableView } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useDiceTable } from '../dice/table.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { TableEditor, type TableDraft } from './table-editor.tsx';
import { dieName, rangeWords, tableLines, tablePath } from './table-lines.ts';
import { useLibrary, type Library } from './use-library.ts';

/**
 * The DM's random tables (docs/adr/0058-campaign-content.md §4) beside the dice: written, changed,
 * deleted, and rolled by the server — for the DM alone, or for the table, which then sees the
 * table's name and its result. What the result brings in, the DM brings by hand.
 */
export function RandomTables({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const ids = useId();
  const table = useDiceTable();
  const library = useLibrary(api);
  const [editing, setEditing] = useState<TableDraft | null>(null);
  if (!table?.isDm) return null;
  const tables = library.resource.status === 'ready' ? library.resource.value.tables : null;
  return (
    <section className="sheet-section random-tables" aria-labelledby={`${ids}-title`}>
      <div className="section-heading">
        <h3 id={`${ids}-title`}>{t('Random tables')}</h3>
        {editing === null && (
          <button
            type="button"
            onClick={() => {
              setEditing({ entryId: null, name: '', die: 20, lines: '' });
            }}
          >
            <Glyph name="add-character" />
            {t('Write a table')}
          </button>
        )}
      </div>
      <p className="muted">
        {t('Only you see them. A roll for the table shows everyone its result.')}
      </p>
      {editing && (
        <TableEditor
          key={editing.entryId ?? 'new'}
          draft={editing}
          library={library}
          onDone={() => {
            setEditing(null);
          }}
        />
      )}
      {tables === null ? (
        <StatusPanel
          state={library.resource.status === 'error' ? 'error' : 'loading'}
          label={
            library.resource.status === 'error'
              ? library.resource.message
              : t('Reading your library…')
          }
          onRetry={library.retry}
        />
      ) : tables.length === 0 ? (
        editing === null && <p className="muted">{t('No tables yet.')}</p>
      ) : (
        <ul className="notes table-list">
          {tables.map((one) => (
            <TableCard
              key={one.entryId}
              table={one}
              library={library}
              onChange={() => {
                setEditing({
                  entryId: one.entryId,
                  name: one.name,
                  die: one.die,
                  lines: tableLines(one.results),
                });
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TableCard({
  table: kept,
  library,
  onChange,
}: {
  readonly table: RandomTableView;
  readonly library: Library;
  readonly onChange: () => void;
}) {
  const t = useT();
  const dice = useDiceTable();
  const [deleting, setDeleting] = useState(false);
  const roll = (hidden: boolean) => void dice?.rollOnTable(kept.entryId, hidden);
  return (
    <li className="note random-table">
      <div className="section-heading">
        <strong>{kept.name}</strong>
        <span className="muted">
          {t('{die}, results: {count}', { die: dieName(kept.die), count: kept.results.length })}
        </span>
      </div>
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          disabled={dice?.busy === true}
          aria-label={t('Roll for the table: {name}', { name: kept.name })}
          onClick={() => {
            roll(false);
          }}
        >
          <Glyph name="roll" />
          {t('Roll for the table')}
        </button>
        <button
          type="button"
          disabled={dice?.busy === true}
          aria-label={t('Roll for me: {name}', { name: kept.name })}
          onClick={() => {
            roll(true);
          }}
        >
          {t('Roll for me')}
        </button>
      </div>
      <details className="disclosure table-results">
        <summary>{t('Its results')}</summary>
        <ol>
          {kept.results.map((result) => (
            <li key={result.from}>
              <span className="table-range">{rangeWords(result)}</span>
              <span>{result.text}</span>
            </li>
          ))}
        </ol>
      </details>
      <div className="action-row">
        <button
          type="button"
          aria-label={t('Change: {title}', { title: kept.name })}
          onClick={onChange}
        >
          {t('Change')}
        </button>
        {deleting ? (
          <>
            <button
              type="button"
              disabled={library.busy}
              onClick={() => void library.write(tablePath(kept.entryId, 'delete'), {})}
            >
              {t('Delete it')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleting(false);
              }}
            >
              {t('Keep it')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="quiet-button"
            aria-label={t('Delete: {title}', { title: kept.name })}
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t('Delete')}
          </button>
        )}
      </div>
    </li>
  );
}

import { useT } from '@ltw/ui';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { fieldWords } from './words.ts';
import { FieldControl, type FieldControlProps } from './field-controls.tsx';
import { initialValue, isRecord, rowTitle } from './model.ts';

export function CollectionField({
  schema,
  value,
  field,
  path,
  content,
  onChange,
  disabled,
  isLocked,
}: FieldControlProps) {
  const t = useT();
  const [page, setPage] = useState(0),
    [added, setAdded] = useState<number | null>(null);
  const root = useRef<HTMLFieldSetElement>(null),
    focus = useRef<{ index: number; field: boolean } | null>(null);
  const rows: unknown[] = Array.isArray(value) ? value : [];
  const pages = Math.max(1, Math.ceil(rows.length / 25)),
    currentPage = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const intent = focus.current;
    if (!intent) return;
    focus.current = null;
    const row = root.current?.querySelector<HTMLElement>(
      `:scope > ol > li[data-row-index="${String(intent.index)}"]`,
    );
    const target =
      row?.querySelector<HTMLElement>(intent.field ? 'input,textarea,select' : 'summary') ??
      root.current?.querySelector<HTMLElement>(':scope > button');
    target?.focus();
  }, [value]);
  const label = fieldWords(t, field);
  const change = (index: number, next: unknown) => {
    onChange(rows.map((item, ordinal) => (ordinal === index ? next : item)));
  };
  const move = (index: number, offset: number) => {
    const next = [...rows];
    const destination = index + offset;
    focus.current = { index: destination, field: false };
    setAdded(null);
    setPage(Math.floor(destination / 25));
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  };
  return (
    <fieldset ref={root} className="campaign-collection" disabled={disabled}>
      <legend>{label}</legend>
      {!rows.length && <p>{t('None recorded')}</p>}
      <ol>
        {rows.slice(currentPage * 25, currentPage * 25 + 25).map((item, offset) => {
          const index = currentPage * 25 + offset;
          const identity = isRecord(item)
            ? (item['key'] ?? item['questId'] ?? item['stage'])
            : null;
          const name = rowTitle(item) ?? t('Item {number}', { number: index + 1 });
          const rowLocked = isLocked?.([...path, index]) === true;
          return (
            <li
              data-row-index={index}
              key={
                typeof identity === 'string'
                  ? `${identity}:${rows.filter((row) => isRecord(row) && (row['key'] ?? row['questId'] ?? row['stage']) === identity).length > 1 ? index : ''}`
                  : index
              }
            >
              <CollectionRow title={name} initiallyOpen={added === index}>
                <div className="campaign-collection-actions">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => {
                      move(index, -1);
                    }}
                  >
                    {t('Move up')}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === rows.length - 1}
                    onClick={() => {
                      move(index, 1);
                    }}
                  >
                    {t('Move down')}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || rowLocked}
                    onClick={() => {
                      focus.current = { index: Math.min(index, rows.length - 2), field: false };
                      setAdded(null);
                      onChange(rows.filter((_, ordinal) => ordinal !== index));
                    }}
                  >
                    {t('Remove item')}
                  </button>
                </div>
                {rowLocked && (
                  <p>{t('Locked content. Unlock it explicitly before changing it.')}</p>
                )}
                <FieldControl
                  schema={schema.items ?? {}}
                  value={item}
                  field={field}
                  path={[...path, index]}
                  content={content}
                  {...(isLocked ? { isLocked } : {})}
                  {...(disabled === undefined ? {} : { disabled })}
                  onChange={(next) => {
                    change(index, next);
                  }}
                />
              </CollectionRow>
            </li>
          );
        })}
      </ol>
      {pages > 1 && (
        <div className="campaign-collection-actions">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => {
              setPage(currentPage - 1);
            }}
          >
            {t('Previous items')}
          </button>
          <span>{t('Page {page} of {pages}', { page: currentPage + 1, pages })}</span>
          <button
            type="button"
            disabled={currentPage === pages - 1}
            onClick={() => {
              setPage(currentPage + 1);
            }}
          >
            {t('Next items')}
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={disabled || (schema.maxItems !== undefined && rows.length >= schema.maxItems)}
        onClick={() => {
          focus.current = { index: rows.length, field: true };
          setAdded(rows.length);
          setPage(Math.floor(rows.length / 25));
          onChange([...rows, initialValue(schema.items ?? {}, t('New object'), field)]);
        }}
      >
        {t('Add item')}
      </button>
    </fieldset>
  );
}

function CollectionRow({
  title,
  children,
  initiallyOpen,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className="campaign-collection-row"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{title}</summary>
      {open && children}
    </details>
  );
}

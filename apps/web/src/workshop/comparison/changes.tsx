import type { CampaignPackage } from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import { useMemo, useState } from 'react';

import { isRecord, rowTitle, valueAt } from '../editing/model.ts';
import { FIELD_LABELS } from '../scenario/fields.ts';
import {
  buildScenarioIndex,
  GROUP_LABELS,
  nearestScenarioPath,
  type ScenarioGroup,
  type ScenarioIndex,
  type ScenarioNode,
} from '../scenario/graph.ts';
import { StructuredFields } from '../scenario/structured-fields.tsx';
import { compareFields, type FieldChange } from './model.ts';

export function CampaignChanges({
  before,
  after,
}: {
  readonly before: CampaignPackage;
  readonly after: CampaignPackage;
}) {
  const t = useT();
  const [query, setQuery] = useState(''),
    [shown, setShown] = useState(25);
  const left = useMemo(() => buildScenarioIndex(before), [before]),
    right = useMemo(() => buildScenarioIndex(after), [after]);
  const changes = useMemo(() => compareFields(before, after), [before, after]);
  const label = (change: FieldChange) =>
    (change.kind === 'REMOVE' ? change.beforePath : change.path)
      .map((part, index) => {
        if (typeof part === 'string')
          return FIELD_LABELS[part]
            ? t(FIELD_LABELS[part])
            : part in GROUP_LABELS
              ? t(GROUP_LABELS[part as ScenarioGroup])
              : readableLabel(part, t);
        const source = change.kind === 'REMOVE' ? before : after;
        const row = valueAt(
          source,
          (change.kind === 'REMOVE' ? change.beforePath : change.path).slice(0, index + 1),
        );
        if (isRecord(row) && typeof row['entity'] === 'string')
          return (
            source.entities.find((entity) => entity.key === row['entity'])?.name ??
            t('Item {number}', { number: part + 1 })
          );
        return rowTitle(row) ?? t('Item {number}', { number: part + 1 });
      })
      .join(' › ');
  const filtered = changes.filter((change) =>
    label(change).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <section className="campaign-changes" aria-label={t('Complete field comparison')}>
      <h3>{t('Complete field comparison')}</h3>
      <p>{t('Changed fields: {count}', { count: changes.length })}</p>
      <label htmlFor="campaign-diff-search">{t('Find a changed object or field')}</label>
      <input
        id="campaign-diff-search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setShown(25);
        }}
      />
      {!changes.length && <p>{t('The content is unchanged.')}</p>}
      <ol className="campaign-change-list">
        {filtered.slice(0, shown).map((change, index) => (
          <li key={index}>
            <details>
              <summary>
                {change.kind === 'ADD'
                  ? t('Added')
                  : change.kind === 'REMOVE'
                    ? t('Removed')
                    : change.kind === 'MOVE'
                      ? t('Reordered')
                      : t('Changed')}{' '}
                · {label(change)}
              </summary>
              {change.kind === 'MOVE' ? (
                <p>
                  {t('Position {before} → {after}', {
                    before: String(change.before),
                    after: String(change.after),
                  })}
                </p>
              ) : (
                <div className="campaign-diff-sides">
                  <DiffSide
                    side="before"
                    title={t('Before')}
                    content={before}
                    index={left}
                    change={change}
                    value={change.before}
                  />
                  <DiffSide
                    side="after"
                    title={t('After')}
                    content={after}
                    index={right}
                    change={change}
                    value={change.after}
                  />
                </div>
              )}
            </details>
          </li>
        ))}
      </ol>
      {filtered.length > shown && (
        <button
          type="button"
          onClick={() => {
            setShown((value) => value + 25);
          }}
        >
          {t('More changed fields')}
        </button>
      )}
    </section>
  );
}

function DiffSide({
  side,
  title,
  content,
  index,
  change,
  value,
}: {
  readonly side: 'before' | 'after';
  readonly title: string;
  readonly content: CampaignPackage;
  readonly index: ScenarioIndex;
  readonly change: FieldChange;
  readonly value: unknown;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const fallback = index.nodes[0];
  if (!fallback) return null;
  const node: ScenarioNode =
    index.byPath.get(
      nearestScenarioPath(index, (side === 'before' ? change.beforePath : change.path).join('.')),
    ) ?? fallback;
  const linked = selected ? index.byPath.get(selected) : null;
  const field = change.path.findLast((part) => typeof part === 'string');
  return (
    <section className="campaign-diff-value" aria-label={title}>
      <h4>{title}</h4>
      {value === undefined ? (
        <p>{t('Not present')}</p>
      ) : (
        <StructuredFields
          value={value}
          {...(typeof field === 'string' ? { field } : {})}
          index={index}
          node={node}
          onSelect={setSelected}
        />
      )}
      {linked && (
        <details open className="campaign-diff-reference">
          <summary>{linked.title}</summary>
          <StructuredFields
            value={linked.value}
            field={linked.group}
            index={index}
            node={linked}
            onSelect={setSelected}
          />
          <button
            type="button"
            onClick={() => {
              setSelected(null);
            }}
          >
            {t('Close linked value')}
          </button>
        </details>
      )}
      <span className="visually-hidden">{content.world.name}</span>
    </section>
  );
}

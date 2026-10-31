import { readableLabel, useT } from '@ltw/ui';

import { formatWorldTime } from '../../dm/world-time.ts';
import { ENTITY_REFERENCE_FIELDS, ENUM_FIELDS, FIELD_LABELS, SCENARIO_WORDS } from './fields.ts';
import type { ScenarioIndex, ScenarioNode } from './graph.ts';

interface FieldProps {
  readonly value: unknown;
  readonly field?: string | undefined;
  readonly index: ScenarioIndex;
  readonly node: ScenarioNode;
  readonly onSelect: (path: string) => void;
}

export function ScenarioReference({
  path,
  index,
  onSelect,
}: {
  readonly path: string;
  readonly index: ScenarioIndex;
  readonly onSelect: (path: string) => void;
}) {
  const t = useT();
  const target = index.byPath.get(path);
  return target ? (
    <button
      type="button"
      className="scenario-reference"
      onClick={() => {
        onSelect(path);
      }}
    >
      {target.title || t('Unnamed object')}
    </button>
  ) : (
    <span className="scenario-missing">{t('Missing reference')}</span>
  );
}

/** Field-by-field reading, including every nested sheet, statistic and quest branch. */
export function StructuredFields({ value, field, index, node, onSelect }: FieldProps) {
  const t = useT();
  if (value === null || value === undefined)
    return (
      <span>
        {['knownSince', 'existsSince', 'since'].includes(field ?? '')
          ? t('Before recorded history')
          : field === 'disclosure'
            ? t('Guarded (default)')
            : t('None recorded')}
      </span>
    );
  if (typeof value === 'boolean') return <span>{value ? t('Yes') : t('No')}</span>;
  if (typeof value === 'number')
    return (
      <span>
        {['startsAt', 'knownSince', 'existsSince', 'since'].includes(field ?? '')
          ? formatWorldTime(value, t)
          : value}
      </span>
    );
  if (typeof value === 'string') {
    if (field && ENTITY_REFERENCE_FIELDS.has(field))
      return <ScenarioReference path={`entities.${value}`} index={index} onSelect={onSelect} />;
    if (field === 'knowledge' || field === 'clueKeys')
      return (
        <ScenarioReference
          path={`${field === 'knowledge' ? 'knowledge' : 'clues'}.${value}`}
          index={index}
          onSelect={onSelect}
        />
      );
    if (field === 'after') {
      const quest = node.value as { milestones?: { stage: string; summary: string }[] };
      return (
        <span>
          {quest.milestones?.find((milestone) => milestone.stage === value)?.summary ??
            t('Missing milestone')}
        </span>
      );
    }
    if (field === 'knowledgeType')
      return (
        <span className={`scenario-type scenario-type--${value.toLowerCase()}`}>
          {readableLabel(value, t)}
        </span>
      );
    if (
      (field && ENUM_FIELDS.has(field)) ||
      (field === 'level' && ['half', 'three-quarters', 'total'].includes(value))
    )
      return (
        <span>{SCENARIO_WORDS[value] ? t(SCENARIO_WORDS[value]) : readableLabel(value, t)}</span>
      );
    return <span className="scenario-prose">{value || t('None recorded')}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="scenario-muted">{t('None recorded')}</span>;
    return (
      <ol className="scenario-values">
        {value.map((item: unknown, ordinal) => (
          <li key={ordinal}>
            <StructuredFields
              value={item}
              field={field}
              index={index}
              node={node}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ol>
    );
  }
  if (typeof value !== 'object') return null;
  // An NPC's record without a disclosure stays guarded (Gate 07, G07-04): show what applies.
  const scope = (value as { scope?: { kind?: unknown } }).scope;
  const unstated =
    node.group === 'knowledge' &&
    value === node.value &&
    scope?.kind === 'NPC' &&
    !('disclosure' in value);
  const entries: [string, unknown][] = [
    ...Object.entries(value).filter(([key]) => !['key', 'questId', 'stage'].includes(key)),
    ...(unstated ? [['disclosure', undefined] as [string, unknown]] : []),
  ];
  return (
    <dl className="scenario-fields">
      {entries.map(([key, entry]: [string, unknown]) => (
        <div key={key}>
          <dt>
            {t(FIELD_LABELS[key] ?? readableLabel(key.replace(/[A-Z]/g, (letter) => ` ${letter}`)))}
          </dt>
          <dd>
            <StructuredFields
              value={entry}
              field={key}
              index={index}
              node={node}
              onSelect={onSelect}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

import { useT } from '@ltw/ui';
import { useState } from 'react';

import { GROUP_LABELS, SCENARIO_GROUPS, type ScenarioIndex } from './graph.ts';

export function ScenarioOverview({
  index,
  selectedPath,
  onSelect,
}: {
  readonly index: ScenarioIndex;
  readonly selectedPath: string;
  readonly onSelect: (path: string) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLocaleLowerCase();
  return (
    <nav className="scenario-overview" aria-label={t('Scenario objects')}>
      <h3>{t('Explore the scenario')}</h3>
      <label className="scenario-search">
        <span>{t('Find an object or statement')}</span>
        <input
          type="search"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
        />
      </label>
      <div className="scenario-group-list">
        {SCENARIO_GROUPS.map((group) => {
          const all = index.nodes.filter((node) => node.group === group);
          const matches = all.filter(
            (node) =>
              !needle ||
              node.title.toLocaleLowerCase().includes(needle) ||
              t(GROUP_LABELS[group]).toLocaleLowerCase().includes(needle),
          );
          if (matches.length === 0) return null;
          return (
            <section key={group}>
              <h4>
                {t(GROUP_LABELS[group])} <span className="scenario-muted">{all.length}</span>
              </h4>
              <ul>
                {matches.map((node) => (
                  <li key={node.path}>
                    <button
                      type="button"
                      className="scenario-object"
                      aria-current={node.path === selectedPath ? 'true' : undefined}
                      onClick={() => {
                        onSelect(node.path);
                      }}
                    >
                      {[
                        'world',
                        'brief',
                        'party',
                        'relationships',
                        'firstSession',
                        'laterOutline',
                      ].includes(group)
                        ? t(GROUP_LABELS[group])
                        : node.title || t('Unnamed object')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {needle &&
      !index.nodes.some(
        (node) =>
          node.title.toLocaleLowerCase().includes(needle) ||
          t(GROUP_LABELS[node.group]).toLocaleLowerCase().includes(needle),
      ) ? (
        <p>{t('No matching objects.')}</p>
      ) : null}
    </nav>
  );
}

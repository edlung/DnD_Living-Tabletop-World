import type { CampaignPackage } from '@ltw/contracts';
import { useT, readableLabel } from '@ltw/ui';

import { EditScenarioFields, type ScenarioSave } from './edit-fields.tsx';
import { GROUP_LABELS, type ScenarioIndex, type ScenarioNode } from './graph.ts';
import { ScenarioReference, StructuredFields } from './structured-fields.tsx';

export function ScenarioInspector({
  content,
  node,
  index,
  onSelect,
  onSave,
}: {
  readonly content: CampaignPackage;
  readonly node: ScenarioNode;
  readonly index: ScenarioIndex;
  readonly onSelect: (path: string) => void;
  readonly onSave?: ScenarioSave;
}) {
  const t = useT();
  const links = index.links.get(node.path) ?? [];
  const standalone = [
    'brief',
    'party',
    'relationships',
    'possessions',
    'firstSession',
    'laterOutline',
  ].includes(node.group);
  return (
    <article className="scenario-inspector" aria-label={t('Scenario inspector')}>
      <header>
        <p className="scenario-eyebrow">{t(GROUP_LABELS[node.group])}</p>
        <h3>{standalone ? t(GROUP_LABELS[node.group]) : node.title || t('Unnamed object')}</h3>
        {node.group === 'situations' ||
        node.group === 'laterOutline' ||
        node.group === 'encounters' ? (
          <p className="scenario-muted">
            {t('Prepared possibilities. The players and the world decide what happens.')}
          </p>
        ) : null}
        {node.group === 'quests' ? (
          <p className="scenario-muted">
            {t('Quest progress follows the party’s experience; it is not world truth.')}
          </p>
        ) : null}
      </header>
      <StructuredFields
        value={node.value}
        field={node.group}
        index={index}
        node={node}
        onSelect={onSelect}
      />
      {links.length > 0 ? (
        <section className="scenario-connections" aria-label={t('Connected objects')}>
          <h4>{t('Connected objects')}</h4>
          <ul>
            {links.map((link) => (
              <li key={`${link.label}:${link.target}`}>
                <span className="scenario-muted">
                  {t(/^[A-Z_]+$/.test(link.label) ? readableLabel(link.label) : link.label)}
                </span>
                <ScenarioReference path={link.target} index={index} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {onSave ? (
        <EditScenarioFields key={node.path} content={content} node={node} onSave={onSave} />
      ) : null}
    </article>
  );
}

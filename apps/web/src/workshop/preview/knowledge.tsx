import type { CampaignPreviewEntityRef, KnowledgeScope, KnowledgeView } from '@ltw/contracts';
import { readableLabel, StatusPanel, useLanguage, useT } from '@ltw/ui';

import { formatWorldTime } from '../../dm/world-time.ts';
import { KnowledgeBadge } from '../../visual/knowledge-cards.tsx';

/** Human labels from this projection only; identifiers never stand in for a name. */
export function PreviewKnowledge({
  knowledge,
  references,
}: {
  readonly knowledge: readonly KnowledgeView[];
  readonly references: readonly CampaignPreviewEntityRef[];
}) {
  const t = useT();
  const language = useLanguage();
  const nameOf = (id: string) =>
    references.find((entry) => entry.entityId === id)?.name ?? t('Unidentified object');
  const scopeOf = (scope: KnowledgeScope) =>
    scope.kind === 'CHARACTER'
      ? t('Character: {name}', { name: nameOf(scope.characterId) })
      : scope.kind === 'NPC'
        ? t('NPC: {name}', { name: nameOf(scope.npcId) })
        : readableLabel(scope.kind, t);
  if (!knowledge.length)
    return (
      <StatusPanel state="empty" label={t('No knowledge is available in this perspective.')} />
    );
  return (
    <ul className="record-list knowledge-list">
      {knowledge.map((record) => (
        <li key={record.knowledgeId}>
          <article
            className={`knowledge-record knowledge-record--${record.knowledgeType.toLowerCase()}`}
          >
            <KnowledgeBadge type={record.knowledgeType} />
            <p className="knowledge-statement">{record.statement}</p>
            {record.attributedTo && (
              <p className="knowledge-attribution">
                {t('Attributed to {name}', { name: record.attributedTo.name })}
              </p>
            )}
            <details className="disclosure">
              <summary>{t('Record details')}</summary>
              <dl className="field-list">
                <div>
                  <dt>{t('Scope')}</dt>
                  <dd>{scopeOf(record.scope)}</dd>
                </div>
                <div>
                  <dt>{t('Known since')}</dt>
                  <dd>
                    {record.knownSince === null
                      ? t('Before recorded history')
                      : formatWorldTime(record.knownSince, t)}
                  </dd>
                </div>
                <div>
                  <dt>{t('Subjects')}</dt>
                  <dd>
                    {record.subjects.length
                      ? record.subjects.map((subject) => subject.name).join(', ')
                      : t('None recorded')}
                  </dd>
                </div>
                {record.relations.length > 0 && (
                  <div>
                    <dt>{t('Relations')}</dt>
                    <dd>
                      <ul>
                        {record.relations.map((relation, index) => (
                          <li key={index}>
                            {readableLabel(relation.type, t)} ·{' '}
                            {knowledge.find((entry) => entry.knowledgeId === relation.knowledgeId)
                              ?.statement ?? t('Another record')}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
              </dl>
              {record.claim && (
                <details className="disclosure">
                  <summary>{t('Structured claim')}</summary>
                  <dl className="field-list">
                    <div>
                      <dt>{t('Subject')}</dt>
                      <dd>{nameOf(record.claim.subjectId)}</dd>
                    </div>
                    <div>
                      <dt>{t('Aspect')}</dt>
                      <dd>{readableLabel(record.claim.aspect, t)}</dd>
                    </div>
                    <div>
                      <dt>{t('Value')}</dt>
                      <dd>
                        {references.some((entry) => entry.entityId === record.claim?.value)
                          ? nameOf(record.claim.value)
                          : /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(record.claim.value)
                            ? t('Unidentified object')
                            : record.claim.value}
                      </dd>
                    </div>
                  </dl>
                </details>
              )}
              {record.origin && (
                <details className="disclosure">
                  <summary>{t('Provenance')}</summary>
                  <dl className="field-list">
                    <div>
                      <dt>{t('Event sequence')}</dt>
                      <dd>{record.origin.sequence}</dd>
                    </div>
                    <div>
                      <dt>{t('Recorded at')}</dt>
                      <dd>
                        {new Intl.DateTimeFormat(language, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(record.origin.recordedAt))}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('World time')}</dt>
                      <dd>{formatWorldTime(record.origin.worldTime, t)}</dd>
                    </div>
                  </dl>
                </details>
              )}
            </details>
          </article>
        </li>
      ))}
    </ul>
  );
}

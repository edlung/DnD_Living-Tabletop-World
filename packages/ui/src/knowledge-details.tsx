import type { KnowledgeScope, KnowledgeType, KnowledgeView } from '@ltw/contracts';
import type { ReactNode } from 'react';

import { readableLabel } from './labels.ts';
import { StatusPanel } from './status-panel.tsx';
import { useLanguage, useT, type Translate } from './i18n.tsx';

export interface KnowledgeDetailsProps {
  readonly knowledge: readonly KnowledgeView[];
  /** A decorative mark shown before each type's word (the client's glyph); never the type itself. */
  readonly typeMark?: (type: KnowledgeType) => ReactNode;
}

function scopeLabel(t: Translate, scope: KnowledgeScope): string {
  if (scope.kind === 'CHARACTER') return t('Character: {id}', { id: scope.characterId });
  if (scope.kind === 'NPC') return t('NPC: {id}', { id: scope.npcId });
  return readableLabel(scope.kind, t);
}

/**
 * Display the projection's epistemic types verbatim, including conflicting statements. Each
 * record is a card: the type's word (with the client's mark), the statement, its attribution,
 * and its details and provenance on demand.
 */
export function KnowledgeDetails({ knowledge, typeMark }: KnowledgeDetailsProps) {
  const t = useT();
  const language = useLanguage();
  if (knowledge.length === 0) {
    return (
      <StatusPanel state="empty" label={t('No knowledge is available in this perspective.')} />
    );
  }
  return (
    <ul className="record-list knowledge-list">
      {knowledge.map((record) => (
        <li key={record.knowledgeId}>
          <article
            className={`knowledge-record knowledge-record--${record.knowledgeType.toLowerCase()}`}
          >
            <span className={`badge badge--${record.knowledgeType.toLowerCase()}`}>
              {typeMark?.(record.knowledgeType)}
              {t(record.knowledgeType)}
            </span>
            <p className="knowledge-statement">{record.statement}</p>
            {record.attributedTo ? (
              <p className="knowledge-attribution">
                {t('Attributed to {name}', { name: record.attributedTo.name })}
              </p>
            ) : null}
            <details className="disclosure">
              <summary>{t('Record details')}</summary>
              <dl className="field-list">
                <div>
                  <dt>{t('Record')}</dt>
                  <dd>
                    <code>{record.knowledgeId}</code>
                  </dd>
                </div>
                <div>
                  <dt>{t('Scope')}</dt>
                  <dd>{scopeLabel(t, record.scope)}</dd>
                </div>
                <div>
                  <dt>{t('Known since')}</dt>
                  <dd>
                    {record.knownSince === null
                      ? t('Before recorded history')
                      : t('World time {time}', { time: record.knownSince })}
                  </dd>
                </div>
                <div>
                  <dt>{t('Subjects')}</dt>
                  <dd>
                    {record.subjects.length === 0 ? (
                      t('None recorded')
                    ) : (
                      <ul>
                        {record.subjects.map((subject) => (
                          <li key={subject.entityId}>
                            {subject.name} ({readableLabel(subject.kind, t)}) ·{' '}
                            <code>{subject.entityId}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                {record.attributedTo ? (
                  <div>
                    <dt>{t('Attribution')}</dt>
                    <dd>
                      {record.attributedTo.name} ({readableLabel(record.attributedTo.kind, t)}) ·{' '}
                      <code>{record.attributedTo.entityId}</code>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t('Relations')}</dt>
                  <dd>
                    {record.relations.length === 0 ? (
                      t('None recorded')
                    ) : (
                      <ul>
                        {record.relations.map((relation, index) => (
                          <li key={`${relation.type}-${relation.knowledgeId}-${index}`}>
                            {readableLabel(relation.type, t)} · <code>{relation.knowledgeId}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
              {record.claim ? (
                <details className="disclosure">
                  <summary>{t('Structured claim')}</summary>
                  <dl className="field-list">
                    <div>
                      <dt>{t('Subject')}</dt>
                      <dd>
                        <code>{record.claim.subjectId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('Aspect')}</dt>
                      <dd>{record.claim.aspect}</dd>
                    </div>
                    <div>
                      <dt>{t('Value')}</dt>
                      <dd>{record.claim.value}</dd>
                    </div>
                  </dl>
                </details>
              ) : null}
              {record.origin ? (
                <details className="disclosure">
                  <summary>{t('Provenance')}</summary>
                  <dl className="field-list">
                    <div>
                      <dt>{t('Event sequence')}</dt>
                      <dd>{record.origin.sequence}</dd>
                    </div>
                    <div>
                      <dt>{t('Command')}</dt>
                      <dd>
                        <code>{record.origin.commandId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('Actor')}</dt>
                      <dd>
                        <code>{record.origin.actorId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('Recorded at')}</dt>
                      <dd>
                        <time dateTime={record.origin.recordedAt}>
                          {new Date(record.origin.recordedAt).toLocaleString(language)}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('World time')}</dt>
                      <dd>{record.origin.worldTime}</dd>
                    </div>
                  </dl>
                </details>
              ) : null}
            </details>
          </article>
        </li>
      ))}
    </ul>
  );
}

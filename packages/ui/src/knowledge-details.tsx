import type { KnowledgeScope, KnowledgeView } from '@ltw/contracts';

import { readableLabel } from './labels.ts';
import { StatusPanel } from './status-panel.tsx';

export interface KnowledgeDetailsProps {
  readonly knowledge: readonly KnowledgeView[];
}

function scopeLabel(scope: KnowledgeScope): string {
  if (scope.kind === 'CHARACTER') return `Character: ${scope.characterId}`;
  if (scope.kind === 'NPC') return `NPC: ${scope.npcId}`;
  return readableLabel(scope.kind);
}

/** Display the projection's epistemic types verbatim, including conflicting statements. */
export function KnowledgeDetails({ knowledge }: KnowledgeDetailsProps) {
  if (knowledge.length === 0) {
    return <StatusPanel state="empty" label="No knowledge is available in this perspective." />;
  }
  return (
    <ul className="record-list knowledge-list">
      {knowledge.map((record) => (
        <li key={record.knowledgeId}>
          <article className="knowledge-record">
            <span className={`badge badge--${record.knowledgeType.toLowerCase()}`}>
              {record.knowledgeType}
            </span>
            <p>{record.statement}</p>
            {record.attributedTo ? <p>Attributed to {record.attributedTo.name}</p> : null}
            <details className="disclosure">
              <summary>Record details</summary>
              <dl className="field-list">
                <div>
                  <dt>Record</dt>
                  <dd>
                    <code>{record.knowledgeId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Scope</dt>
                  <dd>{scopeLabel(record.scope)}</dd>
                </div>
                <div>
                  <dt>Known since</dt>
                  <dd>
                    {record.knownSince === null
                      ? 'Before recorded history'
                      : `World time ${record.knownSince}`}
                  </dd>
                </div>
                <div>
                  <dt>Subjects</dt>
                  <dd>
                    {record.subjects.length === 0 ? (
                      'None recorded'
                    ) : (
                      <ul>
                        {record.subjects.map((subject) => (
                          <li key={subject.entityId}>
                            {subject.name} ({readableLabel(subject.kind)}) ·{' '}
                            <code>{subject.entityId}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                {record.attributedTo ? (
                  <div>
                    <dt>Attribution</dt>
                    <dd>
                      {record.attributedTo.name} ({readableLabel(record.attributedTo.kind)}) ·{' '}
                      <code>{record.attributedTo.entityId}</code>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>Relations</dt>
                  <dd>
                    {record.relations.length === 0 ? (
                      'None recorded'
                    ) : (
                      <ul>
                        {record.relations.map((relation, index) => (
                          <li key={`${relation.type}-${relation.knowledgeId}-${index}`}>
                            {readableLabel(relation.type)} · <code>{relation.knowledgeId}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
              {record.claim ? (
                <details className="disclosure">
                  <summary>Structured claim</summary>
                  <dl className="field-list">
                    <div>
                      <dt>Subject</dt>
                      <dd>
                        <code>{record.claim.subjectId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Aspect</dt>
                      <dd>{record.claim.aspect}</dd>
                    </div>
                    <div>
                      <dt>Value</dt>
                      <dd>{record.claim.value}</dd>
                    </div>
                  </dl>
                </details>
              ) : null}
              {record.origin ? (
                <details className="disclosure">
                  <summary>Provenance</summary>
                  <dl className="field-list">
                    <div>
                      <dt>Event sequence</dt>
                      <dd>{record.origin.sequence}</dd>
                    </div>
                    <div>
                      <dt>Command</dt>
                      <dd>
                        <code>{record.origin.commandId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Actor</dt>
                      <dd>
                        <code>{record.origin.actorId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Recorded at</dt>
                      <dd>{record.origin.recordedAt}</dd>
                    </div>
                    <div>
                      <dt>World time</dt>
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

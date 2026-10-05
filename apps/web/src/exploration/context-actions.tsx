import type {
  ContextAction,
  EntityContextResponse,
  EntityRef,
  KnowledgeView,
} from '@ltw/contracts';
import { useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { commandFor } from './action-bindings.ts';
import { ConversationOptions } from './conversation-options.tsx';
import { Hypothesis } from './hypothesis.tsx';
import { Recall } from './recall.tsx';
import type { ExplorationIntent } from './use-action.ts';
import { useT, type Translate } from '@ltw/ui';

const executable = new Set([
  'talk',
  'ask_about',
  'show_evidence',
  'inspect',
  'investigation_check',
  'perception_check',
  'detect_magic',
  'enter_location',
  'recall',
]);

export function ContextActions({
  api,
  context,
  directory,
  knowledge,
  canAct,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly context: EntityContextResponse;
  readonly directory: readonly EntityRef[];
  readonly knowledge: readonly KnowledgeView[];
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const [recall, setRecall] = useState(false);
  const { entity, actions } = context.context;
  const actor = context.actingCharacterId;
  const name = entity.name ?? t('Unidentified {kind}', { kind: t(entity.kind) });
  return (
    <section className="exploration-actions" aria-label={t('Contextual actions')}>
      <h3>{t('What would you like to do?')}</h3>
      {!canAct && (
        <p className="muted">
          {t("This is a read-only view. Use your character's session outside an encounter to act.")}
        </p>
      )}
      <div className="context-buttons">
        {actions
          .filter((action) => executable.has(action.id))
          .map((action, index) => {
            const command = commandFor(action, actor, entity.entityId);
            const isRecall = action.id === 'recall';
            const available =
              action.legal &&
              (isRecall || (canAct && !locked && (command !== null || action.id === 'talk')));
            return (
              <div className="context-option" key={`${action.id}:${index}`}>
                <button
                  disabled={!available}
                  onClick={() => {
                    if (isRecall) setRecall((open) => !open);
                    else if (action.id === 'talk')
                      onRun({ kind: 'talk', characterId: actor, npcId: entity.entityId });
                    else if (command) onRun({ kind: 'command', command });
                  }}
                >
                  {label(t, action, name, knowledge)}
                </button>
                {!action.legal && (
                  <small>
                    {t(action.reason?.replaceAll('_', ' ').toLowerCase() ?? 'Unavailable')}
                  </small>
                )}
                {action.cost && (
                  <small>
                    {action.cost.kind === 'free'
                      ? t('Free cast')
                      : t('Level {level} slot', { level: action.cost.slotLevel })}
                  </small>
                )}
              </div>
            );
          })}
      </div>
      {recall && <Recall api={api} entityId={entity.entityId} />}
      {canAct && entity.kind === 'npc' && (
        <ConversationOptions
          api={api}
          directory={directory}
          characterId={actor}
          npcId={entity.entityId}
          locked={locked}
          onRun={onRun}
        />
      )}
      {canAct && directory.some((ref) => ref.entityId === entity.entityId) && (
        <Hypothesis characterId={actor} entityId={entity.entityId} locked={locked} onRun={onRun} />
      )}
      <details className="disclosure">
        <summary>{t('All contextual options')}</summary>
        <ul className="context-actions">
          {actions.map((action, index) => (
            <li key={`${action.id}:${index}`}>
              <strong>{label(t, action, name, knowledge)}</strong>
              <span>
                {action.legal
                  ? t('Available in the world')
                  : t(action.reason?.replaceAll('_', ' ').toLowerCase() ?? 'Unavailable')}
              </span>
              {action.hints?.map((hint) => (
                <small key={hint}>{t(hint.replaceAll('_', ' ').toLowerCase())}</small>
              ))}
              {action.resolution?.moveRequiredFt !== undefined && (
                <small>
                  {t('Move required: {feet} ft', { feet: action.resolution.moveRequiredFt })}
                </small>
              )}
              {action.area && (
                <small>
                  {t('Affected: {names}', {
                    names:
                      action.area.affected
                        .map((ref) => ref.name ?? t('Unidentified creature'))
                        .join(', ') || t('None'),
                  })}
                </small>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function label(
  t: Translate,
  action: ContextAction,
  target: string,
  knowledge: readonly KnowledgeView[],
): string {
  switch (action.id) {
    case 'ask_about':
      return t('Ask about {topic}', { topic: action.topic?.name ?? t('Unidentified subject') });
    case 'show_evidence':
      return t('Show evidence: {statement}', {
        statement:
          knowledge.find((record) => record.knowledgeId === action.evidence?.knowledgeId)
            ?.statement ?? t('Known evidence'),
      });
    case 'enter_location':
      return t('Enter {place}', { place: target });
    case 'inspect':
      return t('Inspect');
    case 'investigation_check':
      return t('Investigate');
    case 'perception_check':
      return t('Perception check');
    case 'detect_magic':
      return t('Detect magic');
    case 'recall':
      return t('Recall memories');
    case 'talk':
      return t('Talk');
    default:
      return t(action.id.replaceAll('_', ' '));
  }
}

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
  const [recall, setRecall] = useState(false);
  const { entity, actions } = context.context;
  const actor = context.actingCharacterId;
  const name = entity.name ?? `Unidentified ${entity.kind}`;
  return (
    <section className="exploration-actions" aria-label="Contextual actions">
      <h3>What would you like to do?</h3>
      {!canAct && (
        <p className="muted">
          This is a read-only view. Use your character's session outside an encounter to act.
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
                  {label(action, name, knowledge)}
                </button>
                {!action.legal && (
                  <small>
                    {action.reason?.replaceAll('_', ' ').toLowerCase() ?? 'Unavailable'}
                  </small>
                )}
                {action.cost && (
                  <small>
                    {action.cost.kind === 'free'
                      ? 'Free cast'
                      : `Level ${action.cost.slotLevel} slot`}
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
        <summary>All contextual options</summary>
        <ul className="context-actions">
          {actions.map((action, index) => (
            <li key={`${action.id}:${index}`}>
              <strong>{label(action, name, knowledge)}</strong>
              <span>
                {action.legal
                  ? 'Available in the world'
                  : action.reason?.replaceAll('_', ' ').toLowerCase()}
              </span>
              {action.hints?.map((hint) => (
                <small key={hint}>{hint.replaceAll('_', ' ').toLowerCase()}</small>
              ))}
              {action.resolution?.moveRequiredFt !== undefined && (
                <small>Move required: {action.resolution.moveRequiredFt} ft</small>
              )}
              {action.area && (
                <small>
                  Affected:{' '}
                  {action.area.affected
                    .map((ref) => ref.name ?? 'Unidentified creature')
                    .join(', ') || 'None'}
                </small>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function label(action: ContextAction, target: string, knowledge: readonly KnowledgeView[]): string {
  switch (action.id) {
    case 'ask_about':
      return `Ask about ${action.topic?.name ?? 'Unidentified subject'}`;
    case 'show_evidence':
      return `Show evidence: ${knowledge.find((record) => record.knowledgeId === action.evidence?.knowledgeId)?.statement ?? 'Known evidence'}`;
    case 'enter_location':
      return `Enter ${target}`;
    case 'inspect':
      return 'Inspect';
    case 'investigation_check':
      return 'Investigate';
    case 'perception_check':
      return 'Perception check';
    case 'detect_magic':
      return 'Detect magic';
    case 'recall':
      return 'Recall memories';
    case 'talk':
      return 'Talk';
    default:
      return action.id.replaceAll('_', ' ');
  }
}

import type {
  ContextAction,
  EntityContextResponse,
  EntityRef,
  KnowledgeView,
} from '@ltw/contracts';
import { useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { actionGlyph } from '../visual/glyph-map.ts';
import { commandFor } from './action-bindings.ts';
import { ConversationOptions } from './conversation-options.tsx';
import { Hypothesis } from './hypothesis.tsx';
import { Recall } from './recall.tsx';
import type { ExplorationIntent } from './use-action.ts';
import { useT, type Translate } from '@ltw/ui';

export const executable: ReadonlySet<string> = new Set([
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

/**
 * Conversation choices among the server-listed actions. While the conversation with this NPC is
 * shown, they live in its panel only: this list collapses them, so each control exists once.
 */
export const CONVERSATION: ReadonlySet<string> = new Set(['talk', 'ask_about', 'show_evidence']);

/** Why the server says an action is unavailable, in words (its fixed reason vocabulary). */
export const reasonWords = (t: Translate, action: ContextAction): string =>
  t(action.reason?.replaceAll('_', ' ').toLowerCase() ?? 'Unavailable');

export function ContextActions({
  api,
  context,
  directory,
  knowledge,
  canAct,
  locked,
  conversing,
  onShowConversation,
  onRun,
}: {
  readonly api: WorldApi;
  readonly context: EntityContextResponse;
  readonly directory: readonly EntityRef[];
  readonly knowledge: readonly KnowledgeView[];
  readonly canAct: boolean;
  readonly locked: boolean;
  /** The conversation with this NPC is shown: its options live there. */
  readonly conversing: boolean;
  readonly onShowConversation: () => void;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const [recall, setRecall] = useState(false);
  const { entity, actions } = context.context;
  const actor = context.actingCharacterId;
  const name = entity.name ?? t('Unidentified {kind}', { kind: t(entity.kind) });
  const listed = actions.filter(
    (action) => executable.has(action.id) && !(conversing && CONVERSATION.has(action.id)),
  );
  return (
    <section className="exploration-actions" aria-label={t('Contextual actions')}>
      <h3>{t('What would you like to do?')}</h3>
      {!canAct && (
        <p className="muted">
          {t("This is a read-only view. Use your character's session outside an encounter to act.")}
        </p>
      )}
      {conversing && (
        <div className="conversation-note">
          <Glyph name="talk" />
          <p>{t('What you can say to {name} is in your conversation.', { name })}</p>
          <button type="button" className="conversation-go" onClick={onShowConversation}>
            {t('Go to the conversation')}
          </button>
        </div>
      )}
      <div className="context-buttons">
        {listed.map((action, index) => {
          const command = commandFor(action, actor, entity.entityId);
          const isRecall = action.id === 'recall';
          const available =
            action.legal &&
            (isRecall || (canAct && !locked && (command !== null || action.id === 'talk')));
          const reasonId = `${ids}-reason-${String(index)}`;
          return (
            <div className="context-option" key={`${action.id}:${index}`}>
              <button
                disabled={!available}
                aria-describedby={action.legal ? undefined : reasonId}
                onClick={() => {
                  if (isRecall) setRecall((open) => !open);
                  else if (action.id === 'talk')
                    onRun({ kind: 'talk', characterId: actor, npcId: entity.entityId });
                  else if (command) onRun({ kind: 'command', command });
                }}
              >
                <Glyph name={actionGlyph(action.id)} />
                <span>{actionLabel(t, action, name, knowledge)}</span>
              </button>
              {!action.legal && <small id={reasonId}>{reasonWords(t, action)}</small>}
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
              <strong>
                <Glyph name={actionGlyph(action.id)} />
                {actionLabel(t, action, name, knowledge)}
              </strong>
              <span>{action.legal ? t('Available in the world') : reasonWords(t, action)}</span>
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

/** The words of a server-listed action, as its button says them. */
export function actionLabel(
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

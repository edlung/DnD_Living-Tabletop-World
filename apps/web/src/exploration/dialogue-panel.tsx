import type {
  ContextAction,
  EntityContextResponse,
  EntityRef,
  KnowledgeView,
  PlayerAssetView,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { actionGlyph } from '../visual/glyph-map.ts';
import { IconButton } from '../visual/icon-button.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { commandFor } from './action-bindings.ts';
import { actionLabel, CONVERSATION, reasonWords } from './context-actions.tsx';
import type { ExplorationIntent } from './use-action.ts';

/** The conversation panel's element, which "Go to the conversation" focuses. */
export const CONVERSATION_PANEL_ID = 'conversation-panel';

/**
 * A conversation in the scene (docs/STAGE_320_DESIGN.md §5.3). It reads the NPC's context when
 * it opens and again, in the background, after each of the viewer's own actions (`revision`)
 * and each live signal, so its options always follow what the server lists now; the World
 * Engine decides each again when it is chosen.
 */
export function DialoguePanel({
  api,
  npcId,
  revision,
  line,
  image,
  directory,
  knowledge,
  actorId,
  canAct,
  locked,
  onRun,
  onLeave,
}: {
  readonly api: WorldApi;
  readonly npcId: string;
  /** The world screen's count of the viewer's own actions. */
  readonly revision: number;
  /** The NPC's last spoken line in this conversation, if one was spoken. */
  readonly line: string | null;
  readonly image: PlayerAssetView | null;
  readonly directory: readonly EntityRef[];
  readonly knowledge: readonly KnowledgeView[];
  readonly actorId: string;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onLeave: () => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<EntityContextResponse>(`entities/${encodeURIComponent(npcId)}/context`, signal),
    [api, npcId],
  );
  const { resource, reread } = useResource(`dialogue:${npcId}`, load);
  useRereadOn(revision, reread);
  const name =
    directory.find((entity) => entity.entityId === npcId)?.name ??
    t('Unidentified {kind}', { kind: t('npc') });
  return (
    <DialogueView
      name={name}
      npcId={npcId}
      line={line}
      image={image}
      options={
        resource.status === 'ready'
          ? resource.value.context.actions.filter((action) => CONVERSATION.has(action.id))
          : []
      }
      knowledge={knowledge}
      actorId={actorId}
      canAct={canAct}
      locked={locked}
      onRun={onRun}
      onLeave={onLeave}
    />
  );
}

/**
 * What the conversation shows: the speaker's portrait, "Says: <name>" and the spoken line in
 * quotation marks — table prose, never a recorded fact — in a polite live region, so the words
 * are announced once, here (the result notice then leaves them out); the player's options as
 * numbered rows, each unavailable one with the server's reason beside it.
 */
export function DialogueView({
  name,
  npcId,
  line,
  image,
  options,
  knowledge,
  actorId,
  canAct,
  locked,
  onRun,
  onLeave,
}: {
  readonly name: string;
  readonly npcId: string;
  readonly line: string | null;
  readonly image: PlayerAssetView | null;
  /** The server-listed conversation actions for this NPC now. */
  readonly options: readonly ContextAction[];
  readonly knowledge: readonly KnowledgeView[];
  readonly actorId: string;
  readonly canAct: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onLeave: () => void;
}) {
  const t = useT();
  const ids = useId();
  return (
    <section
      id={CONVERSATION_PANEL_ID}
      className="dialogue-panel"
      aria-label={t('Conversation with {name}', { name })}
      tabIndex={-1}
    >
      <header className="dialogue-header">
        <Medallion image={image} kind="npc" size="md" />
        <div>
          <p className="eyebrow">{t('Conversation')}</p>
          <h3>{line ? t('Says: {name}', { name }) : name}</h3>
        </div>
        <IconButton
          glyph="close"
          className="dialogue-leave"
          label={t('Leave the conversation')}
          onClick={onLeave}
        />
      </header>
      <div className="dialogue-speech" aria-live="polite" aria-atomic="true">
        {line && (
          <blockquote className="dialogue-line">
            <p>{t('“{line}”', { line })}</p>
            <footer>{t('Spoken, not a recorded fact.')}</footer>
          </blockquote>
        )}
      </div>
      {options.length > 0 && (
        <ol className="dialogue-options" aria-label={t('What to say')}>
          {options.map((action, index) => {
            const command = commandFor(action, actorId, npcId);
            const available =
              action.legal && canAct && !locked && (command !== null || action.id === 'talk');
            const reasonId = `${ids}-reason-${String(index)}`;
            return (
              <li key={`${action.id}:${String(index)}`}>
                <button
                  type="button"
                  disabled={!available}
                  aria-describedby={action.legal ? undefined : reasonId}
                  onClick={() => {
                    if (action.id === 'talk') onRun({ kind: 'talk', characterId: actorId, npcId });
                    else if (command) onRun({ kind: 'command', command });
                  }}
                >
                  <span className="option-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <Glyph name={actionGlyph(action.id)} />
                  <span>
                    {action.id === 'talk'
                      ? t('Keep talking')
                      : actionLabel(t, action, name, knowledge)}
                  </span>
                </button>
                {!action.legal && (
                  <small className="option-reason" id={reasonId}>
                    {reasonWords(t, action)}
                  </small>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

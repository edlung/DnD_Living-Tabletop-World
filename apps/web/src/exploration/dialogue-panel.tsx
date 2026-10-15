import type {
  EntityContextResponse,
  EntityRef,
  KnowledgeView,
  PlayerAssetView,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { actionGlyph } from '../visual/glyph-map.ts';
import { IconButton } from '../visual/icon-button.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { commandFor } from './action-bindings.ts';
import { actionLabel } from './context-actions.tsx';
import type { ExplorationIntent } from './use-action.ts';

/** Conversation choices among the server-listed actions; every other stays in the details. */
const CONVERSATION = new Set(['talk', 'ask_about', 'show_evidence']);

/**
 * A conversation in the scene (docs/STAGE_320_DESIGN.md §5.3): the speaker's portrait, "Says:
 * <name>" and the spoken line in quotation marks — table prose, never a recorded fact — with
 * the player's options as numbered rows beneath. The options are exactly the actions the
 * server lists for this NPC now; the World Engine decides each again when it is chosen.
 */
export function DialoguePanel({
  api,
  npcId,
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
  const { resource } = useResource(`dialogue:${npcId}`, load);
  const name =
    directory.find((entity) => entity.entityId === npcId)?.name ??
    t('Unidentified {kind}', { kind: t('npc') });
  const options =
    resource.status === 'ready'
      ? resource.value.context.actions.filter((action) => CONVERSATION.has(action.id))
      : [];
  return (
    <section className="dialogue-panel" aria-label={t('Conversation with {name}', { name })}>
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
      {line && (
        <blockquote className="dialogue-line">
          <p>{t('“{line}”', { line })}</p>
          <footer>{t('Spoken, not a recorded fact.')}</footer>
        </blockquote>
      )}
      {options.length > 0 && (
        <ol className="dialogue-options" aria-label={t('What to say')}>
          {options.map((action, index) => {
            const command = commandFor(action, actorId, npcId);
            const available =
              action.legal && canAct && !locked && (command !== null || action.id === 'talk');
            return (
              <li key={`${action.id}:${String(index)}`}>
                <button
                  type="button"
                  disabled={!available}
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
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

import type { QuestListResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { formatWorldTime } from '../dm/world-time.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from './use-world-data.ts';

/**
 * The party's quests in the Journal (Stage 530): each quest's steps as the party lived them, in
 * world-time order, and whether it is done. The log is the server's projection of the party's own
 * history (ADR 0025 §2); a perspective outside the party reads none.
 */
export function JournalQuests({
  api,
  revision,
}: {
  readonly api: WorldApi;
  readonly revision: number;
}) {
  const t = useT();
  const id = useId();
  const load = useCallback(
    (signal: AbortSignal) => api.get<QuestListResponse>('quests', signal),
    [api],
  );
  const { resource, reread } = useResource('quests', load);
  useRereadOn(revision, reread);
  if (resource.status !== 'ready') return null;
  const { quests } = resource.value;
  return (
    <section className="sheet-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t('Quests')}</h3>
      {quests.length === 0 && <p className="muted">{t('No quest has begun yet.')}</p>}
      {quests.map((quest, index) => {
        const done = quest.status === 'completed';
        return (
          <article
            key={quest.questId}
            className={`quest-card${done ? ' quest-card--done' : ''}`}
            aria-labelledby={`${id}-quest-${String(index)}`}
          >
            <header className="quest-head">
              <h4 id={`${id}-quest-${String(index)}`}>{quest.title}</h4>
              <span className="quest-status">
                <Glyph name={done ? 'confirm' : 'bookmark'} />
                {done ? t('Completed') : t('In progress')}
              </span>
            </header>
            <ol className="quest-steps">
              {quest.transitions.map((step) => (
                <li
                  key={step.stage}
                  className={step.type === 'QuestCompleted' ? 'quest-step is-final' : 'quest-step'}
                >
                  <span className="quest-when">{formatWorldTime(step.worldTime, t)}</span>
                  <span className="quest-summary">{step.summary}</span>
                </li>
              ))}
            </ol>
          </article>
        );
      })}
    </section>
  );
}
